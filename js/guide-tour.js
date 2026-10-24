/* SCADA HelpDesk OS — How-To Guide modal + interactive spotlight tour */
(function (global) {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(sel, ms) {
    const end = Date.now() + (ms || 2500);
    while (Date.now() < end) { const el = $(sel); if (el && el.offsetParent !== null) return el; await sleep(60); }
    return $(sel);
  }

  /* ================= SPOTLIGHT TOUR ================= */
  const STEPS = [
    { view: 'tickets', sel: '#kpis', title: '1. Summary cards', text: 'These four cards show what needs attention right now. Click any card to filter the ticket list to just those tickets. Click it again to clear.', act: null },
    { view: 'tickets', sel: '#newTicketBtn', title: '2. Log a new support call', text: 'When an operator phones in a problem, press “+ New Support Ticket”. Use the Quick-Fill list for common plant issues and the form fills itself in under 10 seconds.', act: () => $('#newTicketBtn').click(), actLabel: 'Click It For Me' },
    { view: 'tickets', sel: '.quickDiag', title: '3. Pick a ticket and press Diagnose', text: 'Every ticket row has a “🔍 Diagnose” button. It jumps straight to the right diagnostic tool with this ticket already selected. Click anywhere else on the row to open the full ticket.', act: () => $('.quickDiag').click(), actLabel: 'Click It For Me' },
    { view: 'diag', sel: '#card-opc', title: '4. Diagnostic presets', text: 'Each tool has a list of common plant problems and a “✨ Load Common Example” button. You get a plain-English meaning and a fix checklist — nothing to memorise.', act: () => global.APP.loadExample('opc'), actLabel: 'Click It For Me' },
    { view: 'diag', sel: '#card-opc [data-attach]', title: '5. Attach the result to the ticket', text: 'Tick the steps you completed, then press “📎 Attach Result & Fix to Ticket”. It is saved on the ticket and shows up in the service report.', act: () => $('#card-opc [data-attach]').click(), actLabel: 'Click It For Me' },
    { view: null, sel: '#settingsBtn', title: '6. Settings & Backup', text: 'Settings holds your name, SLA targets, theme and text size, plus one-click backup, restore and storage cleanup so the app stays fast for years.', act: () => $('#settingsBtn').click(), actLabel: 'Click It For Me' }
  ];

  const T = { idx: -1, hole: null, card: null, on: false };
  function ensure() {
    if (T.hole) return;
    T.hole = document.createElement('div'); T.hole.className = 'tour-hole'; T.hole.hidden = true;
    T.card = document.createElement('div'); T.card.className = 'tour-card'; T.card.hidden = true; T.card.setAttribute('role', 'dialog'); T.card.setAttribute('aria-label', 'Guided tour');
    document.body.appendChild(T.hole); document.body.appendChild(T.card);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
  }
  function place() {
    if (!T.on) return;
    const s = STEPS[T.idx]; const el = s && $(s.sel); if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 6;
    Object.assign(T.hole.style, { top: (r.top - pad) + 'px', left: (r.left - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px' });
    const ch = T.card.offsetHeight, cw = T.card.offsetWidth;
    let top = r.bottom + 14;
    if (top + ch > window.innerHeight - 8) top = r.top - ch - 14;
    if (top < 8) top = Math.max(8, window.innerHeight - ch - 8);
    let left = r.left;
    if (left + cw > window.innerWidth - 8) left = window.innerWidth - cw - 8;
    if (left < 8) left = 8;
    T.card.style.top = top + 'px'; T.card.style.left = left + 'px';
  }
  async function go(i) {
    if (i < 0 || i >= STEPS.length) return stop();
    T.idx = i; T.on = true; ensure();
    const s = STEPS[i];
    global.APP.closeAll();
    if (s.view) await global.APP.switchView(s.view);
    if (s.view === 'diag') await global.APP.ensureDiagTicket();
    const el = await waitFor(s.sel, 3000);
    if (!el) { return i < STEPS.length - 1 ? go(i + 1) : stop(); }
    el.scrollIntoView({ block: 'center', behavior: 'instant' in window ? 'instant' : 'auto' });
    T.hole.hidden = false; T.card.hidden = false;
    T.card.innerHTML = '<div class="count">Step ' + (i + 1) + ' of ' + STEPS.length + '</div><h4>' + s.title + '</h4><div>' + s.text + '</div><div class="note" id="tourNote" style="margin-top:6px;color:#34d399;font-size:.9em"></div>' +
      '<div class="btns"><button class="btn" id="tBack"' + (i === 0 ? ' disabled' : '') + '>← Back</button>' +
      (s.act ? '<button class="btn" id="tAct">👆 ' + s.actLabel + '</button>' : '') +
      '<button class="btn accent" id="tNext">' + (i === STEPS.length - 1 ? 'Finish ✓' : 'Next →') + '</button>' +
      '<button class="btn" id="tExit">Exit Tour</button></div>';
    $('#tBack').onclick = () => go(i - 1);
    $('#tNext').onclick = () => (i === STEPS.length - 1 ? stop(true) : go(i + 1));
    $('#tExit').onclick = () => stop();
    const a = $('#tAct'); if (a) a.onclick = async () => { await s.act(); $('#tourNote').textContent = 'Done — press Next to continue.'; await sleep(150); place(); };
    requestAnimationFrame(place); setTimeout(place, 120);
  }
  function stop(finished) {
    T.on = false;
    if (T.hole) T.hole.hidden = true;
    if (T.card) T.card.hidden = true;
    if (finished) { global.APP.closeAll(); global.APP.switchView('tickets'); global.APP.toast('Tour complete — you are ready to take your first call! 🎉'); }
  }
  const TOUR = { start: () => { global.APP.closeAll(); return go(0); }, stop, active: () => T.on };

  /* ================= GUIDE MODAL ================= */
  function guideHtml() {
    return '<div class="card-head"><h3>📖 How-To Guide</h3><button class="btn small" data-close>Close ✕</button></div>' +
      '<button class="btn accent big" id="gTour">🎯 Launch Interactive Step-by-Step Spotlight Tour</button>' +
      '<div class="gtabs" role="tablist">' +
      '<button class="gtab active" data-g="1">📱 New to PWA Apps? (Start Here)</button><button class="gtab" data-g="2">🎫 How to Handle a Support Call</button><button class="gtab" data-g="3">🔌 How to Use Remote Diagnostics</button><button class="gtab" data-g="4">❓ Quick FAQ &amp; Troubleshooting</button></div>' +

      '<div class="gpane active" data-gp="1">' +
      '<div class="gcard"><h4>What is a PWA?</h4>It works like a regular website <b>and</b> installs like a desktop or phone app — even when you have <b>zero internet at a plant site</b>. Open it once while online and it keeps everything it needs on your device.</div>' +
      '<div class="gcard"><h4>💻 Laptop / Desktop (Chrome or Edge)</h4><ol><li>Open this app in Chrome or Edge.</li><li>Click the <b>⬇ Install App</b> button in the top bar (or the install icon in the address bar).</li><li>Press <b>Install</b>. It now opens in its own window from your Start menu / desktop.</li></ol></div>' +
      '<div class="gcard"><h4>🤖 Android (Chrome)</h4><ol><li>Open the app in Chrome.</li><li>Tap <b>⬇ Install App</b>, or the ⋮ menu → <b>Install app</b>.</li><li>Launch it from your home screen.</li></ol></div>' +
      '<div class="gcard"><h4>🍎 iPhone / iPad (Safari)</h4><ol><li>Open the app in <b>Safari</b> (not Chrome).</li><li>Tap the <b>Share</b> button.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol></div>' +
      '<div class="row"><button class="btn accent" id="gOffline">✅ Test Offline Ready Status</button></div><div class="out" id="gOfflineOut"></div></div>' +

      '<div class="gpane" data-gp="2">' +
      '<div class="gcard"><h4>1. Create a ticket when an operator calls</h4>Press “+ New Support Ticket”, pick a Quick-Fill issue, add the caller name and press Create.<div class="row" style="margin-top:6px"><button class="btn small accent" data-try="new">▶ Try This Step Now</button></div></div>' +
      '<div class="gcard"><h4>2. Read priority colors and SLA timers</h4><div class="legend"><span><span class="badge p-P1">P1</span> Critical — plant at risk</span><span><span class="badge p-P2">P2</span> High</span><span><span class="badge p-P3">P3</span> Medium</span><span><span class="badge p-P4">P4</span> Low</span></div><p>The <b>SLA time</b> column counts down the time you promised the client. <span class="sla-ok">Green</span> = fine, <span class="sla-warn">amber</span> = running low, <span class="sla-bad">red = late</span>.</p><button class="btn small accent" data-try="list">▶ Try This Step Now</button></div>' +
      '<div class="gcard"><h4>3. Jump from a ticket to the right diagnostic tool</h4>Press <b>🔍 Diagnose</b> on any ticket row (or “🔍 Diagnose This Issue” inside a ticket). The tool opens with that ticket already selected.<div class="row" style="margin-top:6px"><button class="btn small accent" data-try="diag">▶ Try This Step Now</button></div></div>' +
      '<div class="gcard"><h4>4. Resolve the ticket and save a service report</h4>Inside the ticket press <b>✅ Mark Resolved</b>, write a short note of the fix, then <b>🖨️ Print / Save Service Report</b> for a clean client summary.<div class="row" style="margin-top:6px"><button class="btn small accent" data-try="resolve">▶ Try This Step Now</button></div></div></div>' +

      '<div class="gpane" data-gp="3">' +
      '<div class="gcard"><h4>OPC Check</h4>Use when HMI tags show <b>?</b>, bad quality, or stop updating. Pick the code you see (for example 0x0018) and read the plain-English meaning.<div class="row" style="margin-top:6px"><button class="btn small accent" data-sample="opc">Load Sample Problem</button></div></div>' +
      '<div class="gcard"><h4>Modbus Check</h4>Use for meters or small PLCs that time out or return “exception” codes. The register converter turns 40001 into the right address and builds the frame with CRC-16.<div class="row" style="margin-top:6px"><button class="btn small accent" data-sample="modbus">Load Sample Problem</button></div></div>' +
      '<div class="gcard"><h4>Wonderware / InTouch Check</h4>Use for alarm floods, missing trend history, script errors and slow screens. You can also build a Historian SQL query in one click.<div class="row" style="margin-top:6px"><button class="btn small accent" data-sample="wonderware">Load Sample Problem</button></div></div>' +
      '<div class="gcard"><h4>PLC Connection Check</h4>Shows ports, LED meanings and a short checklist for Siemens, Allen-Bradley and Modicon PLCs. Tick the boxes before closing the ticket.<div class="row" style="margin-top:6px"><button class="btn small accent" data-sample="plc">Load Sample Problem</button></div></div></div>' +

      '<div class="gpane" data-gp="4">' +
      '<details><summary>Where is my data saved?</summary><p>Only on <b>this device</b>, inside the browser’s database (IndexedDB). Nothing is sent to a server.</p></details>' +
      '<details><summary>Will I lose tickets if I close the browser?</summary><p>No. Tickets are saved the moment you create or change them. To be extra safe, open Settings and press <b>🔒 Lock Permanent Storage</b>, and download a backup now and then.</p></details>' +
      '<details><summary>How do I move my tickets to another computer?</summary><p>Settings → <b>⬇ Download Full Backup (.json)</b> on the old computer. On the new one, open the app and use <b>⬆ Restore from Backup File</b>.</p></details>' +
      '<details><summary>The app does not work offline.</summary><p>Open it once while online (over https or localhost) and wait for “Offline: ready” in the top bar. Then press “Test Offline Ready Status” in the first guide tab.</p></details>' +
      '<details><summary>The text is too small / hard to see outdoors.</summary><p>Settings → Display: choose <b>Large / Touch-Friendly</b> and the <b>Daylight High-Contrast</b> theme.</p></details>' +
      '<details><summary>What does the ? badge mean?</summary><p>It is a helper tip. Turn all of them off in Settings → Display → Beginner helper hints.</p></details></div>';
  }

  function openGuide() {
    global.APP.openModal(guideHtml(), true);
    const box = $('#modalBox');
    $$('.gtab', box).forEach((b) => b.addEventListener('click', () => {
      $$('.gtab', box).forEach((x) => x.classList.toggle('active', x === b));
      $$('.gpane', box).forEach((p) => p.classList.toggle('active', p.dataset.gp === b.dataset.g));
    }));
    $('#gTour').onclick = () => { global.APP.closeModal(); TOUR.start(); };
    $('#gOffline').onclick = async () => { $('#gOfflineOut').innerHTML = (await global.APP.offlineReport()).map((l) => l.replace(/[&<>]/g, '')).join('<br>'); };
    $$('[data-try]', box).forEach((b) => b.addEventListener('click', async () => {
      const k = b.dataset.try;
      global.APP.closeAll();
      await global.APP.switchView('tickets');
      if (k === 'new') return global.APP.openNewTicket();
      if (k === 'list') { global.APP.flash($('#ticketTableWrap')); return; }
      await global.APP.openFirstActive();
      await sleep(250);
      if (k === 'diag') global.APP.flash($('#dDiag'));
      if (k === 'resolve') { global.APP.flash($('#dResolve')); }
    }));
    $$('[data-sample]', box).forEach((b) => b.addEventListener('click', async () => {
      const tool = b.dataset.sample;
      global.APP.closeAll();
      await global.APP.switchView('diag'); await global.APP.ensureDiagTicket();
      global.APP.loadExample(tool);
      global.APP.flash($('#card-' + tool));
    }));
  }

  global.TOUR = TOUR;
  global.GUIDE = { open: openGuide };
})(window);
