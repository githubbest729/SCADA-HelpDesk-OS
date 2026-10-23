/* SCADA HelpDesk OS — IndexedDB engine (multi-store, versioned, cursor-paginated) */
(function (global) {
  'use strict';
  const DB_NAME = 'SCADA_HelpDesk_OS_DB';
  const DB_VERSION = 2;

  const STORES = {
    tickets: { keyPath: 'id', indexes: [
      ['ticketNumber', 'ticketNumber', { unique: true }], ['status', 'status'], ['priority', 'priority'],
      ['siteName', 'siteName'], ['protocol', 'protocol'], ['createdAt', 'createdAt'], ['updatedAt', 'updatedAt'],
      ['status_updatedAt', ['status', 'updatedAt']], ['priority_createdAt', ['priority', 'createdAt']]
    ] },
    diagnostics: { keyPath: 'id', indexes: [
      ['ticketId', 'ticketId'], ['timestamp', 'timestamp'], ['diagnosticType', 'diagnosticType'],
      ['type_timestamp', ['diagnosticType', 'timestamp']]
    ] },
    knowledge_base: { keyPath: 'id', indexes: [['category', 'category'], ['tags', 'tags', { multiEntry: true }], ['updatedAt', 'updatedAt']] },
    training_sessions: { keyPath: 'id', indexes: [['date', 'date'], ['module', 'module']] },
    sites_bom: { keyPath: 'id', indexes: [['name', 'name'], ['sector', 'sector']] },
    qhse_audits: { keyPath: 'id', indexes: [['ticketId', 'ticketId'], ['timestamp', 'timestamp']] },
    cold_archive: { keyPath: 'id', indexes: [['ticketNumber', 'ticketNumber'], ['archivedAt', 'archivedAt'], ['siteName', 'siteName']] },
    meta: { keyPath: 'key', indexes: [] }
  };

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = req.result;
        const tx = req.transaction;
        // Create missing stores / indexes (v1 -> v2 and fresh install both handled idempotently).
        Object.keys(STORES).forEach((name) => {
          const def = STORES[name];
          const store = db.objectStoreNames.contains(name)
            ? tx.objectStore(name)
            : db.createObjectStore(name, { keyPath: def.keyPath });
          def.indexes.forEach((ix) => {
            if (!store.indexNames.contains(ix[0])) store.createIndex(ix[0], ix[1], ix[2] || {});
          });
        });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database upgrade blocked by another tab'));
    });
    return dbPromise;
  }

  function wrap(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function tx(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let result;
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
      Promise.resolve(fn(t)).then((r) => { result = r; }).catch((e) => { try { t.abort(); } catch (_) {} reject(e); });
    });
  }

  const get = (store, id) => tx(store, 'readonly', (t) => wrap(t.objectStore(store).get(id)));
  const put = (store, val) => tx(store, 'readwrite', (t) => wrap(t.objectStore(store).put(val)));
  const del = (store, id) => tx(store, 'readwrite', (t) => wrap(t.objectStore(store).delete(id)));
  const count = (store) => tx(store, 'readonly', (t) => wrap(t.objectStore(store).count()));
  const countIndex = (store, index, range) => tx(store, 'readonly', (t) => wrap(t.objectStore(store).index(index).count(range)));
  const clear = (store) => tx(store, 'readwrite', (t) => wrap(t.objectStore(store).clear()));

  function delMany(store, ids) {
    return tx(store, 'readwrite', (t) => {
      const os = t.objectStore(store);
      ids.forEach((id) => os.delete(id));
    });
  }

  function putMany(store, items) {
    return tx(store, 'readwrite', (t) => {
      const os = t.objectStore(store);
      items.forEach((it) => os.put(it));
    });
  }

  function getAll(store, limit) {
    return tx(store, 'readonly', (t) => wrap(t.objectStore(store).getAll(null, limit || undefined)));
  }

  /**
   * Cursor pagination over an index (newest first by default).
   * filter(record) -> boolean is applied during iteration so only matched rows are materialised.
   * Stops as soon as the page is full and one more match proves hasMore, so first-page queries stay fast
   * regardless of table size. Pass needTotal:true (e.g. limit:0 counting) to scan everything.
   * Returns { rows, total (matched so far, capped), hasMore }.
   */
  function page(store, opts) {
    const o = Object.assign({ index: null, direction: 'prev', offset: 0, limit: 25, filter: null, range: null, countCap: 100000 }, opts || {});
    return tx(store, 'readonly', (t) => new Promise((resolve, reject) => {
      const os = t.objectStore(store);
      const src = o.index ? os.index(o.index) : os;
      const req = src.openCursor(o.range, o.direction);
      const rows = [];
      let matched = 0;
      let skipped = 0;
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve({ rows, total: matched, hasMore: false });
        const v = cur.value;
        if (!o.filter || o.filter(v)) {
          matched++;
          if (skipped < o.offset) skipped++;
          else if (rows.length < o.limit) rows.push(v);
          else if (!o.needTotal) return resolve({ rows, total: matched, hasMore: true }); // page full and one more match exists: stop early
          if (matched >= o.countCap) return resolve({ rows, total: matched, hasMore: true });
        }
        cur.continue();
      };
    }));
  }

  /** Iterate every record in chunks (used for streaming export and compaction). */
  async function forEachChunk(store, chunkSize, cb) {
    let lastKey = null;
    for (;;) {
      const batch = await tx(store, 'readonly', (t) => new Promise((resolve, reject) => {
        const range = lastKey === null ? null : IDBKeyRange.lowerBound(lastKey, true);
        const req = t.objectStore(store).openCursor(range);
        const out = [];
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const c = req.result;
          if (!c || out.length >= chunkSize) return resolve(out);
          out.push(c.value);
          c.continue();
        };
      }));
      if (!batch.length) break;
      lastKey = batch[batch.length - 1][STORES[store].keyPath];
      await cb(batch);
      if (batch.length < chunkSize) break;
    }
  }

  function byIndex(store, indexName, value) {
    return tx(store, 'readonly', (t) => wrap(t.objectStore(store).index(indexName).getAll(value)));
  }

  async function getMeta(key, dflt) {
    const r = await get('meta', key);
    return r ? r.value : dflt;
  }
  const setMeta = (key, value) => put('meta', { key, value });

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function nextTicketNumber() {
    const n = (await getMeta('ticketSeq', 1000)) + 1;
    await setMeta('ticketSeq', n);
    return 'AGAC-' + new Date().getFullYear() + '-' + String(n).padStart(5, '0');
  }

  /** Approximate JSON byte size of a record sample for telemetry. */
  async function averageBytes(store, sample) {
    const rows = await getAll(store, sample || 200);
    if (!rows.length) return 0;
    let total = 0;
    rows.forEach((r) => { total += new Blob([JSON.stringify(r)]).size; });
    return Math.round(total / rows.length);
  }

  async function storesSummary() {
    const out = {};
    for (const name of Object.keys(STORES)) {
      if (name === 'meta') continue;
      out[name] = await count(name);
    }
    return out;
  }

  /** Move closed tickets older than `days` into cold_archive (JSON-compressed when supported). */
  async function compactCold(days, onProgress) {
    const cutoff = Date.now() - days * 86400000;
    let moved = 0;
    let bytesBefore = 0;
    let bytesAfter = 0;
    const candidates = [];
    await forEachChunk('tickets', 500, async (rows) => {
      rows.forEach((r) => {
        if (r.status === 'Closed' && r.updatedAt < cutoff) candidates.push(r);
      });
    });
    for (let i = 0; i < candidates.length; i += 200) {
      const slice = candidates.slice(i, i + 200);
      const packed = [];
      for (const r of slice) {
        const json = JSON.stringify(r);
        bytesBefore += json.length;
        const blob = await compressString(json);
        bytesAfter += blob.size;
        packed.push({ id: r.id, ticketNumber: r.ticketNumber, siteName: r.siteName, title: r.title, closedAt: r.updatedAt, archivedAt: Date.now(), blob });
      }
      await tx(['cold_archive', 'tickets'], 'readwrite', (t) => {
        packed.forEach((p) => t.objectStore('cold_archive').put(p));
        slice.forEach((r) => t.objectStore('tickets').delete(r.id));
      });
      moved += slice.length;
      if (onProgress) onProgress(moved, candidates.length);
    }
    return { moved, bytesBefore, bytesAfter };
  }

  async function compressString(str) {
    if (typeof CompressionStream === 'function') {
      const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
      return await new Response(stream).blob();
    }
    return new Blob([str], { type: 'application/json' });
  }

  async function decompressBlob(blob) {
    if (typeof DecompressionStream === 'function' && blob.type !== 'application/json') {
      try {
        const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).text();
      } catch (_) { /* fall through to plain text */ }
    }
    return await blob.text();
  }

  async function restoreFromCold(id) {
    const rec = await get('cold_archive', id);
    if (!rec) return null;
    const t = JSON.parse(await decompressBlob(rec.blob));
    await tx(['tickets', 'cold_archive'], 'readwrite', (tr) => {
      tr.objectStore('tickets').put(t);
      tr.objectStore('cold_archive').delete(id);
    });
    return t;
  }

  /* ---------- Export / import (chunked) ---------- */
  async function exportSnapshot() {
    const parts = ['{"app":"SCADA_HelpDesk_OS","version":' + DB_VERSION + ',"exportedAt":' + Date.now() + ',"stores":{'];
    const names = Object.keys(STORES);
    for (let s = 0; s < names.length; s++) {
      const name = names[s];
      parts.push((s ? ',' : '') + JSON.stringify(name) + ':[');
      let first = true;
      await forEachChunk(name, 500, async (rows) => {
        for (const r of rows) {
          let rec = r;
          if (name === 'cold_archive' && r.blob instanceof Blob) {
            const buf = await r.blob.arrayBuffer();
            rec = Object.assign({}, r, { blob: { __b64: arrayBufferToB64(buf), type: r.blob.type } });
          }
          parts.push((first ? '' : ',') + JSON.stringify(rec));
          first = false;
        }
      });
      parts.push(']');
    }
    parts.push('}}');
    return new Blob(parts, { type: 'application/json' });
  }

  function arrayBufferToB64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    return btoa(s);
  }
  function b64ToBlob(b64, type) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return new Blob([bytes], { type: type || 'application/octet-stream' });
  }

  async function importSnapshot(text, onProgress) {
    const data = JSON.parse(text);
    if (!data || data.app !== 'SCADA_HelpDesk_OS' || !data.stores) throw new Error('Not a SCADA HelpDesk OS snapshot');
    let total = 0;
    for (const name of Object.keys(data.stores)) {
      if (!STORES[name]) continue;
      let rows = data.stores[name];
      if (name === 'cold_archive') {
        rows = rows.map((r) => (r.blob && r.blob.__b64) ? Object.assign({}, r, { blob: b64ToBlob(r.blob.__b64, r.blob.type) }) : r);
      }
      await clear(name);
      for (let i = 0; i < rows.length; i += 500) {
        await putMany(name, rows.slice(i, i + 500));
        total += Math.min(500, rows.length - i);
        if (onProgress) onProgress(name, total);
      }
    }
    return total;
  }

  function ticketsToCsv(rows) {
    const cols = ['ticketNumber', 'title', 'status', 'priority', 'siteName', 'protocol', 'reporter', 'assignee', 'createdAt', 'updatedAt', 'resolvedAt', 'rootCause'];
    const esc = (v) => {
      if (v === undefined || v === null) return '';
      if (typeof v === 'number' && v > 1e11) v = new Date(v).toISOString();
      const s = String(v).replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? '"' + s + '"' : s;
    };
    const lines = [cols.join(',')];
    rows.forEach((r) => lines.push(cols.map((c) => esc(r[c])).join(',')));
    return lines.join('\r\n');
  }

  async function wipeAll() {
    for (const n of Object.keys(STORES)) await clear(n);
  }

  global.DB = {
    NAME: DB_NAME, VERSION: DB_VERSION, STORES, open, get, put, del, count, countIndex, clear, putMany, delMany, getAll, page, forEachChunk,
    byIndex, getMeta, setMeta, uid, nextTicketNumber, averageBytes, storesSummary, compactCold, restoreFromCold,
    decompressBlob, exportSnapshot, importSnapshot, ticketsToCsv, wipeAll
  };
})(window);
