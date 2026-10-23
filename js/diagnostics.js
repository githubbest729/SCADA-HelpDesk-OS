/* SCADA HelpDesk OS — Remote diagnostic engines (OPC, Modbus, Historian/SQL, QuickScript, Alarm flood, PLC reference) */
(function (global) {
  'use strict';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hex = (n, w) => n.toString(16).toUpperCase().padStart(w || 2, '0');
  const bytesHex = (arr) => arr.map((b) => hex(b)).join(' ');

  /* ================= OPC ================= */
  const OPC_QUALITY = { 0: 'Bad', 1: 'Uncertain', 2: 'Not used', 3: 'Good' };
  const OPC_SUB = {
    0: { 0: 'Non-specific', 1: 'Configuration error', 2: 'Not connected', 3: 'Device failure', 4: 'Sensor failure', 5: 'Last known value', 6: 'Comm failure', 7: 'Out of service' },
    1: { 0: 'Non-specific', 1: 'Last usable value', 4: 'Sensor not accurate', 5: 'Engineering units exceeded', 6: 'Sub-normal' },
    3: { 0: 'Non-specific', 6: 'Local override' }
  };
  const OPC_LIMIT = { 0: 'Not limited', 1: 'Low limited', 2: 'High limited', 3: 'Constant' };
  const OPC_ADVICE = {
    'Bad:Comm failure': ['Ping and trace route to the device / gateway.', 'Check DAServer / OPC server topic status and last error.', 'Verify cable, switch port, IP conflict and firewall (DCOM TCP 135 / UA port).', 'Confirm PLC is in RUN and the communication module is healthy.'],
    'Bad:Non-specific': ['Check the OPC item path / tag syntax and that the server is running.', 'Verify the OPC group is active and the item is active.', 'Review the OPC server log for the first error timestamp.'],
    'Bad:Last known value': ['Communication was lost after a valid read; the value is stale.', 'Check network and device availability from the time the quality changed.', 'Review update rate and device response timeout.'],
    'Bad:Configuration error': ['Item definition or address does not exist on the device.', 'Compare tag address to the current PLC program after any download.'],
    'Bad:Not connected': ['The server has not established a connection to the device yet.', 'Check topic configuration (IP, rack/slot, node ID) and enable the connection.'],
    'Bad:Device failure': ['Device reports a fault; check PLC / module diagnostic buffer.'],
    'Bad:Sensor failure': ['Field instrument fault: check wiring, loop power, transmitter diagnostics.'],
    'Bad:Out of service': ['Tag or point is disabled in the source; confirm with operations before enabling.'],
    'Uncertain:Last usable value': ['Value held from an earlier good read; check update interval and device load.'],
    'Uncertain:Sensor not accurate': ['Check calibration and range of the instrument.'],
    'Uncertain:Engineering units exceeded': ['Value is outside configured EU range; verify scaling.'],
    'Good:Local override': ['Value is being overridden locally; confirm with operator that the override is intentional.']
  };

  function opcDecode(input) {
    let s = String(input || '').trim().replace(/^0x/i, '').replace(/[\s_]/g, '');
    if (!/^[0-9a-fA-F]{1,8}$/.test(s)) return { ok: false, error: 'Enter a hex quality code such as 0x00C0 (OPC DA, 8-bit) or 0x80000000 (OPC UA StatusCode).' };
    const n = parseInt(s, 16);
    if (s.length > 4) {
      // OPC UA 32-bit StatusCode: severity in top 2 bits
      const sev = (n >>> 30) & 3;
      const sevName = sev === 0 ? 'Good' : sev === 1 ? 'Uncertain' : 'Bad';
      const known = {
        0x00000000: 'Good', 0x80000000: 'Bad (generic)', 0x80010000: 'BadUnexpectedError', 0x80050000: 'BadCommunicationError',
        0x800A0000: 'BadTimeout', 0x800D0000: 'BadServerNotConnected', 0x80120000: 'BadCertificateInvalid',
        0x80130000: 'BadSecurityChecksFailed', 0x801F0000: 'BadUserAccessDenied', 0x80330000: 'BadNodeIdInvalid',
        0x80340000: 'BadNodeIdUnknown', 0x808A0000: 'BadNotConnected', 0x80AB0000: 'BadInvalidArgument', 0x40000000: 'Uncertain (generic)'
      };
      const code = (n >>> 0);
      const name = known[code] || (sevName + ' (see OPC UA Part 6 status-code list)');
      const adv = sevName === 'Good' ? ['No action required.'] : sevName === 'Bad'
        ? ['Check endpoint URL, port and firewall.', 'Verify security policy / mode match between client and server.', 'Check certificate trust lists on both sides and the system clock.', 'Verify user token / credentials and node IDs.']
        : ['Value usable with caution; check source device and sampling interval.'];
      return { ok: true, kind: 'UA', raw: '0x' + hex(code, 8), quality: sevName, substatus: name, limit: 'n/a', advice: adv };
    }
    const q = (n >> 6) & 3;
    const sub = (n >> 2) & 15;
    const lim = n & 3;
    const qName = OPC_QUALITY[q];
    const subName = (OPC_SUB[q] && OPC_SUB[q][sub]) || 'Reserved / vendor specific';
    const key = qName + ':' + subName;
    return {
      ok: true, kind: 'DA', raw: '0x' + hex(n & 0xFF, 4), quality: qName, substatus: subName, limit: OPC_LIMIT[lim],
      bits: { quality: q.toString(2).padStart(2, '0'), substatus: sub.toString(2).padStart(4, '0'), limit: lim.toString(2).padStart(2, '0') },
      advice: OPC_ADVICE[key] || (qName === 'Good' ? ['No action required.'] : ['Review the server log and device status; compare with a working tag on the same topic.'])
    };
  }
  function opcRender(r) {
    if (!r.ok) return '<span class="bad">' + esc(r.error) + '</span>';
    const cls = r.quality === 'Good' ? 'good' : r.quality === 'Bad' ? 'bad' : 'warn';
    let h = '<b>' + esc(r.kind === 'UA' ? 'OPC UA StatusCode ' : 'OPC DA Quality ') + esc(r.raw) + '</b>\nQuality: <span class="' + cls + '">' + esc(r.quality) + '</span>\nSubstatus: ' + esc(r.substatus) + '\nLimit: ' + esc(r.limit);
    if (r.bits) h += '\nBits (QQ SSSS LL): ' + r.bits.quality + ' ' + r.bits.substatus + ' ' + r.bits.limit;
    h += '\n\nTroubleshooting:\n' + r.advice.map((a, i) => (i + 1) + '. ' + esc(a)).join('\n');
    return h;
  }
  function opcEndpointCheck(v) {
    const s = String(v || '').trim();
    const issues = [];
    let kind = 'Unknown';
    if (!s) return { ok: false, kind, issues: ['Enter an endpoint or host name.'] };
    const ua = /^opc\.tcp:\/\/([^:\/\s]+|\[[0-9a-fA-F:]+\]):(\d{1,5})(\/\S*)?$/i.exec(s);
    if (/^opc\.tcp:\/\//i.test(s)) {
      kind = 'OPC UA';
      if (!ua) issues.push('Format must be opc.tcp://host:port[/path] (port is required, e.g. 4840).');
      else {
        const port = +ua[2];
        if (port < 1 || port > 65535) issues.push('Port must be 1–65535.');
        if (/^localhost$|^127\./.test(ua[1])) issues.push('Loopback address will not work from a remote client.');
        if (/^\d+\.\d+\.\d+\.\d+$/.test(ua[1]) && ua[1].split('.').some((o) => +o > 255)) issues.push('IPv4 octet greater than 255.');
        if (port !== 4840) issues.push('Non-default port ' + port + ': confirm firewall rule and server configuration.');
      }
      if (!issues.length) issues.push('Syntax OK. Next: test TCP reachability, then check security policy and certificate trust.');
    } else if (/^(\\\\)?[A-Za-z0-9_.-]+(\\[A-Za-z0-9_.-]+(\.\d+)?)?$/.test(s) || /^\d+\.\d+\.\d+\.\d+$/.test(s)) {
      kind = 'OPC DA (DCOM)';
      issues.push('Host syntax OK for DCOM. Verify: name resolution, TCP 135 plus dynamic RPC ports, DCOM launch/access permissions, authentication level, same time and domain trust.');
      if (/^\d+\.\d+\.\d+\.\d+$/.test(s) && s.split('.').some((o) => +o > 255)) issues.unshift('IPv4 octet greater than 255.');
    } else issues.push('Could not recognise the format. Use opc.tcp://host:port/path for OPC UA or a host name / IP for OPC DA.');
    return { ok: !/greater|must be|Could not|Enter|Loopback/.test(issues.join(' ')), kind, issues };
  }

  /* ================= Modbus ================= */
  function crc16(bytes) {
    let crc = 0xFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let b = 0; b < 8; b++) crc = (crc & 1) ? (crc >>> 1) ^ 0xA001 : crc >>> 1;
    }
    return crc & 0xFFFF; // transmitted low byte first
  }
  function lrc(bytes) {
    let sum = 0;
    bytes.forEach((b) => { sum = (sum + b) & 0xFF; });
    return ((~sum + 1) & 0xFF);
  }
  const MB_FUNCS = [
    [1, 'Read Coils'], [2, 'Read Discrete Inputs'], [3, 'Read Holding Registers'], [4, 'Read Input Registers'],
    [5, 'Write Single Coil'], [6, 'Write Single Register'], [15, 'Write Multiple Coils (0x0F)'], [16, 'Write Multiple Registers (0x10)']
  ];
  const MB_EXC = {
    1: ['Illegal Function', 'The device does not support this function code. Check device manual and function code.'],
    2: ['Illegal Data Address', 'Address or address + quantity is outside the device map. Check 0-based vs 1-based addressing and block size.'],
    3: ['Illegal Data Value', 'Quantity or value out of range (e.g. quantity > 125 registers or 2000 coils).'],
    4: ['Slave Device Failure', 'Unrecoverable error in the device while performing the request. Check device diagnostics.'],
    5: ['Acknowledge', 'Request accepted but needs a long time; poll again later.'],
    6: ['Slave Device Busy', 'Device busy with a long command. Retry later; reduce poll rate.'],
    7: ['Negative Acknowledge', 'Programming function could not be performed. Check device state.'],
    8: ['Memory Parity Error', 'Extended memory parity error. Device hardware or memory fault.'],
    9: ['Reserved', 'Not defined in the Modbus specification; vendor specific.'],
    10: ['Gateway Path Unavailable', 'Gateway could not allocate an internal path. Check gateway configuration and load.'],
    11: ['Gateway Target Device Failed to Respond', 'No response from the device behind the gateway. Check slave ID, serial wiring, baud/parity.']
  };

  function parseHexBytes(str) {
    const clean = String(str || '').replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
    if (!clean) return [];
    if (clean.length % 2) throw new Error('Data hex must contain whole bytes.');
    const out = [];
    for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.substr(i, 2), 16));
    return out;
  }

  function modbusBuild(p) {
    const slave = +p.slave, func = +p.func, addr = +p.addr, qty = +p.qty;
    if (!(slave >= 0 && slave <= 247)) return { ok: false, error: 'Slave ID must be 0–247.' };
    if (!(addr >= 0 && addr <= 65535)) return { ok: false, error: 'Start address must be 0–65535.' };
    if (!(qty >= 0 && qty <= 65535)) return { ok: false, error: 'Quantity / value must be 0–65535.' };
    const limits = { 1: 2000, 2: 2000, 3: 125, 4: 125, 15: 1968, 16: 123 };
    if (limits[func] && (qty < 1 || qty > limits[func])) return { ok: false, error: 'Quantity for FC' + func + ' must be 1–' + limits[func] + '.' };
    let pdu = [func, addr >> 8, addr & 255];
    const notes = [];
    if ([1, 2, 3, 4].includes(func)) pdu.push(qty >> 8, qty & 255);
    else if (func === 5) {
      const on = qty ? 0xFF00 : 0x0000;
      pdu.push(on >> 8, on & 255);
      notes.push('Coil value ' + (qty ? 'ON (FF00)' : 'OFF (0000)') + ' — any non-zero value in the quantity field builds ON.');
    } else if (func === 6) pdu.push(qty >> 8, qty & 255);
    else if (func === 15 || func === 16) {
      const need = func === 15 ? Math.ceil(qty / 8) : qty * 2;
      let data = parseHexBytes(p.data);
      if (!data.length) { data = new Array(need).fill(0); notes.push('No write data supplied: payload is ' + need + ' zero byte(s).'); }
      if (data.length !== need) return { ok: false, error: 'FC' + func + ' with quantity ' + qty + ' needs exactly ' + need + ' data byte(s); got ' + data.length + '.' };
      pdu.push(qty >> 8, qty & 255, need, ...data);
    } else return { ok: false, error: 'Unsupported function code.' };
    const rtu = [slave, ...pdu];
    const crc = crc16(rtu);
    const rtuFull = [...rtu, crc & 255, crc >> 8];
    const mbap = [0, 1, 0, 0, (pdu.length + 1) >> 8, (pdu.length + 1) & 255, slave, ...pdu];
    const lrcv = lrc(rtu);
    const asciiStr = ':' + rtu.map((b) => hex(b)).join('') + hex(lrcv) + '\r\n';
    const written = [5, 6, 15, 16].includes(func);
    if (written) notes.push('WRITE function: do not send to a live plant without a valid Permit-to-Work and the QHSE gate (Annexure-SCT-HR-001).');
    return {
      ok: true, slave, func, addr, qty, notes,
      rtu: bytesHex(rtuFull), crc: '0x' + hex(crc, 4) + ' (sent as ' + hex(crc & 255) + ' ' + hex(crc >> 8) + ')',
      tcp: bytesHex(mbap), ascii: asciiStr.replace('\r\n', '') + ' <CR><LF>', lrc: hex(lrcv),
      reference: refFromOffset(func, addr)
    };
  }
  function refFromOffset(func, addr) {
    const base = { 1: 0, 2: 10000, 3: 40000, 4: 30000, 5: 0, 6: 40000, 15: 0, 16: 40000 }[func];
    return base === undefined ? 'n/a' : String(base + addr + 1).padStart(5, '0');
  }
  function modbusRefConvert(txt) {
    const s = String(txt || '').trim();
    if (!/^\d{1,6}$/.test(s)) return { ok: false, error: 'Enter digits only, e.g. 40001, 400001, 30010 or a 0-based offset.' };
    const n = +s;
    let table = null, off = null;
    const six = s.length === 6;
    const div = six ? 100000 : 10000;
    const prefix = Math.floor(n / div);
    const rem = n % div;
    if (s.length >= 5 && [0, 1, 3, 4].includes(prefix) && rem >= 1) {
      table = { 0: 'Coil (FC01/05/15)', 1: 'Discrete Input (FC02)', 3: 'Input Register (FC04)', 4: 'Holding Register (FC03/06/16)' }[prefix];
      off = rem - 1;
      return { ok: true, text: s + ' → ' + table + ', zero-based protocol address ' + off + ' (0x' + hex(off, 4) + ').\nIf the device manual lists 0-based addresses, ' + s + ' may already be the offset: try ' + (n + 1) + ' / offset ' + n + ' when you get exception 02.', off, table };
    }
    return { ok: true, text: 'Treating ' + s + ' as a 0-based offset (0x' + hex(n & 0xFFFF, 4) + ').\nHolding register ' + (40001 + n) + ' · Input register ' + (30001 + n) + ' · Coil ' + String(n + 1).padStart(5, '0') + ' · Discrete input ' + (10001 + n), off: n, table: null };
  }
  function modbusException(txt) {
    const n = parseInt(String(txt || '').replace(/^0x/i, ''), 16);
    if (!(n >= 1 && n <= 11)) return { ok: false, error: 'Exception codes are 01–0B (hex). A response function code with the high bit set (e.g. 83) carries the exception code in the next byte.' };
    return { ok: true, code: hex(n), name: MB_EXC[n][0], text: MB_EXC[n][1] };
  }

  /* ================= Historian / SQL ================= */
  function sqlLit(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
  function historianQuery(p) {
    const tags = String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
    if (!tags.length) return { ok: false, error: 'Enter at least one tag name.' };
    if (!p.start || !p.end) return { ok: false, error: 'Select a start and end time.' };
    const st = new Date(p.start), en = new Date(p.end);
    if (isNaN(st) || isNaN(en) || en <= st) return { ok: false, error: 'End time must be after start time.' };
    const mode = p.mode || 'Cyclic';
    const res = Math.max(+p.res || 0, 0);
    const rows = Math.max(+p.rows || 0, 0);
    const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
    const spanMin = (en - st) / 60000;
    const warns = [];
    if (['Cyclic', 'BestFit', 'Average', 'Minimum', 'Maximum'].includes(mode) && !res) warns.push('Set wwResolution for ' + mode + ' retrieval.');
    if (mode === 'Cyclic' && res) {
      const est = tags.length * Math.ceil((spanMin * 60000) / res);
      if (est > 1000000) warns.push('Estimated ' + est.toLocaleString() + ' rows: narrow the time range or increase resolution.');
    }
    if (mode === 'Full' && spanMin > 1440) warns.push('Full retrieval over more than 24 h can be very large; prefer Delta or Cyclic.');
    if (!rows) warns.push('No row limit set: add wwRowCount to protect the server.');
    const sql =
      '-- Wonderware Historian runtime query (times are Historian server local time; verify server timezone)\n' +
      'SELECT DateTime, TagName, Value, vValue, QualityDetail, Quality\n' +
      'FROM Runtime.dbo.History\n' +
      'WHERE TagName IN (' + tags.map(sqlLit).join(', ') + ')\n' +
      '  AND DateTime >= ' + sqlLit(fmt(st)) + '\n' +
      '  AND DateTime <= ' + sqlLit(fmt(en)) + '\n' +
      "  AND wwRetrievalMode = " + sqlLit(mode) + '\n' +
      (res ? '  AND wwResolution = ' + res + '\n' : '') +
      (rows ? '  AND wwRowCount = ' + rows + '\n' : '') +
      "  AND wwQualityRule = 'Optimistic'\n" +
      'ORDER BY TagName, DateTime;\n\n' +
      '-- Storage health checks\n' +
      "SELECT name, size*8/1024 AS size_mb FROM Runtime.sys.database_files;\n" +
      'EXEC master..xp_fixeddrives;  -- free MB per drive (history block drive should stay above 20%)\n' +
      'SELECT COUNT(*) AS tag_count FROM Runtime.dbo.Tag;\n' +
      "SELECT TOP 20 TagName, MAX(DateTime) AS last_value FROM Runtime.dbo.History WHERE wwRetrievalMode='Cyclic' AND wwResolution=3600000 AND DateTime >= DATEADD(hour,-6,GETDATE()) GROUP BY TagName ORDER BY last_value;";
    return { ok: true, sql, warns, tags, mode, res, rows };
  }
  function deadband(p) {
    const scan = +p.scan, tags = +p.tags, chg = +p.chg, bytes = +p.bytes;
    if (!(scan > 0 && tags > 0 && chg >= 0 && chg <= 100 && bytes > 0)) return { ok: false, error: 'Enter positive scan rate, tags, bytes and a change rate between 0 and 100.' };
    const perDayRaw = tags * (86400000 / scan);
    const perDayStored = perDayRaw * (chg / 100);
    const mbRaw = perDayRaw * bytes / 1048576;
    const mbStored = perDayStored * bytes / 1048576;
    const yearGbStored = mbStored * 365 / 1024;
    const yearGbRaw = mbRaw * 365 / 1024;
    return {
      ok: true, perDayRaw, perDayStored, mbRaw, mbStored, yearGbRaw, yearGbStored, savedPct: 100 - chg,
      text: 'Raw samples/day: ' + Math.round(perDayRaw).toLocaleString() + ' (' + mbRaw.toFixed(1) + ' MB/day, ' + yearGbRaw.toFixed(1) + ' GB/year)\n' +
        'With deadband (' + chg + '% change): ' + Math.round(perDayStored).toLocaleString() + ' values/day (' + mbStored.toFixed(1) + ' MB/day, ' + yearGbStored.toFixed(1) + ' GB/year)\n' +
        'Storage saved: <b>' + (100 - chg).toFixed(1) + '%</b>  ·  Raw bytes are an estimate; actual Historian block size is also affected by compression and tag mix.'
    };
  }

  /* ================= QuickScript ================= */
  function quickScriptLint(code) {
    const src = String(code || '');
    const res = [];
    if (!src.trim()) return { ok: false, issues: [{ lvl: 'bad', msg: 'Script is empty.' }] };
    const isNet = /[{};]\s*$/m.test(src) && /\{/.test(src) || /\busing\s+\w+/.test(src);
    const lines = src.split(/\r?\n/);
    const strip = (l) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$/, '');
    const count = (re) => (src.replace(/"(?:[^"\\]|\\.)*"/g, '""').match(re) || []).length;
    if (isNet) {
      const o = count(/\{/g), c = count(/\}/g);
      if (o !== c) res.push({ lvl: 'bad', msg: 'Unbalanced braces: ' + o + ' "{" vs ' + c + ' "}".' });
      lines.forEach((l, i) => {
        const t = strip(l).trim();
        if (t && !/[;{}]$/.test(t) && !/^(if|else|for|foreach|while|try|catch|finally|using|namespace|class|public|private|\/\/)/.test(t) && !/\)$/.test(t)) res.push({ lvl: 'warn', msg: 'Line ' + (i + 1) + ': statement may be missing a semicolon.' });
      });
      if (/while\s*\(\s*true\s*\)/.test(src) && !/Thread\.Sleep|Task\.Delay|break/.test(src)) res.push({ lvl: 'bad', msg: 'Endless while(true) loop with no sleep/break will freeze the script engine.' });
    } else {
      const upper = src.replace(/"(?:[^"\\]|\\.)*"/g, '""').toUpperCase();
      const pairs = [['IF', /\bIF\b/g, /\bENDIF\b/g], ['WHILE', /\bWHILE\b/g, /\bENDWHILE\b/g], ['FOR', /\bFOR\b/g, /\bNEXT\b/g]];
      pairs.forEach((p) => {
        const a = (upper.match(p[1]) || []).length, b = (upper.match(p[2]) || []).length;
        const aa = p[0] === 'IF' ? (upper.match(/\bIF\b/g) || []).length - (upper.match(/\bELSEIF\b/g) || []).length : a;
        const real = p[0] === 'IF' ? aa : a;
        if (real !== b) res.push({ lvl: 'bad', msg: p[0] + ' blocks: ' + real + ' opening vs ' + b + ' closing.' });
      });
      lines.forEach((l, i) => {
        const t = strip(l).trim();
        if (!t) return;
        const u = t.toUpperCase();
        if (/^(IF|ELSEIF)\b/.test(u)) {
          if (!/\bTHEN\b/.test(u)) res.push({ lvl: 'bad', msg: 'Line ' + (i + 1) + ': IF without THEN.' });
          if (/[^=<>!]=[^=]/.test(t.replace(/^(if|elseif)\s*/i, '').replace(/\bthen\b.*$/i, ''))) res.push({ lvl: 'bad', msg: 'Line ' + (i + 1) + ': single "=" in a condition. Use "==" to compare.' });
        } else if (!/^(ELSE|ENDIF|ENDWHILE|NEXT|THEN|WHILE|FOR|\/\/)/.test(u) && /=/.test(t) && !/;$/.test(t)) {
          res.push({ lvl: 'warn', msg: 'Line ' + (i + 1) + ': statement not terminated with ";".' });
        }
        if (/\/\s*0\b/.test(t)) res.push({ lvl: 'bad', msg: 'Line ' + (i + 1) + ': division by constant zero.' });
        else if (/\/\s*[A-Za-z_]/.test(t) && !/IF/.test(upper)) res.push({ lvl: 'warn', msg: 'Line ' + (i + 1) + ': division by a tag with no zero guard (IF tag <> 0).' });
      });
      if (/\bWHILE\b/.test(upper) && !/\bENDWHILE\b/.test(upper)) res.push({ lvl: 'bad', msg: 'WHILE without ENDWHILE.' });
    }
    res.push({ lvl: 'info', msg: 'Debug checklist: confirm script type (Condition / Data Change / While Running), add LogMessage() traces, check tag types and quality (.Quality == 192), avoid heavy logic in window scripts, guard array bounds.' });
    return { ok: !res.some((r) => r.lvl === 'bad'), mode: isNet ? 'QuickScript.NET' : 'InTouch QuickScript', issues: res };
  }

  /* ================= Alarm flood (ISA-18.2 style) ================= */
  function parseAlarmLog(text) {
    const rows = [];
    String(text || '').split(/\r?\n/).forEach((l) => {
      const p = l.split(',').map((x) => x.trim());
      if (p.length < 2) return;
      const t = Date.parse(p[0]);
      if (isNaN(t)) return;
      rows.push({ t, tag: p[1], pri: p[2] || '' });
    });
    return rows.sort((a, b) => a.t - b.t);
  }
  function alarmFlood(text) {
    const rows = parseAlarmLog(text);
    if (rows.length < 2) return { ok: false, error: 'Need at least two lines in the format: 2026-10-22 06:10:05, TAG_NAME, High' };
    // peak alarms in any 10-minute window (sliding)
    let peak = 0, peakStart = rows[0].t, j = 0;
    for (let i = 0; i < rows.length; i++) {
      while (rows[i].t - rows[j].t > 600000) j++;
      if (i - j + 1 > peak) { peak = i - j + 1; peakStart = rows[j].t; }
    }
    const counts = {};
    rows.forEach((r) => { counts[r.tag] = (counts[r.tag] || 0) + 1; });
    const top = Object.keys(counts).map((k) => [k, counts[k]]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    // chattering: >=3 same-tag alarms within 60 s
    const byTag = {};
    rows.forEach((r) => { (byTag[r.tag] = byTag[r.tag] || []).push(r.t); });
    const chatter = [];
    Object.keys(byTag).forEach((tag) => {
      const a = byTag[tag];
      for (let i = 2; i < a.length; i++) if (a[i] - a[i - 2] <= 60000) { chatter.push(tag); break; }
    });
    const spanH = Math.max((rows[rows.length - 1].t - rows[0].t) / 3600000, 1 / 60);
    const perHour = rows.length / spanH;
    const flood = peak > 10;
    const topPct = top.length ? Math.round((top.slice(0, 3).reduce((s, x) => s + x[1], 0) / rows.length) * 100) : 0;
    const lines = [
      'Alarms analysed: <b>' + rows.length + '</b> over ' + spanH.toFixed(1) + ' h (' + perHour.toFixed(1) + ' per hour)',
      'Peak in any 10 min: <b>' + peak + '</b> starting ' + new Date(peakStart).toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      'ISA-18.2 flood (more than 10 alarms / 10 min): ' + (flood ? '<span class="bad">YES — flood detected</span>' : '<span class="good">No</span>'),
      'Top bad actors: ' + top.map((x) => esc(x[0]) + ' (' + x[1] + ')').join(', '),
      'Top 3 tags make up ' + topPct + '% of all alarms',
      'Chattering tags (3+ in 60 s): ' + (chatter.length ? esc(chatter.join(', ')) : 'none'),
      '',
      'Actions: ' + (flood ? 'apply temporary alarm suppression only with operator approval, ' : '') + 'review deadband / on-delay for chattering tags, rationalise priorities, and check for a common cause (power, comms loss, relay reset).'
    ];
    return { ok: true, peak, flood, topTag: top[0] ? top[0][0] : '', total: rows.length, chatter, top, text: lines.join('\n') };
  }
  function alarmSample() {
    const base = Date.UTC(2026, 9, 22, 6, 10, 0);
    const tags = ['FDR33_REL_TRIP', 'FDR33_CB_OPEN', 'BUS_VOLT_LOW', 'LT_101_HI', 'COMMS_LOSS_RTU3', 'TRF2_TEMP_HI'];
    const out = [];
    for (let i = 0; i < 46; i++) {
      const tag = i % 3 === 0 ? 'LT_101_HI' : tags[(i * 7) % tags.length];
      const t = new Date(base + i * (i < 36 ? 9000 : 90000));
      out.push(t.toISOString().slice(0, 19).replace('T', ' ') + ', ' + tag + ', ' + (['High', 'Medium', 'Low'][i % 3]));
    }
    return out.join('\n');
  }

  /* ================= PLC reference ================= */
  const PLC = {
    s7: { name: 'Siemens S7-1500 / S7-1200', port: 'TCP 102 (ISO-on-TCP); OPC UA 4840; web server 80/443',
      addressing: 'DB1.DBX0.0 (bit), DB1.DBW2 (word), DB1.DBD4 (dword); M, I, Q areas. Optimized DBs need symbolic / OPC UA access.',
      checks: ['Ping PLC and check duplicate IP / switch loop (STP).', 'Check CPU RUN/STOP and diagnostic buffer for connection events.', 'PUT/GET access enabled only if required and approved by client cyber policy.', 'Verify rack/slot (0/1 for S7-1200/1500) and connection resource limit.', 'Check DAServer/driver topic status.'] },
    ab: { name: 'Allen-Bradley ControlLogix / CompactLogix', port: 'EtherNet/IP TCP 44818, UDP 2222 (I/O)',
      addressing: 'Controller-scoped tags: Tag_Name, Program:MainProgram.Tag, arrays Tag[0], UDT members Tag.Member. Path: IP + backplane + slot.',
      checks: ['Check controller mode (RUN / REM RUN) and major / minor faults in Studio 5000.', 'Verify CIP path, slot number and communication module status LEDs.', 'Check connection count on the Ethernet module (CPU % comms time slice).', 'Tag not found: compare tag name with the offline project after any download.', 'Check topic and item syntax in the OPC/EtherNet-IP server.'] },
    mod: { name: 'Schneider Modicon M340 / M580', port: 'Modbus TCP 502; OPC UA 4840 (M580 with OFS)',
      addressing: '%MW (memory word) = Modbus holding register offset; %M = coil; %I / %IW inputs (check mapping). Modbus address = index of %MW (0-based on the wire).',
      checks: ['Confirm Modbus server is enabled on the Ethernet module and the IP is correct.', 'Check number of simultaneous client connections allowed.', 'Compare %MW index with the register map after any program change.', 'Check for exception 02 when reading beyond the configured data zone.', 'Use unit ID 255 / 0 for direct TCP unless a gateway is used.'] }
  };
  function plcRender(key) {
    const p = PLC[key];
    if (!p) return '';
    return '<b>' + esc(p.name) + '</b>\nPorts: ' + esc(p.port) + '\nAddressing: ' + esc(p.addressing) + '\n\nQuick checks:\n' + p.checks.map((c, i) => (i + 1) + '. ' + esc(c)).join('\n');
  }

  global.DIAG = {
    esc, hex, crc16, lrc, MB_FUNCS, MB_EXC,
    opcDecode, opcRender, opcEndpointCheck,
    modbusBuild, modbusRefConvert, modbusException, parseHexBytes,
    historianQuery, deadband, quickScriptLint, alarmFlood, alarmSample, parseAlarmLog,
    PLC, plcRender
  };
})(window);
