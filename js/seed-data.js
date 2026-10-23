/* SCADA HelpDesk OS — Pre-seeded Dubai / Al Gurg SCADA dataset (illustrative sample content) */
(function (global) {
  'use strict';
  const H = 3600000;

  const SLA = {
    P1: { label: 'Critical', responseH: 0.25, resolveH: 4 },
    P2: { label: 'High', responseH: 1, resolveH: 8 },
    P3: { label: 'Medium', responseH: 4, resolveH: 24 },
    P4: { label: 'Low', responseH: 8, resolveH: 72 }
  };

  const QHSE_ITEMS = [
    { id: 'ptw', text: 'Permit-to-Work (PTW) verified and valid for the work scope and time window', mandatory: true },
    { id: 'loto', text: 'Lock-Out / Tag-Out (LOTO) confirmed by client operations for affected equipment', mandatory: true },
    { id: 'backup', text: 'Backup snapshot taken and verified (PLC program, Galaxy / InTouch application, Historian config)', mandatory: true },
    { id: 'rollback', text: 'Rollback plan agreed and last-known-good version identified', mandatory: true },
    { id: 'ops', text: 'Client control-room operator informed and has approved the online change / forcing', mandatory: true },
    { id: 'cyber', text: 'Remote access via approved VPN / jump host only; session logged; no shared credentials', mandatory: true },
    { id: 'force', text: 'Forced I/O or write-to-tag list reviewed; no safety-rated (SIS / ESD) points included', mandatory: true },
    { id: 'ppe', text: 'Site-specific HSE induction and PPE requirements acknowledged (if attending on site)', mandatory: false },
    { id: 'comms', text: 'Emergency contact and escalation path confirmed for the duration of the activity', mandatory: false }
  ];

  const sites = [
    { id: 'site_jaus', name: 'Jebel Ali Utility Substation', sector: 'Power Distribution', city: 'Jebel Ali, Dubai', contact: 'Control Room Supervisor', phone: '+971 4 000 0101',
      topology: 'Galaxy GR node 10.20.1.10 · AppEngine 10.20.1.11 · InTouch HMI 10.20.1.21-23\nProtection relays via IEC 60870-5-104 gateway 10.20.2.5\nModicon M580 RTU 10.20.3.10 (Modbus TCP port 502)' },
    { id: 'site_dmdc', name: 'Dubai Marina District Cooling Plant', sector: 'District Cooling', city: 'Dubai Marina, Dubai', contact: 'Plant Manager', phone: '+971 4 000 0102',
      topology: 'Wonderware System Platform 10.30.1.10 · Historian 10.30.1.12 (SQL Server)\nChiller PLCs: ControlLogix 1756-L83E 10.30.2.11-14 (EtherNet/IP)\nBTU meters via Modbus RTU gateway 10.30.3.5' },
    { id: 'site_aqwp', name: 'Al Quoz Water Pumping Station', sector: 'Water / Wastewater', city: 'Al Quoz, Dubai', contact: 'Operations Engineer', phone: '+971 4 000 0103',
      topology: 'InTouch 2020 R2 SP1 HMI 10.40.1.20 · DAServer OPC 10.40.1.21\nSiemens S7-1500 PLC 10.40.2.10 (S7 comm port 102) · radio link to remote reservoirs' },
    { id: 'site_shro', name: 'Sharjah Industrial RO Plant', sector: 'Water / Wastewater', city: 'Sharjah Industrial Area', contact: 'Plant Chemist / Operator Lead', phone: '+971 6 000 0104',
      topology: 'OPC UA server (PLC embedded) opc.tcp://10.50.2.10:4840\nInTouch OMI ViewApp node 10.50.1.30 · Historian client tags over OPC UA\nRO skid Modicon M340 10.50.3.10' },
    { id: 'site_hgcs', name: 'Habshan Gas Compression Skid (Abu Dhabi)', sector: 'Oil & Gas', city: 'Habshan, Abu Dhabi', contact: 'Instrument Supervisor', phone: '+971 2 000 0105',
      topology: 'Skid PLC ControlLogix 10.60.2.10 · Redundant HMI servers 10.60.1.11-12\nESD handled by independent SIS — outside Al Gurg support scope' },
    { id: 'site_bbbm', name: 'Business Bay BMS Tower', sector: 'BMS', city: 'Business Bay, Dubai', contact: 'FM Technical Manager', phone: '+971 4 000 0106',
      topology: 'BMS supervisor 10.70.1.10 · BACnet/IP controllers 10.70.2.x · Modbus RTU energy meters via gateway 10.70.3.5' },
    { id: 'site_dicp', name: 'Dubai Industrial City Packaging Line', sector: 'Industrial Manufacturing', city: 'Dubai Industrial City', contact: 'Maintenance Lead', phone: '+971 4 000 0107',
      topology: 'Line PLCs: S7-1200 10.80.2.10-14 · Allen-Bradley CompactLogix 10.80.2.20\nInTouch HMI 10.80.1.20 · OEE data via SQL Server 10.80.1.30' }
  ].map((s) => Object.assign({ address: s.city, bom: null, createdAt: Date.now() }, s));

  // [title, description, siteIdx, protocol, priority, status, category, reporter, ageH, resolvedAfterH, rootCause, correctiveAction]
  const T = [
    ['InTouch tags showing bad quality (?) on Chiller 2 group', 'All Chiller 2 analog tags went to Bad/Comm Failure at start of night shift. Other chillers OK. HMI still running.', 1, 'EtherNet/IP', 'P1', 'In Progress', 'Communications', 'Shift Operator — DMDC', 2.5, 0, '', ''],
    ['Alarm flood on 33kV feeder after relay reset', 'More than 400 alarms in 10 minutes after protection relay reset; operators cannot see priority alarms.', 0, 'Wonderware', 'P1', 'Escalated', 'Alarm Management', 'Control Room Supervisor — JAUS', 5.2, 0, '', ''],
    ['Historian not storing data for RO skid tags', 'Trend shows flat line since 06:10. Historian client reports no new values for 38 tags.', 3, 'SQL/Historian', 'P2', 'In Progress', 'Historian', 'Plant Chemist — SHRO', 7.5, 0, '', ''],
    ['OPC DA connection to DAServer fails after Windows update', 'DCOM access denied (0x80070005) after monthly patching on HMI server.', 2, 'OPC DA', 'P2', 'Pending Client', 'Communications', 'Operations Engineer — AQWP', 26, 0, '', ''],
    ['Modbus RTU meters returning exception 02', 'Energy meters 5-9 respond with illegal data address after meter firmware change.', 5, 'Modbus RTU', 'P3', 'Open', 'Integration', 'FM Technical Manager — BBBM', 9, 0, '', ''],
    ['QuickScript error on pump alternation logic', 'Runtime script reports "Divide by zero" intermittently at pump changeover.', 2, 'Wonderware', 'P3', 'In Progress', 'Scripting', 'Operations Engineer — AQWP', 30, 0, '', ''],
    ['S7-1500 connection drops every 20 minutes', 'HMI loses S7 connection for about 15 s. PLC CPU shows no fault. Looks like IP conflict or switch loop.', 6, 'Siemens S7', 'P2', 'Open', 'Communications', 'Maintenance Lead — DICP', 3.5, 0, '', ''],
    ['Add two new analog points to Compressor HMI screen', 'Request to add suction pressure and temperature transmitters to existing overview.', 4, 'EtherNet/IP', 'P4', 'Open', 'Change Request', 'Instrument Supervisor — HGCS', 50, 0, '', ''],
    ['HMI trend shows wrong timezone', 'Trends offset by 4 hours compared with plant clock after server restore.', 1, 'SQL/Historian', 'P3', 'Resolved', 'Historian', 'Plant Manager — DMDC', 80, 6, 'Historian server timezone reverted to UTC after OS restore', 'Timezone reset to Arabian Standard Time; retrieval verified'],
    ['Galaxy platform in Warning after reboot', 'Platform2 shows Warning, AppEngine not deploying objects.', 0, 'Wonderware', 'P2', 'Closed', 'System Platform', 'Control Room Supervisor — JAUS', 400, 5, 'Bootstrap service did not start due to stuck aaEngine process', 'Services restarted in order; redeployed platform; added startup dependency check to SOP'],
    ['Pump 3 status stuck on Running in HMI', 'Pump stopped locally but HMI still shows Running.', 2, 'Modbus TCP', 'P3', 'Closed', 'Integration', 'Operations Engineer — AQWP', 520, 9, 'Register offset error (40001 vs 0-based) after PLC program update', 'Address map corrected in DAServer item list; regression tested'],
    ['OPC UA certificate rejected after server replacement', 'Client cannot connect, BadSecurityChecksFailed.', 3, 'OPC UA', 'P2', 'Closed', 'Communications', 'Plant Chemist — SHRO', 700, 3, 'New server certificate not trusted by client', 'Server certificate imported to trusted store; endpoint verified'],
    ['Slow InTouch screen call-up (8–10 s)', 'Main overview takes long to open on two clients.', 6, 'Wonderware', 'P4', 'Resolved', 'Performance', 'Maintenance Lead — DICP', 120, 20, 'Excessive QuickScript on window open and large unused graphics', 'Moved heavy logic to server script; trimmed graphics'],
    ['Weekly Historian backup job failed', 'SQL Agent job reports failure; disk 96% full.', 1, 'SQL/Historian', 'P2', 'Closed', 'Historian', 'Plant Manager — DMDC', 900, 7, 'Old history blocks not archived; drive almost full', 'Archived old blocks; added disk space alert at 80%']
  ];

  function buildTickets(now) {
    const year = new Date(now).getFullYear();
    return T.map((r, i) => {
      const createdAt = now - r[8] * H;
      const resolved = r[5] === 'Resolved' || r[5] === 'Closed';
      const resolvedAt = resolved ? createdAt + r[9] * H : null;
      const updatedAt = resolved ? resolvedAt + (r[5] === 'Closed' ? 2 * H : 0) : now - Math.min(r[8], 1.5) * H;
      const site = sites[r[2]];
      const sla = SLA[r[4]];
      const timeline = [{ ts: createdAt, author: r[7], text: 'Ticket logged.' }];
      if (r[5] !== 'Open') timeline.push({ ts: createdAt + 0.2 * H, author: 'SCADA Engineer', text: 'Acknowledged. Starting remote triage.' });
      if (r[5] === 'Escalated') timeline.push({ ts: createdAt + 1 * H, author: 'SCADA Engineer', text: 'Escalated to Senior Engineer and client electrical team.' });
      if (resolved) timeline.push({ ts: resolvedAt, author: 'SCADA Engineer', text: 'Resolved: ' + r[11] });
      return {
        id: 'tk_seed_' + String(i + 1).padStart(2, '0'),
        ticketNumber: 'AGAC-' + year + '-' + String(1001 + i).padStart(5, '0'),
        title: r[0], description: r[1], siteId: site.id, siteName: site.name, protocol: r[3], priority: r[4], status: r[5],
        category: r[6], reporter: r[7], assignee: 'SCADA Engineer', createdAt, updatedAt, resolvedAt,
        respondedAt: r[5] === 'Open' ? null : createdAt + 0.2 * H,
        slaResolveDue: createdAt + sla.resolveH * H,
        rootCause: r[10], correctiveAction: r[11], preventiveAction: resolved ? 'Documented in SOP knowledge base.' : '',
        hoursSpent: resolved ? r[9] : 0, timeline,
        qhse: { ptw: false, loto: false, backup: false, rollback: false, ops: false, cyber: false, force: false, ppe: false, comms: false, signedBy: '', signedAt: null }
      };
    });
  }

  function buildDiagnostics(now) {
    return [
      { id: 'dg_seed_1', ticketId: 'tk_seed_01', timestamp: now - 2 * H, diagnosticType: 'opc', summary: 'OPC quality 0x0018 — Bad / Comm Failure (device)',
        payload: { input: '0x0018', quality: 'Bad', substatus: 'Comm Failure', limit: 'Not limited' } },
      { id: 'dg_seed_2', ticketId: 'tk_seed_05', timestamp: now - 8 * H, diagnosticType: 'modbus', summary: 'FC03 slave 5 exception 02 — Illegal Data Address',
        payload: { slave: 5, func: 3, start: 0, qty: 10, requestRtu: '05 03 00 00 00 0A C4 4E', exception: '02' } },
      { id: 'dg_seed_3', ticketId: 'tk_seed_02', timestamp: now - 5 * H, diagnosticType: 'alarmflood', summary: 'Alarm flood: 412 alarms peak in 10 min; top tag FDR33_REL_TRIP',
        payload: { peak10min: 412, topTag: 'FDR33_REL_TRIP', flood: true } },
      { id: 'dg_seed_4', ticketId: 'tk_seed_03', timestamp: now - 7 * H, diagnosticType: 'historian', summary: 'Historian query built for 38 RO tags (Cyclic 60000 ms)',
        payload: { tags: 38, mode: 'Cyclic', resolution: 60000 } },
      { id: 'dg_seed_5', ticketId: null, timestamp: now - 30 * H, diagnosticType: 'opc', summary: 'OPC quality 0x00C0 — Good',
        payload: { input: '0x00C0', quality: 'Good', substatus: 'Non-specific', limit: 'Not limited' } },
      { id: 'dg_seed_6', ticketId: 'tk_seed_02', timestamp: now - 30 * H, diagnosticType: 'alarmflood', summary: 'Alarm flood: 96 alarms peak in 10 min; chattering tag LT_101_HI',
        payload: { peak10min: 96, topTag: 'LT_101_HI', flood: true } }
    ];
  }

  const kb = [
    { id: 'kb_01', title: 'SOP — OPC DA DCOM Access Denied (0x80070005) Troubleshooting', category: 'SOP', tags: ['opc', 'dcom', 'windows'],
      content: '1. Confirm both machines are time-synced and name resolution works (ping by hostname).\n2. dcomcnfg → My Computer → Properties → COM Security: add the OPC client user to Access and Launch permissions (local + remote).\n3. Set the OPC server application authentication level to Connect and identity to the interactive or a dedicated service user.\n4. Windows Firewall: allow TCP 135 and the dynamic DCOM range, or restrict the range with the Internet Explorer/DCOM port policy.\n5. After Windows patches, re-check KB hardening for DCOM (authentication level raised to Packet Integrity). Set client authentication level to match.\n6. Verify with a test OPC client browse. Record result in the ticket.' },
    { id: 'kb_02', title: 'Modbus Troubleshooting Guide — Exceptions and Address Mapping', category: 'PLC Integration', tags: ['modbus', 'rtu', 'tcp'],
      content: 'Common exceptions: 01 Illegal Function (device does not support FC), 02 Illegal Data Address (check 0-based vs 1-based, block size), 03 Illegal Data Value, 04 Slave Device Failure, 06 Busy (retry with delay), 0A/0B gateway path or target not responding.\nAddress mapping: 40001 (holding) = offset 0, 30001 (input) = offset 0, 10001 (discrete input) = offset 0, 00001 (coil) = offset 0. Some vendors document 1-based addresses, others 0-based; confirm with the device manual before changing DAServer item names.\nRTU checks: baud, parity, stop bits, termination 120 ohm at both ends, biasing, shared ground, unique slave IDs, response timeout >= device turnaround.\nTCP checks: port 502 reachable, only one master if device supports few connections, keep-alive.' },
    { id: 'kb_03', title: 'Wonderware Historian — Deadband and Storage Tuning', category: 'SQL / Historian', tags: ['historian', 'sql', 'deadband'],
      content: 'Use delta storage with a value deadband sized to about 0.5–1% of engineering range for analog process variables; use time deadband for noisy sensors.\nCheck storage: Runtime database file sizes, free disk on the history block drive, and that the retrieval and storage services are running.\nQuery tips: always filter on TagName and DateTime, avoid SELECT *, use wwResolution with Cyclic retrieval for charts, limit rows with wwRowCount, and run long queries off-peak.\nBackups: archive old history blocks before the drive passes 80% usage.' },
    { id: 'kb_04', title: 'InTouch QuickScript Snippet Library', category: 'Wonderware', tags: ['quickscript', 'intouch', 'snippet'],
      content: '// Pump alternation (safe divide)\nIF Pump_Runtime_Total > 0 THEN\n  Pump_Load_Ratio = Pump1_Runtime / Pump_Runtime_Total;\nELSE\n  Pump_Load_Ratio = 0;\nENDIF;\n\n// Check quality before using a value\nIF Tank1_Level.Quality == 192 THEN\n  Tank1_Display = Tank1_Level;\nENDIF;\n\n// Debounce a command\nIF Cmd_Start == 1 AND Start_Lock == 0 THEN\n  Start_Lock = 1;\n  Pump1_Cmd = 1;\nENDIF;\n\nDebug checklist: 1) Check script type (Condition/Data change/While running). 2) Use LogMessage() to trace. 3) Check tag types and units. 4) Guard divisions and array bounds. 5) Avoid heavy logic in window scripts.' },
    { id: 'kb_05', title: 'Siemens S7 Connectivity Checklist', category: 'PLC Integration', tags: ['siemens', 's7', 'comms'],
      content: 'Ports: TCP 102 (ISO-on-TCP). In TIA Portal enable "Permit access with PUT/GET communication" for the CPU if the client requires it and the client has approval.\nCheck: unique IP, subnet mask, CPU connection resources not exhausted, optimized block access disabled for absolute addressing, switch loops (STP) and duplicate IP. Review the CPU diagnostic buffer for connection events before restarting anything.' },
    { id: 'kb_06', title: 'Galaxy Deployment and Platform Recovery SOP', category: 'SOP', tags: ['galaxy', 'archestra', 'platform'],
      content: '1. Capture Galaxy backup (.cab) before any change.\n2. Verify platform status in the SMC Platform Manager: Bootstrap, aaEngine, aaGR services.\n3. If a platform is in Warning: stop the platform, ensure no stuck aaEngine process, restart services in order, and redeploy.\n4. Check time sync between GR and run-time nodes.\n5. Document actions and outcomes in the ticket. Never undeploy production objects without a Permit-to-Work.' },
    { id: 'kb_07', title: 'HMI Operator User Manual — Alarm Handling', category: 'User Manual', tags: ['hmi', 'alarm', 'training'],
      content: 'Alarm priorities: Critical (red) needs immediate action, Warning (amber) requires attention in the shift, Advisory (blue) is informational. Acknowledge the alarm only after you understand the cause. Use the alarm summary filter by area. Report chattering alarms to the SCADA engineer rather than silencing them repeatedly.' },
    { id: 'kb_08', title: 'Design Spec Template — Remote Support Connection', category: 'Design Spec', tags: ['vpn', 'remote', 'cyber'],
      content: 'Remote access architecture: Engineer laptop → client VPN → DMZ jump host (MFA) → SCADA network. Session recording on, read-only by default. Write access only with approved PTW and the QHSE gate (Annexure-SCT-HR-001) completed. No direct internet connection from SCADA servers.' }
  ].map((d) => Object.assign({ updatedAt: Date.now() }, d));

  const training = [
    { id: 'tr_01', date: '2026-08-12', client: 'Dubai Marina District Cooling Plant', module: 'Wonderware InTouch Maintenance — Alarm and Trend Basics', trainer: 'SCADA Engineer', hours: 4,
      attendees: [{ name: 'Operator A', signed: true }, { name: 'Operator B', signed: true }, { name: 'Technician C', signed: false }] },
    { id: 'tr_02', date: '2026-09-03', client: 'Al Quoz Water Pumping Station', module: 'Modbus and OPC Communication Fault Finding', trainer: 'SCADA Engineer', hours: 3,
      attendees: [{ name: 'Engineer D', signed: true }, { name: 'Technician E', signed: true }] },
    { id: 'tr_03', date: '2026-10-07', client: 'Sharjah Industrial RO Plant', module: 'Historian Basics and Report Extraction', trainer: 'SCADA Engineer', hours: 4,
      attendees: [{ name: 'Chemist F', signed: false }, { name: 'Operator G', signed: false }] }
  ];

  const qhse = [
    { id: 'qa_01', timestamp: Date.now() - 20 * H, ticketId: 'tk_seed_02', site: 'Jebel Ali Utility Substation', engineer: 'SCADA Engineer', annexure: 'Annexure-SCT-HR-001',
      checks: { ptw: true, loto: true, backup: true, rollback: true, ops: true, cyber: true, force: true, ppe: true, comms: true }, result: 'PASS', remarks: 'Relay alarm filter change approved by client electrical team.' },
    { id: 'qa_02', timestamp: Date.now() - 55 * H, ticketId: 'tk_seed_06', site: 'Al Quoz Water Pumping Station', engineer: 'SCADA Engineer', annexure: 'Annexure-SCT-HR-001',
      checks: { ptw: true, loto: false, backup: true, rollback: true, ops: true, cyber: true, force: true, ppe: false, comms: true }, result: 'FAIL', remarks: 'LOTO not yet confirmed — online change postponed.' }
  ];

  global.SEED = { SLA, QHSE_ITEMS, sites, kb, training, qhse, buildTickets, buildDiagnostics, ticketCount: T.length };
})(window);
