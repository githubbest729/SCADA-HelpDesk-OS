/* SCADA HelpDesk OS — application logic (2 workspaces + Guide + Settings) */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = DIAG.esc;
  const H = 3600000;
  const MAXN = Number.MAX_SAFE_INTEGER;
  const ACTIVE = new Set(['Open', 'In Progress']);
  const PROTOCOLS = ['OPC UA', 'OPC DA', 'Modbus TCP', 'Modbus RTU', 'Siemens S7', 'EtherNet/IP', 'Wonderware', 'SQL/Historian'];
  const CATEGORIES = ['Communications', 'Alarm Management', 'Historian', 'Scripting', 'System Platform', 'Integration', 'Performance', 'Change Request'];
  const PAGE_SIZE = 25;
  const OUT = { opc: 'opcOut', modbus: 'mbOut', wonderware: 'wwOut', plc: 'plcOut' };
  const TOOL_NAME = { opc: 'OPC Check', modbus: 'Modbus Check', wonderware: 'Wonderware Check', plc: 'PLC Check' };
  const DEFAULT_PRESET = { opc: 'comm', modbus: 'exc02', wonderware: 'flood', plc: 's7' };
  const DEFAULTS = { engineer: 'SCADA Support Engineer', company: 'Al Gurg Automation & Controls — Dubai, U.A.E.', sla: { P1: 2, P2: 4, P3: 12, P4: 24 }, hints: true, theme: 'dark', size: 'standard', welcomeDismissed: false };

  const GSTT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const GSTD = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtDT = (t) => (t ? GSTD.format(new Date(t)) + ' GST' : '—');
  const slug = (s) => String(s).replace(/\s+/g, '-');
  const dayStart = (now) => { const off = 4 * H; return Math.floor((now + off) / 86400000) * 86400000 - off; };

  let S = JSON.parse(JSON.stringify(DEFAULTS));
  const state = { page: 0, mode: 'table', quick: '', diag: {}, diagTicket: '', deferredPrompt: null, drawerTicket: null, drawerTimer: null, swReg: null, wantReload: false, hasMore: false, view: 'tickets' };

  /* ---------- helpers ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 3400);
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function fmtDur(ms, withSec) {
    const neg = ms < 0; const a = Math.abs(ms);
    const h = Math.floor(a / H), m = Math.floor((a % H) / 60000), s = Math.floor((a % 60000) / 1000);
    return (neg ? '-' : '') + h + 'h ' + String(m).padStart(2, '0') + 'm' + (withSec ? ' ' + String(s).padStart(2, '0') + 's' : '');
  }
  function fmtBytes(b) {
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
    return Math.round(b) + ' B';
  }
  const tip = (t) => '<span class="tip" tabindex="0" data-tip="' + esc(t) + '">?</span>';
  const badgeP = (p) => '<span class="badge p-' + esc(p) + '" title="' + esc(SEED.SLA[p] ? SEED.SLA[p].label : '') + '">' + esc(p) + '</span>';
  const badgeS = (s) => '<span class="badge s-' + slug(esc(s)) + '">' + esc(s) + '</span>';
  function slaInfo(t, now) {
    if (t.status === 'Resolved' || t.status === 'Closed') { const met = (t.resolvedAt || t.updatedAt) <= t.slaResolveDue; return { cls: met ? 'sla-ok' : 'sla-bad', text: met ? 'Met' : 'Missed' }; }
    const rem = t.slaResolveDue - now;
    const total = (t.slaHours || SEED.SLA[t.priority].hours) * H;
    return { cls: rem < 0 ? 'sla-bad' : rem < total * 0.25 ? 'sla-warn' : 'sla-ok', text: rem < 0 ? 'LATE ' + fmtDur(rem) : fmtDur(rem) + ' left' };
  }
  function flash(el) { if (!el) return; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 3600); }

  /* ---------- preferences ---------- */
  function applyPrefs() {
    const r = document.documentElement;
    r.dataset.theme = S.theme; r.dataset.size = S.size;
    document.body.classList.toggle('nohints', !S.hints);
    $('#themeColor').setAttribute('content', S.theme === 'light' ? '#0c4a6e' : '#0a192f');
    $('#brandSub').textContent = S.company;
  }
  async function loadPrefs() {
    const v = await DB.getMeta('prefs', null);
    if (v) S = Object.assign({}, DEFAULTS, v, { sla: Object.assign({}, DEFAULTS.sla, v.sla || {}) });
    applyPrefs();
  }
  async function savePrefs() { applyPrefs(); await DB.setMeta('prefs', S); }

  /* ---------- modal ---------- */
  function openModal(html, wide) {
    $('#modalBox').className = 'modal-box' + (wide ? ' wide' : '');
    $('#modalBox').innerHTML = html;
    $('#modal').hidden = false;
    const first = $('#modalBox input:not([type=file]), #modalBox textarea, #modalBox select');
    if (first && !wide) first.focus();
  }
  function closeModal() { $('#modal').hidden = true; $('#modalBox').innerHTML = ''; }
  function closeAll() { closeModal(); closeDrawer(); }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (window.TOUR && TOUR.active()) TOUR.stop(); else if (!$('#modal').hidden) closeModal(); else if (!$('#drawer').hidden) closeDrawer(); }
  });
  $('#modal').addEventListener('mousedown', (e) => { if (e.target === $('#modal')) closeModal(); });
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) closeModal();
    const tp = e.target.closest('.tip');
    $$('.tip.open').forEach((x) => { if (x !== tp) x.classList.remove('open'); });
    if (tp) tp.classList.toggle('open');
  });

  /* ---------- clock / network / offline cache / install ---------- */
  function startClock() { const tick = () => { $('#gstClock').textContent = GSTT.format(new Date()); }; tick(); setInterval(tick, 1000); }
  function netUpdate() { const on = navigator.onLine; $('#netDot').className = 'dot' + (on ? '' : ' off'); $('#netText').textContent = on ? 'Online' : 'Offline'; }
  function swStatus(txt, cls) { $('#swText').textContent = 'Offline: ' + txt; $('#swDot').className = 'dot' + (cls ? ' ' + cls : ''); }
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return swStatus('not supported', 'off');
    if (location.protocol === 'file:') return swStatus('open via http(s)', 'warn');
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      state.swReg = reg;
      swStatus(reg.active ? 'ready' : 'preparing', reg.active ? '' : 'warn');
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (nw) nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('App update ready — Settings → Demo & Reset → Check offline cache.');
          if (nw.state === 'activated') swStatus('ready');
        });
      });
      navigator.serviceWorker.ready.then(() => swStatus('ready'));
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (state.wantReload) location.reload(); });
    } catch (e) { swStatus('error', 'off'); }
  }
  function setupInstall() {
    const btn = $('#installBtn');
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.deferredPrompt = e; btn.hidden = false; });
    window.addEventListener('appinstalled', () => { btn.hidden = true; state.deferredPrompt = null; toast('SCADA HelpDesk OS installed.'); });
    if (ios && !standalone) btn.hidden = false;
    btn.addEventListener('click', async () => {
      if (state.deferredPrompt) { state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt = null; btn.hidden = true; }
      else openModal('<h3>Install on iPhone / iPad</h3><ol><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button.</li><li>Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</li></ol><div class="row"><button class="btn accent" data-close>Got it</button></div>');
    });
  }
  async function offlineReport() {
    const lines = [];
    const sw = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    lines.push((sw && sw.active) ? '✅ Offline engine (service worker) is active' : '❌ Offline engine is not active — open the app over http(s) / install it while online once');
    if (window.caches) {
      const keys = await caches.keys(); let n = 0;
      for (const k of keys) n += (await (await caches.open(k)).keys()).length;
      lines.push(n > 10 ? '✅ ' + n + ' app files saved for offline use' : '❌ App files not cached yet (' + n + ')');
    } else lines.push('❌ Browser cache storage not available');
    try { await DB.open(); lines.push('✅ Ticket database (IndexedDB) is ready'); } catch (_) { lines.push('❌ Ticket database is not available'); }
    lines.push(navigator.onLine ? 'ℹ️ You are online right now' : 'ℹ️ You are offline right now — and the app is running, which proves it works');
    return lines;
  }

  /* ---------- seed ---------- */
  async function seedIfNeeded() {
    if (await DB.getMeta('seeded', false)) return;
    const now = Date.now();
    await DB.putMany('tickets', SEED.buildTickets(now, S.sla));
    await DB.putMany('diagnostics', SEED.buildDiagnostics(now));
    await DB.setMeta('ticketSeq', 1000 + SEED.ticketCount);
    await DB.setMeta('seeded', true);
  }

  /* ---------- views ---------- */
  async function switchView(name) {
    state.view = name;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'tickets') { await loadKpis(); await loadTickets(); }
    if (name === 'diag') { await loadDiagTickets(); }
  }

  /* ================= WORKSPACE 1: TICKETS ================= */
  async function loadKpis() {
    const now = Date.now(), start = dayStart(now);
    const rangeOf = (k) => IDBKeyRange.bound([k, 0], [k, MAXN]);
    let urgent = 0;
    for (const p of ['P1', 'P2']) {
      urgent += (await DB.page('tickets', { index: 'priority_createdAt', range: rangeOf(p), filter: (t) => ACTIVE.has(t.status), limit: 0, countCap: MAXN, needTotal: true })).total;
    }
    let active = 0;
    for (const s of ['Open', 'In Progress']) active += await DB.countIndex('tickets', 'status_updatedAt', rangeOf(s));
    const today = (await DB.page('tickets', { index: 'status_updatedAt', range: IDBKeyRange.bound(['Resolved', start], ['Resolved', MAXN]), filter: (t) => t.resolvedAt >= start, limit: 0, countCap: MAXN, needTotal: true })).total;
    const done = (await DB.page('tickets', { index: 'status_updatedAt', range: rangeOf('Resolved'), direction: 'prev', limit: 300 })).rows.filter((t) => t.resolvedAt);
    const sla = done.length ? Math.round((done.filter((t) => t.resolvedAt <= t.slaResolveDue).length / done.length) * 100) : 100;
    const late = (await DB.page('tickets', { index: 'status_updatedAt', range: rangeOf('Open'), filter: (t) => t.slaResolveDue < now, limit: 0, countCap: MAXN, needTotal: true })).total +
      (await DB.page('tickets', { index: 'status_updatedAt', range: rangeOf('In Progress'), filter: (t) => t.slaResolveDue < now, limit: 0, countCap: MAXN, needTotal: true })).total;
    const card = (q, cls, v, k, tp) => '<button class="kpi ' + cls + (state.quick === q ? ' sel' : '') + '" data-quick="' + q + '"><div class="v">' + v + '</div><div class="k">' + k + tip(tp) + '</div></button>';
    $('#kpis').innerHTML =
      card('urgent', urgent ? 'red' : 'green', urgent, 'Urgent Open Issues (P1/P2)', 'Critical and High priority tickets that are still open. Click to show only these.') +
      card('active', 'blue', active, 'All Active Tickets', 'Every ticket that is Open or In Progress. Click to show only these.') +
      card('today', 'green', today, 'Resolved Today', 'Tickets you resolved since midnight (Dubai time). Click to list them.') +
      card('sla', sla >= 90 ? 'green' : sla >= 75 ? 'amber' : 'red', sla + '%', 'On-Time SLA %', 'How many resolved tickets were fixed before their SLA timer ran out. Click to see active tickets that are already late (' + late + ' now).');
    const notes = { urgent: 'Showing urgent open issues (P1/P2).', active: 'Showing all active tickets.', today: 'Showing tickets resolved today.', sla: 'Showing active tickets that are already late.' };
    $('#quickNote').hidden = !state.quick;
    $('#quickNote').textContent = state.quick ? notes[state.quick] + ' Click the card again to clear.' : '';
  }

  function curFilters() { return { q: $('#tSearch').value.trim().toLowerCase(), st: $('#tStatus').value, pr: $('#tPriority').value, quick: state.quick }; }
  function matcher(f) {
    const now = Date.now(), start = dayStart(now);
    return (t) => {
      if (f.quick === 'urgent' && !(ACTIVE.has(t.status) && (t.priority === 'P1' || t.priority === 'P2'))) return false;
      if (f.quick === 'active' && !ACTIVE.has(t.status)) return false;
      if (f.quick === 'today' && !(t.status === 'Resolved' && t.resolvedAt >= start)) return false;
      if (f.quick === 'sla' && !(ACTIVE.has(t.status) && t.slaResolveDue < now)) return false;
      if (f.pr && t.priority !== f.pr) return false;
      if (f.q && !(t.ticketNumber + ' ' + t.title + ' ' + t.siteName + ' ' + t.protocol + ' ' + (t.reporter || '') + ' ' + (t.description || '')).toLowerCase().includes(f.q)) return false;
      return true;
    };
  }
  async function loadTickets() {
    const f = curFilters();
    if (state.mode === 'kanban') return loadKanban(f);
    const opts = { limit: PAGE_SIZE, offset: state.page * PAGE_SIZE, direction: 'prev', filter: matcher(f) };
    if (f.st) { opts.index = 'status_updatedAt'; opts.range = IDBKeyRange.bound([f.st, 0], [f.st, MAXN]); }
    else if (f.pr) { opts.index = 'priority_createdAt'; opts.range = IDBKeyRange.bound([f.pr, 0], [f.pr, MAXN]); }
    else opts.index = 'updatedAt';
    const r = await DB.page('tickets', opts);
    const now = Date.now();
    let html = '<div class="tbl-scroll"><table><thead><tr><th>Ticket</th><th>Problem</th><th>Client site</th><th>Priority' + tip('P1 = Critical (red) … P4 = Low (blue). Higher priority means a shorter SLA timer.') + '</th><th>Status</th><th>SLA time' + tip('Time left to fix the issue before the target is missed. Red means late.') + '</th><th></th></tr></thead><tbody>';
    if (!r.rows.length) html += '<tr><td colspan="7" class="hint">No tickets match. Clear a filter or press “+ New Support Ticket”.</td></tr>';
    r.rows.forEach((t) => {
      const s = slaInfo(t, now);
      html += '<tr data-id="' + esc(t.id) + '"><td class="mono">' + esc(t.ticketNumber) + '</td><td>' + esc(t.title) + '<div class="hint">' + esc(t.protocol) + ' · caller: ' + esc(t.reporter || '—') + '</div></td><td>' + esc(t.siteName) + '</td><td>' + badgeP(t.priority) + '</td><td>' + badgeS(t.status) + '</td><td class="' + s.cls + '">' + esc(s.text) + '</td><td><button class="btn small quickDiag" data-diag="' + esc(t.id) + '">🔍 Diagnose</button></td></tr>';
    });
    $('#ticketTableWrap').innerHTML = html + '</tbody></table></div>';
    $('#ticketTableWrap').hidden = false; $('#ticketKanban').hidden = true;
    state.hasMore = r.hasMore;
    const from = r.rows.length ? state.page * PAGE_SIZE + 1 : 0;
    $('#pgInfo').textContent = 'Tickets ' + from + '–' + (state.page * PAGE_SIZE + r.rows.length) + (r.hasMore ? ' (more available)' : '');
    $('#pgPrev').disabled = state.page === 0; $('#pgNext').disabled = !r.hasMore;
    await loadArchiveMatches(f);
  }
  async function loadArchiveMatches(f) {
    const box = $('#archiveBox');
    if (!f.q || f.quick || f.st) { box.hidden = true; return; }
    const r = await DB.page('cold_archive', { index: 'archivedAt', direction: 'prev', limit: 10, filter: (a) => (a.searchText || (a.ticketNumber + ' ' + a.title + ' ' + a.siteName).toLowerCase()).includes(f.q) });
    if (!r.rows.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<h3>📦 Archived tickets matching your search</h3><div class="list">' + r.rows.map((a) => '<div class="item"><div class="t"><span class="mono">' + esc(a.ticketNumber) + '</span> — ' + esc(a.title) + '</div><div class="m">' + esc(a.siteName) + ' · resolved ' + esc(fmtDT(a.closedAt)) + '</div><div class="acts"><button class="btn small" data-restore="' + esc(a.id) + '">Bring back to active list</button></div></div>').join('') + '</div>';
  }
  async function loadKanban(f) {
    const now = Date.now(); const m = matcher(f);
    let html = '';
    for (const s of ['Open', 'In Progress', 'Resolved']) {
      const r = await DB.page('tickets', { index: 'status_updatedAt', range: IDBKeyRange.bound([s, 0], [s, MAXN]), direction: 'prev', limit: 15, filter: m });
      html += '<div class="kcol"><h4>' + esc(s) + (r.hasMore ? ' (15+ shown)' : ' (' + r.rows.length + ')') + '</h4>';
      r.rows.forEach((t) => {
        const sl = slaInfo(t, now);
        html += '<div class="kcard" data-id="' + esc(t.id) + '"><div>' + badgeP(t.priority) + ' <span class="mono">' + esc(t.ticketNumber) + '</span></div><div>' + esc(t.title) + '</div><div class="hint">' + esc(t.siteName) + '</div><div class="' + sl.cls + '">' + esc(sl.text) + '</div><div style="margin-top:6px"><button class="btn small quickDiag" data-diag="' + esc(t.id) + '">🔍 Diagnose</button></div></div>';
      });
      html += '</div>';
    }
    $('#ticketKanban').innerHTML = html;
    $('#ticketKanban').hidden = false; $('#ticketTableWrap').hidden = true; $('#archiveBox').hidden = true;
    $('#pgInfo').textContent = 'Board shows the 15 most recent tickets per column';
    $('#pgPrev').disabled = true; $('#pgNext').disabled = true;
  }

  async function allSites() { return SEED.sites.slice(); }

  async function openNewTicket() {
    const sites = await allSites();
    openModal('<h3>New Support Ticket</h3><form id="ntForm" class="row3" style="grid-template-columns:1fr 1fr">' +
      '<label style="grid-column:1/-1">⚡ Quick-Fill from Common Plant Issues ' + tip('Pick the closest issue and the form fills itself. You can still edit anything.') + '<select id="ntQuick"><option value="">— choose to auto-fill (optional) —</option>' + SEED.QUICK.map((q, i) => '<option value="' + i + '">' + esc(q.label) + '</option>').join('') + '</select></label>' +
      '<label style="grid-column:1/-1">What is the problem?<input name="title" required maxlength="160"></label>' +
      '<label style="grid-column:1/-1">Symptom description<textarea name="description" rows="3" required></textarea></label>' +
      '<label>Client site<select name="siteId">' + sites.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('') + '</select></label>' +
      '<label>System / protocol<select name="protocol">' + PROTOCOLS.map((p) => '<option>' + p + '</option>').join('') + '</select></label>' +
      '<label>Priority ' + tip('P1 = plant at risk (fix in ' + S.sla.P1 + 'h). P2 = ' + S.sla.P2 + 'h. P3 = ' + S.sla.P3 + 'h. P4 = ' + S.sla.P4 + 'h. Targets can be changed in Settings.') + '<select name="priority"><option value="P1">P1 — Critical (' + S.sla.P1 + 'h)</option><option value="P2">P2 — High (' + S.sla.P2 + 'h)</option><option value="P3" selected>P3 — Medium (' + S.sla.P3 + 'h)</option><option value="P4">P4 — Low (' + S.sla.P4 + 'h)</option></select></label>' +
      '<label>Category<select name="category">' + CATEGORIES.map((c) => '<option>' + c + '</option>').join('') + '</select></label>' +
      '<label>Caller name<input name="reporter" required></label>' +
      '<label>Caller phone / email<input name="contact"></label>' +
      '<div class="row" style="grid-column:1/-1"><button class="btn accent" type="submit">Create Ticket</button><button class="btn" type="button" data-close>Cancel</button></div></form>');
    let quick = null;
    $('#ntQuick').onchange = () => {
      const q = SEED.QUICK[+$('#ntQuick').value]; quick = q || null;
      if (!q) return;
      const f = $('#ntForm');
      f.title.value = q.title; f.description.value = q.description; f.protocol.value = q.protocol; f.priority.value = q.priority; f.category.value = q.category;
    };
    $('#ntForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target).entries());
      const t = await createTicket(d, quick);
      closeModal(); toast('Created ' + t.ticketNumber + ' — click “🔍 Diagnose” to start.');
      state.page = 0; await loadKpis(); await loadTickets();
    });
  }
  async function createTicket(d, quick) {
    const now = Date.now();
    const site = SEED.sites.find((s) => s.id === d.siteId);
    const hrs = S.sla[d.priority];
    const t = {
      id: DB.uid('tk'), ticketNumber: await DB.nextTicketNumber(), title: d.title.trim(), description: d.description.trim(),
      siteId: d.siteId, siteName: site ? site.name : '', protocol: d.protocol, priority: d.priority, status: 'Open', category: d.category,
      reporter: d.reporter.trim(), contact: (d.contact || '').trim(), assignee: S.engineer, createdAt: now, updatedAt: now, resolvedAt: null, respondedAt: null,
      slaHours: hrs, slaResolveDue: now + hrs * H, resolutionNote: '', hoursSpent: 0, tool: quick ? quick.tool : '', preset: quick ? quick.preset : '',
      timeline: [{ ts: now, author: d.reporter.trim() || 'Caller', text: 'Ticket logged.' }]
    };
    await DB.put('tickets', t);
    return t;
  }
  async function saveTicket(t) { t.updatedAt = Date.now(); await DB.put('tickets', t); }

  /* ---------- drawer ---------- */
  function closeDrawer() {
    $('#drawer').hidden = true; $('#scrim').hidden = true; $('#drawer').innerHTML = '';
    clearInterval(state.drawerTimer); state.drawerTicket = null;
  }
  async function openDrawer(id) {
    const t = await DB.get('tickets', id);
    if (!t) return toast('Ticket not found.');
    state.drawerTicket = t;
    const diags = (await DB.byIndex('diagnostics', 'ticketId', id)).sort((a, b) => b.timestamp - a.timestamp);
    const resolved = t.status === 'Resolved' || t.status === 'Closed';
    $('#drawer').innerHTML =
      '<div class="card-head"><div><span class="mono" style="font-size:1.1em">' + esc(t.ticketNumber) + '</span> ' + badgeP(t.priority) + ' ' + badgeS(t.status) + '</div><button class="btn small" id="dClose">Close ✕</button></div>' +
      '<h3 style="margin:0;text-transform:none;font-size:1.2em;color:var(--text)">' + esc(t.title) + '</h3>' +
      '<div class="card"><div class="sla-timer" id="slaTimer"></div><div class="hint">SLA ' + tip('SLA is the time promised to the client to fix this issue. The timer counts down; red means late.') + ' target ' + (t.slaHours || SEED.SLA[t.priority].hours) + 'h · due ' + esc(fmtDT(t.slaResolveDue)) + '</div></div>' +
      '<div class="grid2" style="grid-template-columns:1fr 1fr;gap:6px"><div class="srow"><span>Client site</span><span>' + esc(t.siteName) + '</span></div><div class="srow"><span>Caller</span><span>' + esc(t.reporter || '—') + '</span></div><div class="srow"><span>System</span><span>' + esc(t.protocol) + '</span></div><div class="srow"><span>Category</span><span>' + esc(t.category) + '</span></div><div class="srow"><span>Contact</span><span>' + esc(t.contact || '—') + '</span></div><div class="srow"><span>Logged</span><span>' + esc(fmtDT(t.createdAt)) + '</span></div></div>' +
      '<div class="item"><div class="m">Symptom</div>' + esc(t.description).replace(/\n/g, '<br>') + '</div>' +
      (resolved && t.resolutionNote ? '<div class="item" style="border-color:var(--green)"><div class="m">Resolution</div>' + esc(t.resolutionNote).replace(/\n/g, '<br>') + '</div>' : '') +
      '<div class="card"><h3>Guided Actions</h3><div class="actionbar">' +
      '<button class="btn accent" id="dDiag">🔍 Diagnose This Issue</button>' +
      (t.status === 'Open' ? '<button class="btn" id="dStart">▶ Start Working</button>' : '') +
      (!resolved ? '<button class="btn ok" id="dResolve">✅ Mark Resolved</button>' : '<button class="btn" id="dReopen">↩ Re-open</button>') +
      '<button class="btn" id="dReport">🖨️ Print / Save Service Report</button></div></div>' +
      '<div class="card"><h3>Attached Diagnostics (' + diags.length + ')</h3>' + (diags.length ? diags.map((d) => '<details><summary>' + esc(TOOL_NAME[d.diagnosticType] || d.diagnosticType) + ' — ' + esc(d.summary) + '</summary><div class="hint">' + esc(fmtDT(d.timestamp)) + '</div><p>' + esc((d.payload && d.payload.diagnosis) || '') + '</p>' + ((d.payload && d.payload.steps) || []).map((s) => '<div>' + (s.done ? '✅' : '⬜') + ' ' + esc(s.text) + '</div>').join('') + (d.payload && d.payload.technical ? '<pre class="code">' + esc(d.payload.technical) + '</pre>' : '') + '</details>').join('') : '<div class="hint">Nothing attached yet. Press “🔍 Diagnose This Issue”, run a check, then “Attach Result &amp; Fix to Ticket”.</div>') + '</div>' +
      '<div class="card"><h3>Timeline</h3><div class="list" style="max-height:240px;overflow:auto">' + t.timeline.slice().reverse().map((x) => '<div class="item"><div class="m">' + esc(fmtDT(x.ts)) + ' · ' + esc(x.author) + '</div>' + esc(x.text) + '</div>').join('') + '</div><div class="row"><label>Add a progress note<input id="noteText"></label><button class="btn small" id="noteAdd">Add</button></div></div>';
    $('#drawer').hidden = false; $('#scrim').hidden = false;
    const tick = () => {
      const tt = state.drawerTicket; const el = $('#slaTimer'); if (!tt || !el) return;
      const s = slaInfo(tt, Date.now()); el.className = 'sla-timer ' + s.cls;
      if (tt.status === 'Resolved' || tt.status === 'Closed') el.textContent = 'SLA ' + s.text;
      else { const rem = tt.slaResolveDue - Date.now(); el.textContent = rem < 0 ? 'LATE by ' + fmtDur(-rem, true) : 'Time left ' + fmtDur(rem, true); }
    };
    tick(); clearInterval(state.drawerTimer); state.drawerTimer = setInterval(tick, 1000);
    $('#dClose').onclick = closeDrawer;
    $('#dDiag').onclick = () => openDiag(t.id);
    const st = $('#dStart'); if (st) st.onclick = async () => { const now = Date.now(); t.status = 'In Progress'; if (!t.respondedAt) t.respondedAt = now; t.timeline.push({ ts: now, author: S.engineer, text: 'Started working on the issue.' }); await saveTicket(t); refreshAfter(t.id); };
    const rs = $('#dResolve'); if (rs) rs.onclick = () => resolveForm(t);
    const ro = $('#dReopen'); if (ro) ro.onclick = async () => { t.status = 'In Progress'; t.resolvedAt = null; t.timeline.push({ ts: Date.now(), author: S.engineer, text: 'Ticket re-opened.' }); await saveTicket(t); refreshAfter(t.id); };
    $('#dReport').onclick = () => showReport(t, diags);
    $('#noteAdd').onclick = async () => { const v = $('#noteText').value.trim(); if (!v) return; t.timeline.push({ ts: Date.now(), author: S.engineer, text: v }); await saveTicket(t); openDrawer(t.id); };
  }
  function refreshAfter(id) { openDrawer(id); loadKpis(); loadTickets(); }
  function resolveForm(t) {
    openModal('<h3>Mark Resolved — ' + esc(t.ticketNumber) + '</h3><form id="rsForm"><label>What did you do to fix it? (short note)<textarea name="note" rows="4" required placeholder="e.g. Replaced faulty patch cable, comm restored, tags back to Good quality."></textarea></label><div class="row"><label>Hours spent<input name="hrs" type="number" min="0" step="0.25" value="' + (t.hoursSpent || 1) + '"></label></div><div class="row"><button class="btn ok" type="submit">✅ Save &amp; Resolve</button><button class="btn" type="button" data-close>Cancel</button></div></form>');
    $('#rsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      const now = Date.now();
      t.status = 'Resolved'; t.resolvedAt = now; if (!t.respondedAt) t.respondedAt = now;
      t.resolutionNote = f.note.trim(); t.hoursSpent = Math.max(0, +f.hrs || 0);
      t.timeline.push({ ts: now, author: S.engineer, text: 'Resolved: ' + t.resolutionNote });
      await saveTicket(t); closeModal(); toast('Ticket resolved'); refreshAfter(t.id);
    });
  }
  function reportHtml(t, diags) {
    return '<div class="report"><h2>Technical Support Report</h2><div><b>' + esc(S.company) + '</b></div><table style="margin-top:10px">' +
      [['Ticket', t.ticketNumber], ['Client site', t.siteName], ['Priority', t.priority + ' — ' + SEED.SLA[t.priority].label], ['Status', t.status], ['System', t.protocol], ['Caller', t.reporter], ['Logged', fmtDT(t.createdAt)], ['Resolved', fmtDT(t.resolvedAt)], ['SLA', slaInfo(t, Date.now()).text], ['Engineer', S.engineer], ['Hours spent', t.hoursSpent || 0]]
        .map((r) => '<tr><th style="width:30%">' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>' +
      '<h3>Reported problem</h3><p>' + esc(t.description).replace(/\n/g, '<br>') + '</p><h3>Resolution</h3><p>' + esc(t.resolutionNote || 'Not yet resolved').replace(/\n/g, '<br>') + '</p>' +
      '<h3>Diagnostic checks</h3>' + (diags.length ? diags.map((d) => '<p><b>' + esc(TOOL_NAME[d.diagnosticType] || d.diagnosticType) + '</b> — ' + esc(d.summary) + '<br>' + esc((d.payload && d.payload.diagnosis) || '') + '<br>' + ((d.payload && d.payload.steps) || []).map((s) => (s.done ? '[x] ' : '[ ] ') + esc(s.text)).join('<br>') + '</p>').join('') : '<p>None attached.</p>') +
      '<h3>Activity log</h3><ul>' + t.timeline.map((x) => '<li>' + esc(fmtDT(x.ts)) + ' — ' + esc(x.author) + ': ' + esc(x.text) + '</li>').join('') + '</ul>' +
      '<table style="margin-top:20px"><tr><th>Engineer signature</th><th>Client representative</th></tr><tr><td style="height:50px"></td><td></td></tr></table></div>';
  }
  function showReport(t, diags) {
    openModal('<div class="row"><button class="btn accent small" id="rPrint">🖨️ Print / Save as PDF</button><button class="btn small" id="rDl">Download as file</button><button class="btn small" data-close>Close</button></div>' + reportHtml(t, diags), true);
    $('#rPrint').onclick = () => window.print();
    $('#rDl').onclick = () => {
      const doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Service Report ' + esc(t.ticketNumber) + '</title><style>body{font:14px Arial,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#e5e7eb}</style></head><body>' + reportHtml(t, diags) + '</body></html>';
      download(new Blob([doc], { type: 'text/html' }), 'Service-Report-' + t.ticketNumber + '.html');
    };
  }

  /* ================= WORKSPACE 2: DIAGNOSTICS ================= */
  async function loadDiagTickets() {
    const r = await DB.page('tickets', { index: 'updatedAt', direction: 'prev', limit: 100 });
    const sel = $('#diagTicket');
    sel.innerHTML = '<option value="">— pick the ticket you are diagnosing —</option>' + r.rows.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.ticketNumber + ' · ' + t.title.slice(0, 55) + (t.status === 'Resolved' ? ' (resolved)' : '')) + '</option>').join('');
    if (state.diagTicket && r.rows.some((t) => t.id === state.diagTicket)) sel.value = state.diagTicket; else state.diagTicket = '';
    await renderDiagBanner();
  }
  async function renderDiagBanner() {
    const t = state.diagTicket ? await DB.get('tickets', state.diagTicket) : null;
    $('#diagCur').innerHTML = t ? 'Currently Diagnosing: <span class="mono">' + esc(t.ticketNumber) + '</span> — ' + esc(t.siteName) + ' ' + badgeP(t.priority) : 'Currently Diagnosing: <span class="warn">no ticket selected</span> <span class="hint">(pick a ticket from the list so results can be attached)</span>';
  }
  async function ensureDiagTicket() {
    if (state.diagTicket) return;
    const r = await DB.page('tickets', { index: 'updatedAt', direction: 'prev', limit: 1, filter: (t) => ACTIVE.has(t.status) });
    if (r.rows[0]) { state.diagTicket = r.rows[0].id; await loadDiagTickets(); }
  }
  function toolFromTicket(t) {
    if (t.tool) return t.tool;
    if (/OPC/.test(t.protocol)) return 'opc';
    if (/Modbus/.test(t.protocol)) return 'modbus';
    if (/Wonderware|SQL/.test(t.protocol)) return 'wonderware';
    return 'plc';
  }
  async function openDiag(ticketId) {
    const t = await DB.get('tickets', ticketId);
    if (!t) return;
    closeAll();
    state.diagTicket = ticketId;
    await switchView('diag');
    const tool = toolFromTicket(t);
    loadExample(tool, t.preset);
    flash($('#card-' + tool));
  }
  function showResult(tool, r) {
    const old = state.diag[tool];
    state.diag[tool] = Object.assign({}, r, { checks: (old && old.keepChecks && old.checks && old.checks.length === r.steps.length) ? old.checks : r.steps.map(() => false) });
    renderResult(tool);
  }
  function renderResult(tool) {
    const r = state.diag[tool]; if (!r) return;
    const lab = { good: 'ALL GOOD', bad: 'PROBLEM', warn: 'CHECK' }[r.level] || 'INFO';
    $('#' + OUT[tool]).innerHTML = '<div><span class="lvl ' + esc(r.level) + '">' + lab + '</span><b>' + esc(r.summary) + '</b></div>' +
      '<p><span class="hint">What this means:</span><br>' + esc(r.diagnosis) + '</p>' +
      '<div class="hint">Fix checklist — tick each step as you do it:</div><div class="checks">' + r.steps.map((s, i) => '<label><input type="checkbox" data-ck="' + tool + ':' + i + '"' + (r.checks[i] ? ' checked' : '') + '> <span>' + esc(s) + '</span></label>').join('') + '</div>' +
      (r.tech ? '<pre class="code" style="margin-top:8px">' + esc(r.tech) + '</pre>' : '');
  }
  function fillSelect(id, obj) { $('#' + id).innerHTML = Object.keys(obj).map((k) => '<option value="' + k + '">' + esc(obj[k].label) + '</option>').join(''); }

  function applyOpc(key) {
    const p = DIAG.PRESETS.opc[key]; if (!p) return;
    $('#opcPreset').value = key; $('#opcCustom').value = p.code;
    showResult('opc', { summary: 'OPC: ' + p.label, level: p.level, diagnosis: p.meaning, steps: p.steps, tech: 'Code / status: ' + p.code });
  }
  function checkOpc() {
    const v = $('#opcCustom').value.trim();
    if (!v) return toast('Type a code like 0x0018 or an endpoint first.');
    const norm = v.toUpperCase().replace(/^0X/, '');
    const hit = Object.keys(DIAG.PRESETS.opc).find((k) => DIAG.PRESETS.opc[k].code.toUpperCase().replace(/^0X/, '') === norm);
    if (hit) return applyOpc(hit);
    if (/^opc\.tcp:\/\//i.test(v) || /[^0-9a-fx]/i.test(v)) {
      const r = DIAG.opcEndpointCheck(v);
      return showResult('opc', { summary: 'OPC endpoint check: ' + v, level: r.ok ? 'good' : 'bad', diagnosis: r.kind + ' — ' + r.issues.join(' '), steps: ['Ping the server from the HMI / gateway PC.', 'Check the port is open in the firewall (OPC UA is usually 4840).', 'Check the security policy and certificates match on both sides.', 'Check the OPC server service is running.'], tech: 'Endpoint: ' + v });
    }
    const r = DIAG.opcDecode(v);
    if (!r.ok) return showResult('opc', { summary: 'Could not read that code', level: 'warn', diagnosis: r.error, steps: ['Try a code such as 0x00C0, 0x0018 or 0x0000.'], tech: '' });
    showResult('opc', { summary: 'OPC ' + r.raw + ' — ' + r.quality + ' / ' + r.substatus, level: r.quality === 'Good' ? 'good' : r.quality === 'Bad' ? 'bad' : 'warn', diagnosis: 'Quality is ' + r.quality + ' (' + r.substatus + '). ' + (r.quality === 'Good' ? 'The value can be trusted.' : 'Do not trust this value until it returns to Good.'), steps: r.advice, tech: 'Decoded ' + r.kind + ' code ' + r.raw + '\nLimit: ' + r.limit });
  }
  function applyModbus(key) {
    const p = DIAG.PRESETS.modbus[key]; if (!p) return;
    $('#mbPreset').value = key;
    showResult('modbus', { summary: 'Modbus: ' + p.label, level: p.level, diagnosis: p.meaning, steps: p.steps, tech: '' });
  }
  function buildModbus() {
    const r = DIAG.modbusFromRegister($('#mbSlave').value, $('#mbReg').value, $('#mbQty').value);
    if (!r.ok) return showResult('modbus', { summary: 'Check the numbers', level: 'warn', diagnosis: r.error, steps: ['Slave ID 0–247, register like 40001, quantity 1–125.'], tech: '' });
    showResult('modbus', { summary: 'Register ' + $('#mbReg').value.trim() + ' → ' + r.tableName + ', offset ' + r.addr, level: 'good', diagnosis: 'On the wire this is ' + r.tableName + ' offset ' + r.addr + ' (function ' + String(r.func).padStart(2, '0') + '). The CRC-16 is added for you. If the device answers exception 02, try the offset minus 1 or plus 1.', steps: ['Check the slave ID matches the device.', 'Send the request and compare the answer with the HMI value.', 'If you get exception 02: try offset -1 / +1 or reduce the quantity.', 'Do not send write requests to a live plant without permission.'], tech: 'RTU request: ' + r.rtu + '\nCRC-16: ' + r.crc + '\nTCP (MBAP): ' + r.tcp });
  }
  function wwBase() {
    if (!state.diag.wonderware) applyWw($('#wwPreset').value || DEFAULT_PRESET.wonderware, true);
    return state.diag.wonderware;
  }
  function applyWw(key, quiet) {
    const p = DIAG.PRESETS.wonderware[key]; if (!p) return;
    $('#wwPreset').value = key;
    if (key === 'script') $('#qsCode').value = 'IF Tank1_Level > 80\n  Pump1_Cmd = 1;\nENDIF\nPump_Load = Pump1_Runtime / Pump_Total;';
    if (key === 'flood') $('#afLog').value = DIAG.alarmSample();
    if (key === 'historian') $('#hTags').value = 'RO_Skid1_Flow, RO_Skid1_Pressure';
    showResult('wonderware', { summary: 'Wonderware: ' + p.label, level: p.level, diagnosis: p.meaning, steps: p.steps, tech: '' });
    if (!quiet) { if (key === 'script') runScript(); if (key === 'flood') runFlood(); if (key === 'historian') runQuery(); }
  }
  function wwSet(summary, tech) { const r = wwBase(); r.keepChecks = true; showResult('wonderware', Object.assign({}, r, { summary, tech, keepChecks: true })); }
  function runQuery() {
    const hrs = Math.max(1, +$('#hHours').value || 1); const now = Date.now();
    const iso = (ms) => new Date(ms).toISOString().slice(0, 16);
    const r = DIAG.historianQuery({ tags: $('#hTags').value, start: iso(now - hrs * H) + ':00Z', end: iso(now) + ':00Z', mode: 'Cyclic', res: 60000, rows: 5000 });
    if (!r.ok) return toast(r.error);
    wwSet('Historian query built for ' + r.tags.length + ' tag(s), last ' + hrs + ' h', (r.warns.length ? r.warns.map((w) => '-- WARNING: ' + w).join('\n') + '\n' : '') + r.sql);
  }
  function runScript() {
    const r = DIAG.quickScriptLint($('#qsCode').value);
    const found = r.issues.filter((i) => i.lvl !== 'info');
    wwSet('QuickScript check: ' + (found.length ? found.length + ' issue(s) found' : 'no problems found'), (r.mode || 'Script') + '\n' + r.issues.map((i) => '• ' + i.msg).join('\n'));
  }
  function runFlood() {
    const r = DIAG.alarmFlood($('#afLog').value);
    if (!r.ok) return toast(r.error);
    wwSet('Alarm flood check: ' + r.total + ' alarms, peak ' + r.peak + ' in 10 min' + (r.flood ? ' (FLOOD)' : ''), r.text.replace(/<[^>]+>/g, ''));
  }
  function applyPlc(key) {
    const p = DIAG.PRESETS.plc[key]; if (!p) return;
    $('#plcSel').value = key;
    showResult('plc', { summary: p.label + ' — pre-check', level: 'warn', diagnosis: 'Ports: ' + p.port + '. Work down the list before you close the ticket.', steps: p.steps, tech: 'LED meanings:\n' + p.leds.map((l) => '• ' + l).join('\n') });
  }
  function loadExample(tool, preset) {
    const key = (preset && DIAG.PRESETS[tool === 'wonderware' ? 'wonderware' : tool][preset]) ? preset : DEFAULT_PRESET[tool];
    if (tool === 'opc') applyOpc(key); else if (tool === 'modbus') applyModbus(key); else if (tool === 'wonderware') applyWw(key); else applyPlc(key);
  }

  async function attachDiag(tool) {
    if (!state.diagTicket) { await ensureDiagTicket(); if (!state.diagTicket) return toast('Pick the ticket you are diagnosing first (top of this page).'); }
    const r = state.diag[tool];
    if (!r) return toast('Press “✨ Load Common Example” or run a check first.');
    const t = await DB.get('tickets', state.diagTicket);
    if (!t) return toast('Ticket not found.');
    const now = Date.now();
    const steps = r.steps.map((s, i) => ({ text: s, done: !!r.checks[i] }));
    await DB.put('diagnostics', { id: DB.uid('dg'), ticketId: t.id, timestamp: now, diagnosticType: tool, summary: r.summary, payload: { diagnosis: r.diagnosis, steps, technical: r.tech || '' } });
    t.timeline.push({ ts: now, author: S.engineer, text: TOOL_NAME[tool] + ' attached (' + steps.filter((s) => s.done).length + '/' + steps.length + ' steps done): ' + r.summary });
    if (t.status === 'Open') { t.status = 'In Progress'; if (!t.respondedAt) t.respondedAt = now; }
    await saveTicket(t);
    toast('📎 Attached to ' + t.ticketNumber);
    loadKpis();
  }

  /* ================= SETTINGS ================= */
  async function openSettings() {
    openModal('<h3>⚙️ Settings</h3>' +
      '<details open><summary>👤 Engineer Profile &amp; Defaults</summary><div class="row3" style="margin-top:8px"><label>Engineer name<input id="sName" value="' + esc(S.engineer) + '"></label><label style="grid-column:span 2">Company / branch<input id="sCompany" value="' + esc(S.company) + '"></label></div>' +
      '<div class="hint" style="margin-top:8px">Default SLA targets (hours to resolve) ' + tip('Used when a new ticket is created. Existing tickets keep the target they were created with.') + '</div><div class="row3">' + ['P1', 'P2', 'P3', 'P4'].map((p) => '<label>' + p + ' (' + SEED.SLA[p].label + ')<input type="number" min="0.5" step="0.5" data-sla="' + p + '" value="' + S.sla[p] + '"></label>').join('') + '</div></details>' +
      '<details open><summary>🎨 Display &amp; Ease-of-Use</summary><div class="row3" style="margin-top:8px"><label>Beginner helper hints<select id="sHints"><option value="1"' + (S.hints ? ' selected' : '') + '>ON — show ? tips</option><option value="0"' + (!S.hints ? ' selected' : '') + '>OFF</option></select></label><label>Color theme<select id="sTheme"><option value="dark"' + (S.theme === 'dark' ? ' selected' : '') + '>Industrial Dark HMI</option><option value="light"' + (S.theme === 'light' ? ' selected' : '') + '>Daylight High-Contrast Light</option></select></label><label>Text &amp; button size<select id="sSize"><option value="standard"' + (S.size === 'standard' ? ' selected' : '') + '>Standard</option><option value="large"' + (S.size === 'large' ? ' selected' : '') + '>Large / Touch-Friendly</option></select></label></div></details>' +
      '<details open><summary>💾 2–3 Year Storage &amp; Safety Vault</summary><div id="stInfo" style="margin-top:8px"></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn accent" id="stLock">🔒 Lock Permanent Storage</button><span class="hint" id="stLockMsg"></span></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn" id="stBackup">⬇ Download Full Backup (.json)</button><button class="btn" id="stCsv">📊 Export Tickets to Excel/CSV</button><label class="btn" style="flex-direction:row;cursor:pointer;align-items:center">⬆ Restore from Backup File<input type="file" id="stRestore" accept="application/json,.json" hidden></label></div>' +
      '<div class="row" style="margin-top:8px"><label>Archive resolved tickets older than<select id="stDays"><option value="180" selected>6 months</option><option value="365">12 months</option><option value="90">3 months</option></select></label><button class="btn" id="stClean">🧹 Storage Cleanup (Auto-Archive)</button></div><div class="out" id="stOut" style="margin-top:8px"></div></details>' +
      '<details open><summary>🔄 Demo &amp; Reset Controls</summary><div class="row" style="margin-top:8px"><button class="btn" id="stReplay">▶ Replay Welcome Tour</button><button class="btn danger" id="stReset">Reset Sample Dubai Tickets</button><button class="btn" id="stSw">Check Service Worker / Offline Cache</button></div><div class="out" id="stSwOut" style="margin-top:8px"></div></details>' +
      '<div class="row"><button class="btn accent" data-close>Done</button></div>', true);
    $('#sName').onchange = () => { S.engineer = $('#sName').value.trim() || DEFAULTS.engineer; savePrefs(); };
    $('#sCompany').onchange = () => { S.company = $('#sCompany').value.trim() || DEFAULTS.company; savePrefs(); };
    $$('[data-sla]').forEach((i) => i.addEventListener('change', () => { const v = Math.max(0.5, +i.value || DEFAULTS.sla[i.dataset.sla]); S.sla[i.dataset.sla] = v; i.value = v; savePrefs(); }));
    $('#sHints').onchange = () => { S.hints = $('#sHints').value === '1'; savePrefs(); };
    $('#sTheme').onchange = () => { S.theme = $('#sTheme').value; savePrefs(); };
    $('#sSize').onchange = () => { S.size = $('#sSize').value; savePrefs(); };
    $('#stLock').onclick = async () => {
      let ok = false;
      try { ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (_) { /* ignore */ }
      toast(ok ? 'Permanent storage locked ✅' : 'The browser declined. Installing the app usually allows it.'); refreshStorageInfo();
    };
    $('#stBackup').onclick = async () => { const b = await DB.exportSnapshot(); download(b, 'SCADA_HelpDesk_OS_backup_' + new Date().toISOString().slice(0, 10) + '.json'); $('#stOut').textContent = 'Backup downloaded (' + fmtBytes(b.size) + '). Keep it somewhere safe.'; };
    $('#stCsv').onclick = exportCsv;
    $('#stRestore').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!confirm('Restoring replaces ALL current data with the backup file. Continue?')) { e.target.value = ''; return; }
      try {
        const n = await DB.importSnapshot(await f.text(), (name, total) => { $('#stOut').textContent = 'Restoring ' + name + '… ' + total.toLocaleString(); });
        await loadPrefs(); $('#stOut').textContent = 'Restored ' + n.toLocaleString() + ' records.'; refreshStorageInfo(); loadKpis(); loadTickets();
      } catch (err) { $('#stOut').innerHTML = '<span class="bad">Restore failed: ' + esc(err.message) + '</span>'; }
      e.target.value = '';
    };
    $('#stClean').onclick = async () => {
      const days = +$('#stDays').value; $('#stOut').textContent = 'Archiving…';
      const r = await DB.compactCold(days, (m, n) => { $('#stOut').textContent = 'Archived ' + m + ' of ' + n + '…'; });
      $('#stOut').textContent = r.moved ? 'Archived ' + r.moved.toLocaleString() + ' resolved ticket(s) (' + fmtBytes(r.bytesBefore) + ' → ' + fmtBytes(r.bytesAfter) + '). They stay searchable from the ticket search box.' : 'Nothing to archive — no resolved tickets are older than that.';
      refreshStorageInfo(); loadKpis(); loadTickets();
    };
    $('#stReplay').onclick = async () => { S.welcomeDismissed = false; await savePrefs(); closeAll(); await switchView('tickets'); showWelcome(); window.TOUR.start(); };
    $('#stReset').onclick = async () => {
      if (!confirm('Replace the sample Dubai tickets with a fresh copy? Tickets you created yourself are kept.')) return;
      const ids = [], dg = [];
      for (let i = 1; i <= SEED.ticketCount; i++) ids.push('tk_seed_' + String(i).padStart(2, '0'));
      for (let i = 1; i <= 6; i++) dg.push('dg_seed_' + i);
      await DB.delMany('tickets', ids); await DB.delMany('cold_archive', ids); await DB.delMany('diagnostics', dg);
      const now = Date.now();
      await DB.putMany('tickets', SEED.buildTickets(now, S.sla)); await DB.putMany('diagnostics', SEED.buildDiagnostics(now));
      toast('Sample tickets reset'); refreshStorageInfo(); loadKpis(); loadTickets();
    };
    $('#stSw').onclick = async () => { $('#stSwOut').innerHTML = (await offlineReport()).map(esc).join('<br>'); };
    refreshStorageInfo();
  }
  async function refreshStorageInfo() {
    const box = $('#stInfo'); if (!box) return;
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : { usage: 0, quota: 0 };
    let persisted = false;
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (_) { /* ignore */ }
    const nT = await DB.count('tickets'), nA = await DB.count('cold_archive');
    const avgT = (await DB.averageBytes('tickets', 200)) || 1500, avgD = (await DB.averageBytes('diagnostics', 200)) || 900;
    const perDay = 40 * (avgT + 3 * avgD);
    const free = Math.max(0, (est.quota || 0) - (est.usage || 0));
    const years = est.quota ? free / perDay / 365 : 0;
    const pct = est.quota ? Math.min(100, (est.usage / est.quota) * 100) : 0;
    box.innerHTML = '<div class="bar"><i style="width:' + Math.max(pct, 0.6) + '%"></i></div><p>' + (est.quota ? '<b>Using ' + fmtBytes(est.usage || 0) + ' of ' + fmtBytes(est.quota) + '</b> — ' + (years >= 3 ? '✅ Ready for ' + (years > 50 ? '50+' : Math.floor(years)) + '+ years of daily tickets (about 40 per day).' : '⚠️ Less than 3 years of space left at 40 tickets/day: run Storage Cleanup and keep a backup.') : 'Your browser did not report its capacity — keep regular backups.') + '</p><div class="hint">' + nT.toLocaleString() + ' active tickets · ' + nA.toLocaleString() + ' archived tickets</div>';
    $('#stLockMsg').innerHTML = persisted ? '<span class="good">✅ Locked — the browser will never auto-delete your tickets.</span>' : 'Not locked yet — the browser may clear data if the device runs low on space.';
    $('#stLock').disabled = persisted;
  }
  async function exportCsv() {
    const parts = []; let first = true;
    await DB.forEachChunk('tickets', 1000, async (rows) => {
      const lines = DB.ticketsToCsv(rows).split('\r\n');
      parts.push((first ? lines.join('\r\n') : lines.slice(1).join('\r\n')) + '\r\n'); first = false;
    });
    download(new Blob(['﻿', ...parts], { type: 'text/csv' }), 'tickets-' + new Date().toISOString().slice(0, 10) + '.csv');
    toast('CSV saved — open it in Excel');
  }

  /* ================= welcome / bind / boot ================= */
  function showWelcome() { $('#welcome').hidden = !!S.welcomeDismissed; }
  function bind() {
    $$('.tab').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
    $('#scrim').addEventListener('click', closeDrawer);
    window.addEventListener('online', netUpdate); window.addEventListener('offline', netUpdate);
    $('#guideBtn').onclick = () => window.GUIDE.open();
    $('#settingsBtn').onclick = openSettings;
    $('#welcomeClose').onclick = async () => { S.welcomeDismissed = true; await savePrefs(); showWelcome(); toast('Welcome banner hidden. Settings → Replay Welcome Tour brings it back.'); };
    $('#tourStart').onclick = () => window.TOUR.start();

    const reload = debounce(() => { state.page = 0; loadTickets(); }, 250);
    $('#tSearch').addEventListener('input', reload);
    ['tStatus', 'tPriority'].forEach((id) => $('#' + id).addEventListener('change', () => { state.page = 0; loadTickets(); }));
    $('#viewTable').onclick = () => { state.mode = 'table'; $('#viewTable').classList.add('active'); $('#viewKanban').classList.remove('active'); loadTickets(); };
    $('#viewKanban').onclick = () => { state.mode = 'kanban'; $('#viewKanban').classList.add('active'); $('#viewTable').classList.remove('active'); loadTickets(); };
    $('#pgPrev').onclick = () => { if (state.page > 0) { state.page--; loadTickets(); } };
    $('#pgNext').onclick = () => { state.page++; loadTickets(); };
    $('#newTicketBtn').onclick = openNewTicket;
    $('#view-tickets').addEventListener('click', async (e) => {
      const d = e.target.closest('[data-diag]'); if (d) return openDiag(d.dataset.diag);
      const rs = e.target.closest('[data-restore]');
      if (rs) { await DB.restoreFromCold(rs.dataset.restore); toast('Ticket brought back'); await loadKpis(); return loadTickets(); }
      const q = e.target.closest('[data-quick]');
      if (q) { state.quick = state.quick === q.dataset.quick ? '' : q.dataset.quick; state.page = 0; await loadKpis(); return loadTickets(); }
      const row = e.target.closest('[data-id]'); if (row) openDrawer(row.dataset.id);
    });

    fillSelect('opcPreset', DIAG.PRESETS.opc); fillSelect('mbPreset', DIAG.PRESETS.modbus); fillSelect('wwPreset', DIAG.PRESETS.wonderware); fillSelect('plcSel', DIAG.PRESETS.plc);
    $('#opcPreset').onchange = () => applyOpc($('#opcPreset').value); $('#opcExample').onclick = () => loadExample('opc');
    $('#opcCheck').onclick = checkOpc; $('#opcCustom').addEventListener('keydown', (e) => { if (e.key === 'Enter') checkOpc(); });
    $('#mbPreset').onchange = () => applyModbus($('#mbPreset').value); $('#mbExample').onclick = () => loadExample('modbus'); $('#mbBuild').onclick = buildModbus;
    $('#wwPreset').onchange = () => applyWw($('#wwPreset').value); $('#wwExample').onclick = () => loadExample('wonderware');
    $('#hBuild').onclick = runQuery; $('#qsCheck').onclick = runScript; $('#afSample').onclick = () => { $('#afLog').value = DIAG.alarmSample(); }; $('#afRun').onclick = runFlood;
    $('#plcSel').onchange = () => applyPlc($('#plcSel').value); $('#plcExample').onclick = () => loadExample('plc');
    $$('[data-attach]').forEach((b) => b.addEventListener('click', () => attachDiag(b.dataset.attach)));
    $('#view-diag').addEventListener('change', (e) => {
      const ck = e.target.dataset && e.target.dataset.ck; if (!ck) return;
      const [tool, i] = ck.split(':'); state.diag[tool].checks[+i] = e.target.checked;
    });
    $('#diagTicket').onchange = async () => { state.diagTicket = $('#diagTicket').value; await renderDiagBanner(); };
  }

  async function init() {
    startClock(); netUpdate(); setupInstall(); bind();
    registerSW();
    try {
      await DB.open();
      await loadPrefs();
      await seedIfNeeded();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      $('#ticketTableWrap').innerHTML = '<div class="card"><b class="bad">Database error:</b> ' + esc(e.message || e) + '<br>IndexedDB is required. Turn off private browsing and reload.</div>';
      return;
    }
    showWelcome();
    const params = new URLSearchParams(location.search);
    await switchView(params.get('view') === 'diag' ? 'diag' : 'tickets');
    if (params.get('action') === 'new-ticket') openNewTicket();
    if (params.get('action') === 'settings') openSettings();
    setInterval(() => { if (state.view === 'tickets' && !state.drawerTicket && $('#modal').hidden) { loadKpis(); } }, 60000);
  }

  window.APP = { switchView, openModal, closeModal, closeAll, closeDrawer, openNewTicket, openSettings, openDiag, openDrawer, loadExample, ensureDiagTicket, flash, toast, offlineReport, showWelcome,
    openFirstActive: async () => { const r = await DB.page('tickets', { index: 'updatedAt', direction: 'prev', limit: 1, filter: (t) => ACTIVE.has(t.status) }); if (r.rows[0]) { await switchView('tickets'); await openDrawer(r.rows[0].id); } },
    prefs: () => S };
  init();
})();
