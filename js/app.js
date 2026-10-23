/* SCADA HelpDesk OS — application logic */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = DIAG.esc;
  const H = 3600000;
  const MAXN = Number.MAX_SAFE_INTEGER;
  const STATUSES = ['Open', 'In Progress', 'Pending Client', 'Escalated', 'Resolved', 'Closed'];
  const ACTIVE = new Set(['Open', 'In Progress', 'Pending Client', 'Escalated']);
  const PROTOCOLS = ['OPC UA', 'OPC DA', 'Modbus TCP', 'Modbus RTU', 'Siemens S7', 'EtherNet/IP', 'Wonderware', 'SQL/Historian'];
  const PAGE_SIZE = 25;

  const GSTT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const GSTD = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const GSTP = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtDT = (t) => (t ? GSTD.format(new Date(t)) + ' GST' : '—');
  const slug = (s) => String(s).replace(/\s+/g, '-');

  const state = { page: 0, mode: 'table', lastDiag: {}, dl: { offset: 0, type: '' }, deferredPrompt: null, drawerTicket: null, drawerTimer: null, bom: { lines: [], siteId: '' }, mbExtra: '', swReg: null, wantReload: false, hasMore: false };

  /* ---------- helpers ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 3200);
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
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
  const badgeP = (p) => '<span class="badge p-' + esc(p) + '">' + esc(p) + '</span>';
  const badgeS = (s) => '<span class="badge s-' + slug(esc(s)) + '">' + esc(s) + '</span>';
  function slaInfo(t, now) {
    const done = t.status === 'Resolved' || t.status === 'Closed';
    if (done) { const met = (t.resolvedAt || t.updatedAt) <= t.slaResolveDue; return { cls: met ? 'sla-ok' : 'sla-bad', text: met ? 'Met' : 'Breached' }; }
    const rem = t.slaResolveDue - now;
    const total = SEED.SLA[t.priority].resolveH * H;
    return { cls: rem < 0 ? 'sla-bad' : rem < total * 0.25 ? 'sla-warn' : 'sla-ok', text: rem < 0 ? 'BREACHED ' + fmtDur(rem) : fmtDur(rem) + ' left' };
  }

  /* ---------- modal ---------- */
  function openModal(html) {
    $('#modalBox').innerHTML = html;
    $('#modal').hidden = false;
    const first = $('#modalBox input, #modalBox textarea, #modalBox select');
    if (first) first.focus();
  }
  function closeModal() { $('#modal').hidden = true; $('#modalBox').innerHTML = ''; }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (!$('#drawer').hidden) closeDrawer(); }
  });
  $('#modal').addEventListener('mousedown', (e) => { if (e.target === $('#modal')) closeModal(); });

  /* ---------- clock / network / SW / install ---------- */
  function startClock() {
    const tick = () => { $('#gstClock').textContent = GSTT.format(new Date()); };
    tick(); setInterval(tick, 1000);
  }
  function netUpdate() {
    const on = navigator.onLine;
    $('#netDot').className = 'dot' + (on ? '' : ' off');
    $('#netText').textContent = on ? 'Online' : 'Offline';
  }
  function swStatus(txt, cls) { $('#swText').textContent = 'SW: ' + txt; $('#swDot').className = 'dot' + (cls ? ' ' + cls : ''); }
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return swStatus('unsupported', 'off');
    if (location.protocol === 'file:') return swStatus('needs http(s)', 'warn');
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      state.swReg = reg;
      swStatus(reg.active ? 'active' : 'installing', reg.active ? '' : 'warn');
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (nw) nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('App update ready — open Storage Vault → Check for Update.');
          if (nw.state === 'activated') swStatus('active');
        });
      });
      navigator.serviceWorker.ready.then(() => swStatus('active'));
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (state.wantReload) location.reload(); });
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'SYNC_QUEUE_FLUSH') toast('Back online — all changes were already saved locally.'); });
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
      else openModal('<h3>Install on iPhone / iPad</h3><ol><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. Launch it from the home screen; it runs fully offline.</li></ol><div class="row"><button class="btn accent" data-close>Got it</button></div>');
    });
  }
  document.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) closeModal(); });

  async function storagePill() {
    try {
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      $('#storagePill').textContent = 'Storage: ' + (est ? (est.usage / 1048576).toFixed(1) : '?') + ' MB / Multi-Year Ready';
    } catch (_) { /* ignore */ }
  }

  /* ---------- seed ---------- */
  async function seedIfNeeded() {
    if (await DB.getMeta('seeded', false)) return;
    const now = Date.now();
    await DB.putMany('sites_bom', SEED.sites);
    await DB.putMany('knowledge_base', SEED.kb);
    await DB.putMany('training_sessions', SEED.training);
    await DB.putMany('qhse_audits', SEED.qhse);
    await DB.putMany('tickets', SEED.buildTickets(now));
    await DB.putMany('diagnostics', SEED.buildDiagnostics(now));
    await DB.setMeta('ticketSeq', 1000 + SEED.ticketCount);
    await DB.setMeta('seeded', true);
  }

  /* ---------- tabs ---------- */
  function switchView(name) {
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'command') { loadKpis(); loadTickets(); }
    if (name === 'diag') { loadTicketOptions(); loadDiagLog(true); }
    if (name === 'kb') { renderKb(); renderTraining(); }
    if (name === 'sites') { renderSites(); loadBomSites(); renderQhse(); }
    if (name === 'vault') refreshVault();
  }

  /* ================= COMMAND CENTER ================= */
  async function loadKpis() {
    const now = Date.now();
    const rangeOf = (k) => IDBKeyRange.bound([k, 0], [k, MAXN]);
    let p12 = 0;
    for (const p of ['P1', 'P2']) {
      const r = await DB.page('tickets', { index: 'priority_createdAt', range: rangeOf(p), filter: (t) => ACTIVE.has(t.status), limit: 0, countCap: MAXN, needTotal: true });
      p12 += r.total;
    }
    let active = 0;
    for (const s of ['Open', 'In Progress', 'Pending Client', 'Escalated']) active += await DB.countIndex('tickets', 'status_updatedAt', rangeOf(s));
    const done = [];
    for (const s of ['Resolved', 'Closed']) {
      const r = await DB.page('tickets', { index: 'status_updatedAt', range: rangeOf(s), limit: 300, direction: 'prev' });
      done.push(...r.rows);
    }
    const withRes = done.filter((t) => t.resolvedAt);
    const mttr = withRes.length ? withRes.reduce((s, t) => s + (t.resolvedAt - t.createdAt), 0) / withRes.length : 0;
    const met = withRes.filter((t) => t.resolvedAt <= t.slaResolveDue).length;
    const sla = withRes.length ? Math.round((met / withRes.length) * 100) : 100;
    const floods = (await DB.page('diagnostics', { index: 'type_timestamp', range: IDBKeyRange.bound(['alarmflood', now - 7 * 86400000], ['alarmflood', now]), filter: (d) => d.payload && d.payload.flood, limit: 0, countCap: MAXN, needTotal: true })).total;
    const card = (cls, v, k) => '<div class="kpi ' + cls + '"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>';
    $('#kpis').innerHTML =
      card(p12 ? 'red' : 'green', p12, 'Open P1 / P2 incidents') +
      card('blue', active, 'Active tickets') +
      card('amber', withRes.length ? fmtDur(mttr) : '—', 'Mean time to resolve') +
      card(floods ? 'red' : 'green', floods, 'Alarm floods (7 days)') +
      card(sla >= 90 ? 'green' : sla >= 75 ? 'amber' : 'red', sla + '%', 'SLA compliance');
  }

  function ticketFilters() {
    const q = $('#tSearch').value.trim().toLowerCase();
    return { q, st: $('#tStatus').value, pr: $('#tPriority').value, pt: $('#tProtocol').value };
  }
  async function loadTickets() {
    const f = ticketFilters();
    if (state.mode === 'kanban') return loadKanban(f);
    const opts = { limit: PAGE_SIZE, offset: state.page * PAGE_SIZE, direction: 'prev', countCap: 100000 };
    if (f.st) { opts.index = 'status_updatedAt'; opts.range = IDBKeyRange.bound([f.st, 0], [f.st, MAXN]); }
    else if (f.pr) { opts.index = 'priority_createdAt'; opts.range = IDBKeyRange.bound([f.pr, 0], [f.pr, MAXN]); }
    else opts.index = 'updatedAt';
    opts.filter = (t) => (!f.pr || t.priority === f.pr) && (!f.pt || t.protocol === f.pt) &&
      (!f.q || (t.ticketNumber + ' ' + t.title + ' ' + t.siteName + ' ' + t.protocol + ' ' + (t.reporter || '')).toLowerCase().includes(f.q));
    const r = await DB.page('tickets', opts);
    const now = Date.now();
    let html = '<div class="tbl-scroll"><table><thead><tr><th>Ticket</th><th>Title</th><th>Site</th><th>Protocol</th><th>Pri</th><th>Status</th><th>SLA</th><th>Updated</th></tr></thead><tbody>';
    if (!r.rows.length) html += '<tr><td colspan="8" class="hint">No tickets match the current filters.</td></tr>';
    r.rows.forEach((t) => {
      const s = slaInfo(t, now);
      html += '<tr data-id="' + esc(t.id) + '"><td class="mono">' + esc(t.ticketNumber) + '</td><td>' + esc(t.title) + '</td><td>' + esc(t.siteName) + '</td><td>' + esc(t.protocol) + '</td><td>' + badgeP(t.priority) + '</td><td>' + badgeS(t.status) + '</td><td class="' + s.cls + '">' + esc(s.text) + '</td><td class="hint">' + esc(fmtDT(t.updatedAt)) + '</td></tr>';
    });
    $('#ticketTableWrap').innerHTML = html + '</tbody></table></div>';
    $('#ticketTableWrap').hidden = false; $('#ticketKanban').hidden = true;
    state.hasMore = r.hasMore;
    const from = r.rows.length ? state.page * PAGE_SIZE + 1 : 0;
    $('#pgInfo').textContent = 'Rows ' + from + '–' + (state.page * PAGE_SIZE + r.rows.length) + (r.hasMore ? ' (more available)' : ' (end)');
    $('#pgPrev').disabled = state.page === 0;
    $('#pgNext').disabled = !state.hasMore;
  }
  async function loadKanban(f) {
    const now = Date.now();
    let html = '';
    for (const s of STATUSES) {
      const r = await DB.page('tickets', {
        index: 'status_updatedAt', range: IDBKeyRange.bound([s, 0], [s, MAXN]), direction: 'prev', limit: 15, countCap: MAXN,
        filter: (t) => (!f.pr || t.priority === f.pr) && (!f.pt || t.protocol === f.pt) && (!f.q || (t.ticketNumber + ' ' + t.title + ' ' + t.siteName).toLowerCase().includes(f.q))
      });
      const hasF = f.pr || f.pt || f.q;
      const cnt = hasF ? r.rows.length + (r.hasMore ? '+' : '') : await DB.countIndex('tickets', 'status_updatedAt', IDBKeyRange.bound([s, 0], [s, MAXN]));
      html += '<div class="kcol"><h4>' + esc(s) + ' (' + cnt + ')</h4>';
      r.rows.forEach((t) => {
        const sl = slaInfo(t, now);
        html += '<div class="kcard" data-id="' + esc(t.id) + '"><div>' + badgeP(t.priority) + ' <span class="mono">' + esc(t.ticketNumber) + '</span></div><div>' + esc(t.title) + '</div><div class="hint">' + esc(t.siteName) + '</div><div class="' + sl.cls + '">' + esc(sl.text) + '</div></div>';
      });
      html += '</div>';
    }
    $('#ticketKanban').innerHTML = html;
    $('#ticketKanban').hidden = false; $('#ticketTableWrap').hidden = true;
    $('#pgInfo').textContent = 'Kanban shows the 15 most recently updated per column';
    $('#pgPrev').disabled = true; $('#pgNext').disabled = true;
  }

  async function allSites() { return (await DB.getAll('sites_bom')).sort((a, b) => a.name.localeCompare(b.name)); }

  async function openNewTicket() {
    const sites = await allSites();
    openModal('<h3>New Support Ticket</h3><form id="ntForm" class="row3" style="grid-template-columns:1fr 1fr">' +
      '<label style="grid-column:1/-1">Title<input name="title" required maxlength="160"></label>' +
      '<label style="grid-column:1/-1">Description<textarea name="description" rows="4" required></textarea></label>' +
      '<label>Site<select name="siteId">' + sites.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('') + '</select></label>' +
      '<label>Protocol / area<select name="protocol">' + PROTOCOLS.map((p) => '<option>' + p + '</option>').join('') + '</select></label>' +
      '<label>Priority<select name="priority"><option value="P1">P1 — Critical (resolve 4 h)</option><option value="P2">P2 — High (8 h)</option><option value="P3" selected>P3 — Medium (24 h)</option><option value="P4">P4 — Low (72 h)</option></select></label>' +
      '<label>Category<select name="category"><option>Communications</option><option>Alarm Management</option><option>Historian</option><option>Scripting</option><option>System Platform</option><option>Integration</option><option>Performance</option><option>Change Request</option><option>Training</option></select></label>' +
      '<label>Reported by<input name="reporter" required></label>' +
      '<label>Contact phone / email<input name="contact"></label>' +
      '<div class="row" style="grid-column:1/-1"><button class="btn accent" type="submit">Create Ticket</button><button class="btn" type="button" data-close>Cancel</button></div></form>');
    $('#ntForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target).entries());
      const t = await createTicket(d);
      closeModal(); toast('Created ' + t.ticketNumber);
      state.page = 0; loadKpis(); loadTickets();
    });
  }
  async function createTicket(d) {
    const now = Date.now();
    const site = await DB.get('sites_bom', d.siteId);
    const t = {
      id: DB.uid('tk'), ticketNumber: await DB.nextTicketNumber(), title: d.title.trim(), description: d.description.trim(),
      siteId: d.siteId, siteName: site ? site.name : '', protocol: d.protocol, priority: d.priority, status: 'Open', category: d.category,
      reporter: d.reporter.trim(), contact: (d.contact || '').trim(), assignee: 'SCADA Engineer', createdAt: now, updatedAt: now, resolvedAt: null, respondedAt: null,
      slaResolveDue: now + SEED.SLA[d.priority].resolveH * H, rootCause: '', correctiveAction: '', preventiveAction: '', hoursSpent: 0,
      timeline: [{ ts: now, author: d.reporter.trim() || 'Reporter', text: 'Ticket logged.' }],
      qhse: { ptw: false, loto: false, backup: false, rollback: false, ops: false, cyber: false, force: false, ppe: false, comms: false, signedBy: '', signedAt: null }
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
    let t = await DB.get('tickets', id);
    if (!t) return toast('Ticket not found (it may be in the cold archive).');
    state.drawerTicket = t;
    const diags = (await DB.byIndex('diagnostics', 'ticketId', id)).sort((a, b) => b.timestamp - a.timestamp);
    const gatePass = SEED.QHSE_ITEMS.filter((i) => i.mandatory).every((i) => t.qhse && t.qhse[i.id]);
    $('#drawer').innerHTML =
      '<div class="card-head"><div><span class="mono" style="font-size:16px">' + esc(t.ticketNumber) + '</span> ' + badgeP(t.priority) + ' ' + badgeS(t.status) + '</div><button class="btn small" id="dClose">Close ✕</button></div>' +
      '<h3 style="margin:0;text-transform:none;font-size:17px;color:#e2e8f0">' + esc(t.title) + '</h3>' +
      '<div class="card"><div class="sla-timer" id="slaTimer"></div><div class="hint">Resolution due ' + esc(fmtDT(t.slaResolveDue)) + ' (' + esc(SEED.SLA[t.priority].label) + ': ' + SEED.SLA[t.priority].resolveH + ' h) · first response target ' + SEED.SLA[t.priority].responseH + ' h' + (t.respondedAt ? ' · responded ' + esc(fmtDT(t.respondedAt)) : ' · <span class="sla-warn">not yet responded</span>') + '</div></div>' +
      '<div class="grid2" style="grid-template-columns:1fr 1fr;gap:6px"><div class="srow"><span>Site</span><span>' + esc(t.siteName) + '</span></div><div class="srow"><span>Protocol</span><span>' + esc(t.protocol) + '</span></div><div class="srow"><span>Category</span><span>' + esc(t.category) + '</span></div><div class="srow"><span>Reporter</span><span>' + esc(t.reporter || '—') + '</span></div><div class="srow"><span>Contact</span><span>' + esc(t.contact || '—') + '</span></div><div class="srow"><span>Created</span><span>' + esc(fmtDT(t.createdAt)) + '</span></div></div>' +
      '<div class="item"><div class="m">Description</div>' + esc(t.description).replace(/\n/g, '<br>') + '</div>' +
      '<div class="row"><label>Status<select id="dStatus">' + STATUSES.map((s) => '<option' + (s === t.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label><button class="btn small accent" id="dSetStatus">Update status</button><button class="btn small danger" id="dEscalate">Escalate</button><button class="btn small" id="dReport">Service report</button></div>' +
      '<div class="card"><h3>QHSE &amp; Cyber-Safety Gate — Annexure-SCT-HR-001</h3><div class="gate ' + (gatePass ? 'pass' : '') + '" id="gateBox">' + (gatePass ? 'Gate complete: remote forcing / online changes permitted' + (t.qhse.signedBy ? ' (signed by ' + esc(t.qhse.signedBy) + ' ' + esc(fmtDT(t.qhse.signedAt)) + ')' : '') : 'Gate OPEN — complete every mandatory item before any remote PLC / SCADA forcing or online change.') + '</div><div class="checks">' +
      SEED.QHSE_ITEMS.map((i) => '<label><input type="checkbox" data-gate="' + i.id + '"' + (t.qhse && t.qhse[i.id] ? ' checked' : '') + '> ' + esc(i.text) + (i.mandatory ? ' <b style="color:#f59e0b">*</b>' : '') + '</label>').join('') +
      '</div><div class="row"><label>Engineer name (sign-off)<input id="gateName" value="' + esc(t.qhse && t.qhse.signedBy || '') + '"></label><button class="btn small accent" id="gateSign">Record gate</button></div></div>' +
      '<div class="card"><h3>Root Cause Analysis &amp; Hours</h3><label>Root cause<textarea id="rcaRoot" rows="2">' + esc(t.rootCause || '') + '</textarea></label><label>Corrective action<textarea id="rcaFix" rows="2">' + esc(t.correctiveAction || '') + '</textarea></label><label>Preventive action<textarea id="rcaPrev" rows="2">' + esc(t.preventiveAction || '') + '</textarea></label><div class="row"><label>Hours spent<input id="rcaHrs" type="number" min="0" step="0.25" value="' + (t.hoursSpent || 0) + '"></label><button class="btn small accent" id="rcaSave">Save RCA</button></div></div>' +
      '<div class="card"><h3>Attached SCADA diagnostics (' + diags.length + ')</h3>' + (diags.length ? diags.map((d) => '<div class="item"><div class="t">' + esc(d.diagnosticType.toUpperCase()) + ' — ' + esc(d.summary) + '</div><div class="m">' + esc(fmtDT(d.timestamp)) + '</div></div>').join('') : '<div class="hint">None yet. Use Remote Diagnostics → Attach Diagnostic Result to Ticket.</div>') + '</div>' +
      '<div class="card"><h3>Timeline</h3><div class="list" style="max-height:220px">' + t.timeline.slice().reverse().map((x) => '<div class="item"><div class="m">' + esc(fmtDT(x.ts)) + ' · ' + esc(x.author) + '</div>' + esc(x.text) + '</div>').join('') + '</div><div class="row"><label>Add note<input id="noteText"></label><button class="btn small" id="noteAdd">Add</button></div></div>';
    $('#drawer').hidden = false; $('#scrim').hidden = false;
    const tick = () => {
      const tt = state.drawerTicket; if (!tt) return;
      const done = tt.status === 'Resolved' || tt.status === 'Closed';
      const el = $('#slaTimer'); if (!el) return;
      if (done) { const s = slaInfo(tt, Date.now()); el.className = 'sla-timer ' + s.cls; el.textContent = 'SLA ' + s.text; }
      else { const rem = tt.slaResolveDue - Date.now(); el.className = 'sla-timer ' + slaInfo(tt, Date.now()).cls; el.textContent = rem < 0 ? 'SLA BREACHED by ' + fmtDur(-rem, true) : 'SLA remaining ' + fmtDur(rem, true); }
    };
    tick(); clearInterval(state.drawerTimer); state.drawerTimer = setInterval(tick, 1000);

    $('#dClose').onclick = closeDrawer;
    $('#dSetStatus').onclick = async () => {
      const ns = $('#dStatus').value;
      if (ns === t.status) return toast('Status unchanged.');
      if ((ns === 'Resolved' || ns === 'Closed') && !t.rootCause.trim() && !$('#rcaRoot').value.trim()) return toast('Enter the root cause before resolving.');
      await applyRca(t);
      const now = Date.now();
      if (!t.respondedAt && ns !== 'Open') t.respondedAt = now;
      if (ns === 'Resolved' && !t.resolvedAt) t.resolvedAt = now;
      if (ns === 'Closed' && !t.resolvedAt) t.resolvedAt = now;
      if (ACTIVE.has(ns)) t.resolvedAt = null;
      t.timeline.push({ ts: now, author: 'SCADA Engineer', text: 'Status changed: ' + t.status + ' → ' + ns });
      t.status = ns; await saveTicket(t); toast('Status updated'); afterTicketChange(t.id);
    };
    $('#dEscalate').onclick = async () => {
      const now = Date.now();
      if (!t.respondedAt) t.respondedAt = now;
      t.timeline.push({ ts: now, author: 'SCADA Engineer', text: 'Escalated to senior engineer / vendor support.' });
      t.status = 'Escalated'; await saveTicket(t); toast('Ticket escalated'); afterTicketChange(t.id);
    };
    $('#dReport').onclick = () => showReport(t, diags);
    $$('[data-gate]', $('#drawer')).forEach((cb) => cb.addEventListener('change', () => { t.qhse[cb.dataset.gate] = cb.checked; }));
    $('#gateSign').onclick = async () => {
      const name = $('#gateName').value.trim();
      if (!name) return toast('Enter the engineer name to record the gate.');
      const pass = SEED.QHSE_ITEMS.filter((i) => i.mandatory).every((i) => t.qhse[i.id]);
      t.qhse.signedBy = name; t.qhse.signedAt = Date.now();
      const checks = {}; SEED.QHSE_ITEMS.forEach((i) => { checks[i.id] = !!t.qhse[i.id]; });
      await DB.put('qhse_audits', { id: DB.uid('qa'), timestamp: Date.now(), ticketId: t.id, site: t.siteName, engineer: name, annexure: 'Annexure-SCT-HR-001', checks, result: pass ? 'PASS' : 'FAIL', remarks: 'Recorded from ticket ' + t.ticketNumber });
      t.timeline.push({ ts: Date.now(), author: name, text: 'QHSE gate recorded: ' + (pass ? 'PASS' : 'FAIL (mandatory items missing)') });
      await saveTicket(t); toast('Gate ' + (pass ? 'PASSED' : 'recorded as FAIL')); afterTicketChange(t.id);
    };
    $('#rcaSave').onclick = async () => { await applyRca(t); t.timeline.push({ ts: Date.now(), author: 'SCADA Engineer', text: 'RCA / hours updated.' }); await saveTicket(t); toast('RCA saved'); afterTicketChange(t.id); };
    $('#noteAdd').onclick = async () => {
      const v = $('#noteText').value.trim(); if (!v) return;
      t.timeline.push({ ts: Date.now(), author: 'SCADA Engineer', text: v }); await saveTicket(t); afterTicketChange(t.id);
    };
  }
  async function applyRca(t) {
    t.rootCause = $('#rcaRoot').value.trim(); t.correctiveAction = $('#rcaFix').value.trim();
    t.preventiveAction = $('#rcaPrev').value.trim(); t.hoursSpent = Math.max(0, +$('#rcaHrs').value || 0);
  }
  function afterTicketChange(id) { openDrawer(id); loadKpis(); loadTickets(); }

  function reportHtml(t, diags) {
    return '<div class="report"><h2>Client Service Report</h2><div><b>Al Gurg Automation &amp; Controls</b> — Dubai, U.A.E.</div><table style="margin-top:10px">' +
      [['Ticket', t.ticketNumber], ['Site', t.siteName], ['Priority', t.priority + ' — ' + SEED.SLA[t.priority].label], ['Status', t.status], ['Protocol', t.protocol], ['Category', t.category], ['Reported by', t.reporter], ['Logged', fmtDT(t.createdAt)], ['Resolved', fmtDT(t.resolvedAt)], ['Engineer', t.assignee || 'SCADA Engineer'], ['Hours spent', t.hoursSpent || 0]]
        .map((r) => '<tr><th style="width:30%">' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>' +
      '<h3>Issue</h3><p>' + esc(t.description).replace(/\n/g, '<br>') + '</p><h3>Root cause</h3><p>' + esc(t.rootCause || 'Not yet determined').replace(/\n/g, '<br>') + '</p><h3>Corrective action</h3><p>' + esc(t.correctiveAction || '—') + '</p><h3>Preventive action</h3><p>' + esc(t.preventiveAction || '—') + '</p>' +
      '<h3>Diagnostics</h3>' + (diags.length ? '<ul>' + diags.map((d) => '<li>' + esc(fmtDT(d.timestamp)) + ' — ' + esc(d.summary) + '</li>').join('') + '</ul>' : '<p>None attached.</p>') +
      '<h3>QHSE gate (Annexure-SCT-HR-001)</h3><p>' + (t.qhse && t.qhse.signedBy ? 'Recorded by ' + esc(t.qhse.signedBy) + ' on ' + esc(fmtDT(t.qhse.signedAt)) : 'No gate recorded.') + '</p>' +
      '<h3>Activity log</h3><ul>' + t.timeline.map((x) => '<li>' + esc(fmtDT(x.ts)) + ' — ' + esc(x.author) + ': ' + esc(x.text) + '</li>').join('') + '</ul>' +
      '<table style="margin-top:20px"><tr><th>Engineer signature</th><th>Client representative</th></tr><tr><td style="height:50px"></td><td></td></tr></table></div>';
  }
  function showReport(t, diags) {
    openModal('<div class="row"><button class="btn accent small" id="rPrint">Print / Save PDF</button><button class="btn small" id="rDl">Download HTML</button><button class="btn small" data-close>Close</button></div>' + reportHtml(t, diags));
    $('#rPrint').onclick = () => window.print();
    $('#rDl').onclick = () => {
      const doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Service Report ' + esc(t.ticketNumber) + '</title><style>body{font:14px Arial,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#e5e7eb}</style></head><body>' + reportHtml(t, diags) + '</body></html>';
      download(new Blob([doc], { type: 'text/html' }), 'Service-Report-' + t.ticketNumber + '.html');
    };
  }

  /* ================= DIAGNOSTICS ================= */
  async function loadTicketOptions() {
    const r = await DB.page('tickets', { index: 'updatedAt', direction: 'prev', limit: 100, filter: (t) => t.status !== 'Closed' });
    const cur = $('#attachTicket').value;
    $('#attachTicket').innerHTML = '<option value="">— select ticket —</option>' + r.rows.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.ticketNumber + ' · ' + t.title.slice(0, 60)) + '</option>').join('');
    if (cur) $('#attachTicket').value = cur;
  }
  function setLast(type, summary, payload) { state.lastDiag[type] = { type, summary, payload }; }

  function runOpc() {
    const r = DIAG.opcDecode($('#opcHex').value);
    $('#opcOut').innerHTML = DIAG.opcRender(r);
    if (r.ok) setLast('opc', 'OPC ' + r.kind + ' ' + r.raw + ' — ' + r.quality + ' / ' + r.substatus, { input: r.raw, quality: r.quality, substatus: r.substatus, limit: r.limit, advice: r.advice });
  }
  function runOpcEndpoint() {
    const r = DIAG.opcEndpointCheck($('#opcEndpoint').value);
    $('#opcEndpointOut').innerHTML = '<b>' + esc(r.kind) + '</b>: ' + r.issues.map((i) => '<span class="' + (r.ok ? 'good' : 'bad') + '">' + esc(i) + '</span>').join('\n');
    setLast('opc', 'OPC endpoint check (' + r.kind + '): ' + $('#opcEndpoint').value.trim() + ' — ' + (r.ok ? 'syntax OK' : 'issues found'), { endpoint: $('#opcEndpoint').value.trim(), kind: r.kind, issues: r.issues });
  }
  function renderModbus() {
    const r = DIAG.modbusBuild({ slave: $('#mbSlave').value, func: $('#mbFunc').value, addr: $('#mbAddr').value, qty: $('#mbQty').value, data: $('#mbData').value });
    if (!r.ok) { $('#mbOut').innerHTML = '<span class="bad">' + esc(r.error) + '</span>'; return; }
    let h = '<b>RTU request</b>:  ' + esc(r.rtu) + '\n<b>CRC-16</b>:  ' + esc(r.crc) + '\n<b>TCP (MBAP)</b>:  ' + esc(r.tcp) + '\n<b>ASCII</b>:  ' + esc(r.ascii) + '  (LRC ' + esc(r.lrc) + ')\n<b>Register reference</b>:  ' + esc(r.reference) + ' (zero-based address ' + r.addr + ')';
    r.notes.forEach((n) => { h += '\n<span class="warn">' + esc(n) + '</span>'; });
    if (state.mbExtra) h += '\n\n' + esc(state.mbExtra);
    $('#mbOut').innerHTML = h;
    setLast('modbus', 'Modbus FC' + r.func + ' slave ' + r.slave + ' addr ' + r.addr + ' qty ' + r.qty + ' — RTU ' + r.rtu, { slave: r.slave, func: r.func, start: r.addr, qty: r.qty, requestRtu: r.rtu, requestTcp: r.tcp, crc: r.crc, extra: state.mbExtra });
  }
  function runHistorian() {
    const r = DIAG.historianQuery({ tags: $('#hTags').value, start: $('#hStart').value + ':00Z', end: $('#hEnd').value + ':00Z', mode: $('#hMode').value, res: $('#hRes').value, rows: $('#hRows').value });
    if (!r.ok) { $('#hSql').textContent = '-- ' + r.error; return; }
    $('#hSql').textContent = (r.warns.length ? r.warns.map((w) => '-- WARNING: ' + w).join('\n') + '\n' : '') + r.sql;
    setLast('historian', 'Historian query: ' + r.tags.length + ' tag(s), ' + r.mode + (r.res ? ' @' + r.res + ' ms' : ''), { tags: r.tags, mode: r.mode, resolution: r.res, rows: r.rows, sql: r.sql });
  }
  function runDeadband() {
    const r = DIAG.deadband({ scan: $('#dbScan').value, tags: $('#dbTags').value, chg: $('#dbChg').value, bytes: $('#dbBytes').value });
    $('#dbOut').innerHTML = r.ok ? r.text : '<span class="bad">' + esc(r.error) + '</span>';
    if (r.ok) setLast('historian', 'Deadband calc: ' + $('#dbTags').value + ' tags, saves ' + r.savedPct.toFixed(1) + '% storage (' + r.yearGbStored.toFixed(1) + ' GB/yr)', { scanMs: +$('#dbScan').value, tags: +$('#dbTags').value, changePct: +$('#dbChg').value, yearGbRaw: r.yearGbRaw, yearGbStored: r.yearGbStored });
  }
  function runQs() {
    const r = DIAG.quickScriptLint($('#qsCode').value);
    $('#qsOut').innerHTML = '<b>' + esc(r.mode || 'Script') + '</b> — ' + (r.ok ? '<span class="good">no blocking issues</span>' : '<span class="bad">issues found</span>') + '\n' + r.issues.map((i) => '<span class="' + (i.lvl === 'bad' ? 'bad' : i.lvl === 'warn' ? 'warn' : '') + '">• ' + esc(i.msg) + '</span>').join('\n');
    setLast('historian', 'QuickScript lint (' + (r.mode || 'script') + '): ' + r.issues.filter((i) => i.lvl !== 'info').length + ' finding(s)', { issues: r.issues });
  }
  function runAlarm() {
    const r = DIAG.alarmFlood($('#afLog').value);
    if (!r.ok) { $('#afOut').innerHTML = '<span class="bad">' + esc(r.error) + '</span>'; return; }
    $('#afOut').innerHTML = r.text;
    setLast('alarmflood', 'Alarm flood analysis: ' + r.total + ' alarms, peak ' + r.peak + '/10 min' + (r.flood ? ' (FLOOD)' : '') + (r.topTag ? ', top tag ' + r.topTag : ''), { peak10min: r.peak, flood: r.flood, topTag: r.topTag, total: r.total, chattering: r.chatter });
  }
  const RUNNERS = { opc: runOpc, modbus: renderModbus, historian: runHistorian, alarmflood: runAlarm };

  async function attachDiag(type) {
    const tid = $('#attachTicket').value;
    if (!tid) return toast('Select a ticket at the top of the page first.');
    if (!state.lastDiag[type]) RUNNERS[type]();
    const d = state.lastDiag[type];
    if (!d) return toast('Run the diagnostic first.');
    const t = await DB.get('tickets', tid);
    if (!t) return toast('Ticket not found.');
    const now = Date.now();
    await DB.put('diagnostics', { id: DB.uid('dg'), ticketId: tid, timestamp: now, diagnosticType: d.type, summary: d.summary, payload: d.payload });
    t.timeline.push({ ts: now, author: 'SCADA Engineer', text: 'Diagnostic attached: ' + d.summary });
    await saveTicket(t);
    toast('Attached to ' + t.ticketNumber); loadDiagLog(true); loadKpis();
  }

  async function loadDiagLog(reset) {
    if (reset) { state.dl.offset = 0; state.dl.type = $('#dlType').value; $('#dlList').innerHTML = ''; }
    const type = state.dl.type;
    const opts = { limit: 20, offset: state.dl.offset, direction: 'prev' };
    if (type) { opts.index = 'type_timestamp'; opts.range = IDBKeyRange.bound([type, 0], [type, MAXN]); } else opts.index = 'timestamp';
    const r = await DB.page('diagnostics', opts);
    const names = {};
    for (const d of r.rows) if (d.ticketId && !names[d.ticketId]) { const t = await DB.get('tickets', d.ticketId); names[d.ticketId] = t ? t.ticketNumber : '(archived)'; }
    $('#dlList').insertAdjacentHTML('beforeend', r.rows.map((d) => '<div class="item"><div class="t">' + esc(d.diagnosticType.toUpperCase()) + ' — ' + esc(d.summary) + '</div><div class="m">' + esc(fmtDT(d.timestamp)) + ' · ' + (d.ticketId ? 'Ticket ' + esc(names[d.ticketId]) : 'Unbound') + '</div></div>').join(''));
    state.dl.offset += r.rows.length;
    $('#dlMore').disabled = !r.hasMore && r.rows.length < 20;
    if (reset && !r.rows.length) $('#dlList').innerHTML = '<div class="hint">No diagnostics stored yet.</div>';
  }

  function gstLocalInput(ms) {
    const p = GSTP.format(new Date(ms)).replace(', ', 'T').replace(' ', 'T');
    return p.slice(0, 16);
  }

  /* ================= KB & TRAINING ================= */
  async function renderKb() {
    const q = $('#kbSearch').value.trim().toLowerCase(), cat = $('#kbCat').value;
    let rows = await DB.getAll('knowledge_base');
    rows = rows.filter((d) => (!cat || d.category === cat) && (!q || (d.title + ' ' + (d.tags || []).join(' ') + ' ' + d.content).toLowerCase().includes(q)));
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    $('#kbList').innerHTML = rows.slice(0, 150).map((d) => '<div class="item"><div class="t">' + esc(d.title) + '</div><div class="m">' + esc(d.category) + ' · ' + esc((d.tags || []).join(', ')) + ' · updated ' + esc(fmtDT(d.updatedAt)) + '</div><div class="acts"><button class="btn small" data-kbview="' + esc(d.id) + '">View</button><button class="btn small" data-kbedit="' + esc(d.id) + '">Edit</button><button class="btn small danger" data-kbdel="' + esc(d.id) + '">Delete</button></div></div>').join('') || '<div class="hint">No documents match.</div>';
  }
  async function kbForm(id) {
    const d = id ? await DB.get('knowledge_base', id) : { title: '', category: 'SOP', tags: [], content: '' };
    const cats = ['Wonderware', 'PLC Integration', 'SQL / Historian', 'SOP', 'User Manual', 'Design Spec'];
    openModal('<h3>' + (id ? 'Edit' : 'New') + ' Document</h3><form id="kbForm"><label>Title<input name="title" required value="' + esc(d.title) + '"></label><div class="row"><label>Category<select name="category">' + cats.map((c) => '<option' + (c === d.category ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></label><label>Tags (comma-separated)<input name="tags" value="' + esc((d.tags || []).join(', ')) + '"></label></div><label>Content<textarea name="content" rows="12" required>' + esc(d.content) + '</textarea></label><div class="row"><button class="btn accent" type="submit">Save</button><button class="btn" type="button" data-close>Cancel</button></div></form>');
    $('#kbForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      await DB.put('knowledge_base', { id: id || DB.uid('kb'), title: f.title.trim(), category: f.category, tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean), content: f.content, updatedAt: Date.now() });
      closeModal(); renderKb(); toast('Document saved');
    });
  }
  async function renderTraining() {
    const rows = (await DB.getAll('training_sessions')).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    $('#trList').innerHTML = rows.map((s) => {
      const signed = s.attendees.filter((a) => a.signed).length;
      return '<div class="item"><div class="t">' + esc(s.module) + '</div><div class="m">' + esc(s.date) + ' · ' + esc(s.client) + ' · ' + esc(s.trainer) + ' · ' + esc(s.hours) + ' h · competency ' + signed + '/' + s.attendees.length + '</div><div class="checks">' +
        s.attendees.map((a, i) => '<label><input type="checkbox" data-trsign="' + esc(s.id) + ':' + i + '"' + (a.signed ? ' checked' : '') + '> ' + esc(a.name) + ' — competency signed off</label>').join('') +
        '</div><div class="acts"><button class="btn small danger" data-trdel="' + esc(s.id) + '">Delete</button></div></div>';
    }).join('') || '<div class="hint">No sessions logged.</div>';
  }
  async function trainingForm() {
    const sites = await allSites();
    openModal('<h3>Log Training Session</h3><form id="trForm"><div class="row"><label>Date<input type="date" name="date" required value="' + gstLocalInput(Date.now()).slice(0, 10) + '"></label><label>Hours<input type="number" name="hours" min="0" step="0.5" value="2"></label></div><label>Client / site<select name="client">' + sites.map((s) => '<option>' + esc(s.name) + '</option>').join('') + '</select></label><label>Module / curriculum<input name="module" required value="Wonderware InTouch Maintenance"></label><label>Trainer<input name="trainer" required value="SCADA Engineer"></label><label>Attendees (one per line)<textarea name="attendees" rows="5" required></textarea></label><div class="row"><button class="btn accent" type="submit">Save</button><button class="btn" type="button" data-close>Cancel</button></div></form>');
    $('#trForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      const attendees = f.attendees.split(/\r?\n/).map((n) => n.trim()).filter(Boolean).map((name) => ({ name, signed: false }));
      await DB.put('training_sessions', { id: DB.uid('tr'), date: f.date, client: f.client, module: f.module.trim(), trainer: f.trainer.trim(), hours: +f.hours || 0, attendees });
      closeModal(); renderTraining(); toast('Session logged');
    });
  }

  /* ================= SITES / BOM / QHSE ================= */
  async function renderSites() {
    const rows = await allSites();
    $('#siteList').innerHTML = rows.map((s) => '<div class="item"><div class="t">' + esc(s.name) + '</div><div class="m">' + esc(s.sector) + ' · ' + esc(s.city || s.address || '') + ' · ' + esc(s.contact || '') + ' ' + esc(s.phone || '') + '</div><pre class="code" style="white-space:pre-wrap;margin-top:6px">' + esc(s.topology || '') + '</pre>' + (s.bom ? '<div class="m">Saved estimate: AED ' + esc(s.bom.total.toLocaleString(undefined, { maximumFractionDigits: 2 })) + ' (' + esc(fmtDT(s.bom.savedAt)) + ')</div>' : '') + '<div class="acts"><button class="btn small" data-siteedit="' + esc(s.id) + '">Edit</button><button class="btn small danger" data-sitedel="' + esc(s.id) + '">Delete</button></div></div>').join('');
  }
  async function siteForm(id) {
    const s = id ? await DB.get('sites_bom', id) : { name: '', sector: 'Water / Wastewater', city: '', contact: '', phone: '', topology: '' };
    const sectors = ['District Cooling', 'Water / Wastewater', 'Oil & Gas', 'Power Distribution', 'BMS', 'Industrial Manufacturing'];
    openModal('<h3>' + (id ? 'Edit' : 'New') + ' Site</h3><form id="siteForm"><label>Site name<input name="name" required value="' + esc(s.name) + '"></label><div class="row"><label>Sector<select name="sector">' + sectors.map((x) => '<option' + (x === s.sector ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label><label>Location<input name="city" value="' + esc(s.city || '') + '"></label></div><div class="row"><label>Client contact<input name="contact" value="' + esc(s.contact || '') + '"></label><label>Phone<input name="phone" value="' + esc(s.phone || '') + '"></label></div><label>Galaxy / PLC IP topology<textarea name="topology" rows="6">' + esc(s.topology || '') + '</textarea></label><div class="row"><button class="btn accent" type="submit">Save</button><button class="btn" type="button" data-close>Cancel</button></div></form>');
    $('#siteForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      await DB.put('sites_bom', Object.assign({}, s, { id: id || DB.uid('site'), name: f.name.trim(), sector: f.sector, city: f.city, address: f.city, contact: f.contact, phone: f.phone, topology: f.topology, createdAt: s.createdAt || Date.now() }));
      closeModal(); renderSites(); loadBomSites(); toast('Site saved');
    });
  }

  async function loadBomSites() {
    const sites = await allSites();
    const cur = $('#bomSite').value || (sites[0] && sites[0].id) || '';
    $('#bomSite').innerHTML = sites.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('');
    if (cur) $('#bomSite').value = cur;
    await loadBomFor($('#bomSite').value, sites);
  }
  async function loadBomFor(siteId, sites) {
    const s = (sites || await allSites()).find((x) => x.id === siteId);
    state.bom.siteId = siteId;
    if (s && s.bom) {
      state.bom.lines = s.bom.lines.map((l) => Object.assign({}, l));
      $('#bomHrs').value = s.bom.hrs; $('#bomRate').value = s.bom.rate; $('#bomCont').value = s.bom.cont; $('#bomVat').value = s.bom.vat;
    } else state.bom.lines = [{ desc: 'Replacement CPU / communication module', qty: 1, unit: 4500 }, { desc: 'Industrial managed switch', qty: 1, unit: 1800 }];
    renderBomRows(); calcBom();
  }
  function renderBomRows() {
    $('#bomRows').innerHTML = state.bom.lines.map((l, i) => '<div class="bomline"><input data-bl="desc" data-i="' + i + '" value="' + esc(l.desc) + '" placeholder="Part / description" aria-label="Description"><input data-bl="qty" data-i="' + i + '" type="number" min="0" value="' + l.qty + '" aria-label="Quantity"><input data-bl="unit" data-i="' + i + '" type="number" min="0" value="' + l.unit + '" aria-label="Unit price AED"><button class="btn small danger" data-bdel="' + i + '" aria-label="Remove line">✕</button></div>').join('');
  }
  function calcBom() {
    const parts = state.bom.lines.reduce((s, l) => s + (+l.qty || 0) * (+l.unit || 0), 0);
    const labour = (+$('#bomHrs').value || 0) * (+$('#bomRate').value || 0);
    const sub = parts + labour, cont = sub * ((+$('#bomCont').value || 0) / 100), vat = (sub + cont) * ((+$('#bomVat').value || 0) / 100), total = sub + cont + vat;
    const f = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    $('#bomOut').innerHTML = 'Spare parts: AED ' + f(parts) + '\nService labour: AED ' + f(labour) + '\nSubtotal: AED ' + f(sub) + '\nContingency: AED ' + f(cont) + '\nVAT: AED ' + f(vat) + '\n<b>Total: AED ' + f(total) + '</b>';
    state.bom.total = total;
    return total;
  }
  async function renderQhse() {
    const rows = (await DB.getAll('qhse_audits')).sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
    $('#qhseList').innerHTML = rows.map((a) => {
      const miss = SEED.QHSE_ITEMS.filter((i) => i.mandatory && !a.checks[i.id]).map((i) => i.id);
      return '<div class="item"><div class="t">' + (a.result === 'PASS' ? '<span class="badge s-Resolved">PASS</span>' : '<span class="badge s-Escalated">FAIL</span>') + ' ' + esc(a.site) + '</div><div class="m">' + esc(fmtDT(a.timestamp)) + ' · ' + esc(a.engineer) + ' · ' + esc(a.annexure) + (miss.length ? ' · missing: ' + esc(miss.join(', ')) : '') + '</div><div>' + esc(a.remarks || '') + '</div></div>';
    }).join('') || '<div class="hint">No audits recorded.</div>';
  }
  async function qhseForm() {
    const sites = await allSites();
    openModal('<h3>New QHSE Gate Audit — Annexure-SCT-HR-001</h3><form id="qForm"><div class="row"><label>Site<select name="site">' + sites.map((s) => '<option>' + esc(s.name) + '</option>').join('') + '</select></label><label>Engineer<input name="engineer" required value="SCADA Engineer"></label></div><div class="checks">' + SEED.QHSE_ITEMS.map((i) => '<label><input type="checkbox" name="' + i.id + '"> ' + esc(i.text) + (i.mandatory ? ' <b style="color:#f59e0b">*</b>' : '') + '</label>').join('') + '</div><label>Remarks<textarea name="remarks" rows="3"></textarea></label><div class="row"><button class="btn accent" type="submit">Record Audit</button><button class="btn" type="button" data-close>Cancel</button></div></form>');
    $('#qForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const checks = {}; SEED.QHSE_ITEMS.forEach((i) => { checks[i.id] = fd.get(i.id) === 'on'; });
      const pass = SEED.QHSE_ITEMS.filter((i) => i.mandatory).every((i) => checks[i.id]);
      await DB.put('qhse_audits', { id: DB.uid('qa'), timestamp: Date.now(), ticketId: null, site: fd.get('site'), engineer: String(fd.get('engineer')).trim(), annexure: 'Annexure-SCT-HR-001', checks, result: pass ? 'PASS' : 'FAIL', remarks: fd.get('remarks') });
      closeModal(); renderQhse(); toast('Audit ' + (pass ? 'PASSED' : 'recorded as FAIL'));
    });
  }

  /* ================= VAULT ================= */
  async function refreshVault() {
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : { usage: 0, quota: 0 };
    const pct = est.quota ? Math.min(100, (est.usage / est.quota) * 100) : 0;
    $('#vaultQuota').innerHTML = '<div class="srow"><span>Usage (origin)</span><span>' + fmtBytes(est.usage || 0) + '</span></div><div class="srow"><span>Browser quota</span><span>' + (est.quota ? fmtBytes(est.quota) : 'n/a') + '</span></div><div class="bar' + (pct > 80 ? ' hot' : '') + '"><i style="width:' + Math.max(pct, 0.5) + '%"></i></div><div class="hint">' + pct.toFixed(3) + '% of quota used</div>';
    let persisted = false;
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (_) { /* ignore */ }
    $('#persistState').textContent = persisted ? 'Persistent storage is LOCKED: the browser will not evict your data.' : 'Not locked yet — the browser may evict data under storage pressure.';
    $('#persistBtn').disabled = persisted;
    const sum = await DB.storesSummary();
    const avgT = await DB.averageBytes('tickets', 200), avgD = await DB.averageBytes('diagnostics', 200);
    $('#vaultStores').innerHTML = Object.keys(sum).map((k) => '<div class="srow"><span>' + esc(k) + '</span><span>' + sum[k].toLocaleString() + '</span></div>').join('') + '<div class="srow"><span>avg bytes / ticket</span><span>' + (avgT || '—') + '</span></div><div class="srow"><span>avg bytes / diagnostic</span><span>' + (avgD || '—') + '</span></div>';
    if (avgT && !refreshVault.touched) { $('#fcBytes').value = avgT; if (avgD) $('#fcDBytes').value = avgD; }
    storagePill();
    runForecast(est);
    swInfo();
  }
  async function runForecast(est) {
    est = est || (navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : { usage: 0, quota: 0 });
    const tpd = +$('#fcTickets').value || 0, dpt = +$('#fcDiag').value || 0, bt = +$('#fcBytes').value || 0, bd = +$('#fcDBytes').value || 0;
    const perDay = tpd * (bt + dpt * bd);
    if (!perDay) { $('#fcOut').innerHTML = '<span class="warn">Enter tickets per day and byte sizes.</span>'; return; }
    const three = perDay * 365 * 3;
    const free = Math.max(0, (est.quota || 0) - (est.usage || 0));
    const days = est.quota ? free / perDay : 0;
    const years = days / 365;
    const tickets3 = tpd * 365 * 3;
    $('#fcOut').innerHTML = 'Growth: <b>' + fmtBytes(perDay) + '</b>/day  ·  ' + fmtBytes(perDay * 365) + '/year\n3-year projection: <b>' + fmtBytes(three) + '</b> for ~' + tickets3.toLocaleString() + ' tickets\n' +
      (est.quota ? 'Remaining quota: ' + fmtBytes(free) + ' → about <b>' + (years > 99 ? '99+' : years.toFixed(1)) + ' years</b> (' + (days > 99999 ? '99,999+' : Math.round(days).toLocaleString()) + ' days)\n' + (years >= 3 ? '<span class="good">Capacity covers the 3-year target.</span>' : '<span class="bad">Below 3 years: run Cold Compaction, export a backup and free browser storage.</span>') : '<span class="warn">Browser did not report a quota; take regular JSON backups.</span>') +
      '\nBrowser quota is shared with other data on this device; lock persistent storage and back up regularly.';
  }
  async function swInfo() {
    let h = 'Service worker: ';
    if (!('serviceWorker' in navigator)) h += 'not supported';
    else {
      const reg = await navigator.serviceWorker.getRegistration();
      h += reg ? (reg.active ? 'active' : 'registered') + (reg.waiting ? ' (update waiting)' : '') : 'not registered (open over http(s) to enable offline cache)';
    }
    if (window.caches) {
      const keys = await caches.keys();
      for (const k of keys) { const c = await caches.open(k); h += '\nCache ' + esc(k) + ': ' + (await c.keys()).length + ' entries'; }
      if (!keys.length) h += '\nNo caches yet.';
    }
    $('#swInfo').innerHTML = h;
  }
  async function exportCsv() {
    const parts = []; let first = true;
    await DB.forEachChunk('tickets', 1000, async (rows) => {
      const lines = DB.ticketsToCsv(rows).split('\r\n');
      parts.push((first ? lines.join('\r\n') : lines.slice(1).join('\r\n')) + '\r\n'); first = false;
    });
    download(new Blob(['﻿', ...parts], { type: 'text/csv' }), 'tickets-' + new Date().toISOString().slice(0, 10) + '.csv');
    toast('CSV exported');
  }
  async function synth(n) {
    const sites = await allSites();
    const stamp = Date.now().toString(36);
    const now = Date.now();
    const titles = ['Comms drop on PLC node', 'HMI tag quality bad', 'Historian gap in trend', 'Alarm flood after trip', 'Script error at runtime', 'Modbus exception on meter', 'OPC connection refused'];
    const pris = ['P1', 'P2', 'P3', 'P3', 'P4'];
    let done = 0;
    while (done < n) {
      const batch = [];
      for (let i = 0; i < Math.min(1000, n - done); i++) {
        const idx = done + i;
        const createdAt = now - Math.floor(Math.random() * 3 * 365 * 86400000);
        const pr = pris[idx % pris.length];
        const closed = Math.random() < 0.85;
        const s = sites[idx % sites.length];
        const res = createdAt + (1 + Math.random() * 12) * H;
        batch.push({
          id: 'tk_syn_' + stamp + '_' + idx, ticketNumber: 'SYN-' + stamp + '-' + idx, title: titles[idx % titles.length] + ' #' + idx, description: 'Synthetic capacity-test ticket.',
          siteId: s.id, siteName: s.name, protocol: PROTOCOLS[idx % PROTOCOLS.length], priority: pr, status: closed ? 'Closed' : STATUSES[idx % 4], category: 'Communications', reporter: 'Load test',
          assignee: 'SCADA Engineer', createdAt, updatedAt: closed ? res : createdAt + H, resolvedAt: closed ? res : null, respondedAt: createdAt + 0.2 * H,
          slaResolveDue: createdAt + SEED.SLA[pr].resolveH * H, rootCause: closed ? 'Synthetic' : '', correctiveAction: closed ? 'Synthetic' : '', preventiveAction: '', hoursSpent: 1, synthetic: true,
          timeline: [{ ts: createdAt, author: 'Load test', text: 'Ticket logged.' }], qhse: {}
        });
      }
      await DB.putMany('tickets', batch);
      done += batch.length;
      $('#synthOut').textContent = 'Generated ' + done.toLocaleString() + ' / ' + n.toLocaleString();
    }
  }
  async function removeSynthetic() {
    let removed = 0;
    const ids = [];
    await DB.forEachChunk('tickets', 1000, async (rows) => { rows.forEach((r) => { if (r.synthetic) ids.push(r.id); }); });
    const cold = [];
    await DB.forEachChunk('cold_archive', 500, async (rows) => { rows.forEach((r) => { if (String(r.id).startsWith('tk_syn_')) cold.push(r.id); }); });
    for (let i = 0; i < ids.length; i += 1000) { await DB.delMany('tickets', ids.slice(i, i + 1000)); removed += Math.min(1000, ids.length - i); }
    for (let i = 0; i < cold.length; i += 1000) { await DB.delMany('cold_archive', cold.slice(i, i + 1000)); removed += Math.min(1000, cold.length - i); }
    return removed;
  }

  /* ================= bindings ================= */
  function bind() {
    $$('.tab').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
    $('#storagePill').addEventListener('click', () => switchView('vault'));
    $('#scrim').addEventListener('click', closeDrawer);
    window.addEventListener('online', () => { netUpdate(); if (state.swReg && state.swReg.sync) state.swReg.sync.register('scada-sync-queue').catch(() => {}); });
    window.addEventListener('offline', netUpdate);

    // tickets
    const reload = debounce(() => { state.page = 0; loadTickets(); }, 250);
    $('#tSearch').addEventListener('input', reload);
    ['tStatus', 'tPriority', 'tProtocol'].forEach((id) => $('#' + id).addEventListener('change', () => { state.page = 0; loadTickets(); }));
    $('#viewTable').onclick = () => { state.mode = 'table'; $('#viewTable').classList.add('active'); $('#viewKanban').classList.remove('active'); loadTickets(); };
    $('#viewKanban').onclick = () => { state.mode = 'kanban'; $('#viewKanban').classList.add('active'); $('#viewTable').classList.remove('active'); loadTickets(); };
    $('#pgPrev').onclick = () => { if (state.page > 0) { state.page--; loadTickets(); } };
    $('#pgNext').onclick = () => { state.page++; loadTickets(); };
    $('#newTicketBtn').onclick = openNewTicket;
    $('#view-command').addEventListener('click', (e) => { const el = e.target.closest('[data-id]'); if (el) openDrawer(el.dataset.id); });

    // diagnostics
    $('#mbFunc').innerHTML = DIAG.MB_FUNCS.map((f) => '<option value="' + f[0] + '"' + (f[0] === 3 ? ' selected' : '') + '>' + String(f[0]).padStart(2, '0') + ' — ' + f[1] + '</option>').join('');
    $('#opcDecodeBtn').onclick = runOpc;
    $('#opcHex').addEventListener('keydown', (e) => { if (e.key === 'Enter') runOpc(); });
    $('#opcPick').onchange = () => { $('#opcHex').value = $('#opcPick').value; runOpc(); };
    $('#opcEndpointBtn').onclick = runOpcEndpoint;
    ['mbSlave', 'mbFunc', 'mbAddr', 'mbQty', 'mbData'].forEach((id) => $('#' + id).addEventListener('input', () => { state.mbExtra = ''; renderModbus(); }));
    $('#mbRefBtn').onclick = () => { const r = DIAG.modbusRefConvert($('#mbRef').value); state.mbExtra = r.ok ? 'Register map: ' + r.text : r.error; renderModbus(); };
    $('#mbExcBtn').onclick = () => { const r = DIAG.modbusException($('#mbExc').value); state.mbExtra = r.ok ? 'Exception ' + r.code + ' — ' + r.name + ': ' + r.text : r.error; renderModbus(); };
    $('#hBuildBtn').onclick = runHistorian;
    $('#dbCalcBtn').onclick = runDeadband;
    $('#qsCheckBtn').onclick = runQs;
    $('#afSampleBtn').onclick = () => { $('#afLog').value = DIAG.alarmSample(); };
    $('#afRunBtn').onclick = runAlarm;
    $('#plcSel').onchange = () => { $('#plcOut').innerHTML = DIAG.plcRender($('#plcSel').value); };
    $('#plcOut').innerHTML = DIAG.plcRender('s7');
    $$('[data-attach]').forEach((b) => b.addEventListener('click', () => attachDiag(b.dataset.attach)));
    $('#dlType').onchange = () => loadDiagLog(true);
    $('#dlMore').onclick = () => loadDiagLog(false);
    const now = Date.now();
    $('#hEnd').value = gstLocalInput(now); $('#hStart').value = gstLocalInput(now - H);

    // KB & training
    $('#kbSearch').addEventListener('input', debounce(renderKb, 200));
    $('#kbCat').onchange = renderKb;
    $('#kbNew').onclick = () => kbForm(null);
    $('#trNew').onclick = trainingForm;
    $('#view-kb').addEventListener('click', async (e) => {
      const t = e.target;
      if (t.dataset.kbview) { const d = await DB.get('knowledge_base', t.dataset.kbview); openModal('<h3>' + esc(d.title) + '</h3><div class="hint">' + esc(d.category) + ' · ' + esc((d.tags || []).join(', ')) + '</div><pre class="code" style="white-space:pre-wrap">' + esc(d.content) + '</pre><div class="row"><button class="btn small" id="kbCopy">Copy text</button><button class="btn small" data-close>Close</button></div>'); $('#kbCopy').onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(d.content).then(() => toast('Copied')); }; }
      if (t.dataset.kbedit) kbForm(t.dataset.kbedit);
      if (t.dataset.kbdel && confirm('Delete this document?')) { await DB.del('knowledge_base', t.dataset.kbdel); renderKb(); }
      if (t.dataset.trdel && confirm('Delete this training session?')) { await DB.del('training_sessions', t.dataset.trdel); renderTraining(); }
    });
    $('#view-kb').addEventListener('change', async (e) => {
      const v = e.target.dataset.trsign; if (!v) return;
      const [id, idx] = v.split(':'); const s = await DB.get('training_sessions', id);
      s.attendees[+idx].signed = e.target.checked; await DB.put('training_sessions', s); renderTraining();
    });

    // sites / BOM / QHSE
    $('#siteNew').onclick = () => siteForm(null);
    $('#qhseNew').onclick = qhseForm;
    $('#siteList').addEventListener('click', async (e) => {
      const t = e.target;
      if (t.dataset.siteedit) siteForm(t.dataset.siteedit);
      if (t.dataset.sitedel && confirm('Delete this site? Existing tickets keep the site name.')) { await DB.del('sites_bom', t.dataset.sitedel); renderSites(); loadBomSites(); }
    });
    $('#bomSite').onchange = () => loadBomFor($('#bomSite').value);
    $('#bomAdd').onclick = () => { state.bom.lines.push({ desc: '', qty: 1, unit: 0 }); renderBomRows(); calcBom(); };
    $('#bomClear').onclick = () => { state.bom.lines = []; renderBomRows(); calcBom(); };
    $('#bomRows').addEventListener('input', (e) => {
      const f = e.target.dataset.bl; if (!f) return;
      const l = state.bom.lines[+e.target.dataset.i];
      l[f] = f === 'desc' ? e.target.value : +e.target.value; calcBom();
    });
    $('#bomRows').addEventListener('click', (e) => { if (e.target.dataset.bdel !== undefined) { state.bom.lines.splice(+e.target.dataset.bdel, 1); renderBomRows(); calcBom(); } });
    ['bomHrs', 'bomRate', 'bomCont', 'bomVat'].forEach((id) => $('#' + id).addEventListener('input', calcBom));
    $('#bomSave').onclick = async () => {
      const s = await DB.get('sites_bom', state.bom.siteId); if (!s) return toast('Select a site first.');
      const total = calcBom();
      s.bom = { lines: state.bom.lines.map((l) => Object.assign({}, l)), hrs: +$('#bomHrs').value || 0, rate: +$('#bomRate').value || 0, cont: +$('#bomCont').value || 0, vat: +$('#bomVat').value || 0, total, savedAt: Date.now() };
      await DB.put('sites_bom', s); renderSites(); toast('Estimate saved to site');
    };

    // vault
    $('#persistBtn').onclick = async () => {
      let ok = false;
      try { ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (_) { /* ignore */ }
      toast(ok ? 'Persistent storage locked' : 'Browser declined — install the app or bookmark the site and try again.'); refreshVault();
    };
    ['fcTickets', 'fcDiag', 'fcBytes', 'fcDBytes'].forEach((id) => $('#' + id).addEventListener('input', () => { refreshVault.touched = true; }));
    $('#fcBtn').onclick = () => runForecast();
    $('#coldBtn').onclick = async () => {
      const days = Math.max(1, +$('#coldDays').value || 180);
      $('#coldOut').textContent = 'Compacting…';
      const r = await DB.compactCold(days, (m, n) => { $('#coldOut').textContent = 'Archived ' + m + ' / ' + n; });
      $('#coldOut').textContent = 'Moved ' + r.moved.toLocaleString() + ' closed ticket(s) older than ' + days + ' days to cold storage' + (r.moved ? ' (' + fmtBytes(r.bytesBefore) + ' → ' + fmtBytes(r.bytesAfter) + ' compressed).' : '.');
      refreshVault(); loadKpis(); loadTickets();
    };
    $('#synthBtn').onclick = async () => {
      const n = Math.min(50000, Math.max(1, +$('#synthN').value || 0));
      $('#synthBtn').disabled = true;
      try { const t0 = performance.now(); await synth(n); const t1 = performance.now(); await DB.page('tickets', { index: 'updatedAt', direction: 'prev', limit: 25 }); $('#synthOut').textContent += '\nFirst page query after load: ' + (performance.now() - t1).toFixed(1) + ' ms (insert took ' + ((t1 - t0) / 1000).toFixed(1) + ' s)'; }
      finally { $('#synthBtn').disabled = false; }
      refreshVault(); loadTickets(); loadKpis();
    };
    $('#synthClear').onclick = async () => { const r = await removeSynthetic(); $('#synthOut').textContent = 'Removed ' + r.toLocaleString() + ' synthetic record(s).'; refreshVault(); loadTickets(); loadKpis(); };
    $('#expJson').onclick = async () => { $('#bkOut').textContent = 'Building snapshot…'; const b = await DB.exportSnapshot(); download(b, 'SCADA_HelpDesk_OS_backup_' + new Date().toISOString().slice(0, 10) + '.json'); $('#bkOut').textContent = 'Snapshot exported (' + fmtBytes(b.size) + ').'; };
    $('#expCsv').onclick = exportCsv;
    $('#impFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!confirm('Restoring replaces ALL current data with the snapshot. Continue?')) { e.target.value = ''; return; }
      try {
        const n = await DB.importSnapshot(await f.text(), (name, total) => { $('#bkOut').textContent = 'Restoring ' + name + '… ' + total.toLocaleString() + ' records'; });
        $('#bkOut').textContent = 'Restored ' + n.toLocaleString() + ' records.'; refreshVault(); loadKpis(); loadTickets();
      } catch (err) { $('#bkOut').innerHTML = '<span class="bad">Restore failed: ' + esc(err.message) + '</span>'; }
      e.target.value = '';
    };
    $('#swUpdate').onclick = async () => {
      if (!state.swReg) return toast('Service worker not available here.');
      state.wantReload = true;
      await state.swReg.update();
      if (state.swReg.waiting) { state.swReg.waiting.postMessage({ type: 'SKIP_WAITING' }); toast('Applying update…'); }
      else { state.wantReload = false; toast('Already on the latest version.'); }
      swInfo();
    };
    $('#swClear').onclick = async () => {
      if (!confirm('Clear the offline app cache? Your data in IndexedDB is NOT affected, but you must be online to re-cache.')) return;
      const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); toast('App cache cleared'); swInfo();
    };
  }

  /* ================= boot ================= */
  async function init() {
    startClock(); netUpdate(); setupInstall(); bind();
    registerSW();
    try {
      await DB.open();
      await seedIfNeeded();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      $('#ticketTableWrap').innerHTML = '<div class="card"><b class="bad">Database error:</b> ' + esc(e.message || e) + '<br>IndexedDB is required. Disable private browsing and reload.</div>';
      return;
    }
    storagePill();
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    if (view && ['command', 'diag', 'kb', 'sites', 'vault'].includes(view)) switchView(view); else switchView('command');
    if (params.get('action') === 'new-ticket') openNewTicket();
    setInterval(storagePill, 60000);
    setInterval(() => { if ($('#view-command').classList.contains('active') && !state.drawerTicket) loadKpis(); }, 60000);
  }
  init();
})();
