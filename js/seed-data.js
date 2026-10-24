/* SCADA HelpDesk OS — pre-seeded Dubai / UAE sample support data (illustrative, not real client records) */
(function (global) {
  'use strict';
  const H = 3600000;

  const SLA = {
    P1: { label: 'Critical', hours: 2, color: 'red' },
    P2: { label: 'High', hours: 4, color: 'amber' },
    P3: { label: 'Medium', hours: 12, color: 'cyan' },
    P4: { label: 'Low', hours: 24, color: 'blue' }
  };

  const sites = [
    { id: 'site_jaus', name: 'Jebel Ali Utility Substation', sector: 'Power Distribution' },
    { id: 'site_dmdc', name: 'Dubai Marina District Cooling Plant', sector: 'District Cooling' },
    { id: 'site_aqwp', name: 'Al Quoz Water Pumping Station', sector: 'Water / Wastewater' },
    { id: 'site_shro', name: 'Sharjah Industrial RO Plant', sector: 'Water / Wastewater' },
    { id: 'site_hgcs', name: 'Habshan Gas Compression Skid', sector: 'Oil & Gas' },
    { id: 'site_bbbm', name: 'Business Bay BMS Tower', sector: 'BMS' },
    { id: 'site_dicp', name: 'Dubai Industrial City Packaging Line', sector: 'Industrial Manufacturing' }
  ];

  // Quick-fill list for the New Ticket form
  const QUICK = [
    { label: 'InTouch HMI Tag Frozen', title: 'InTouch HMI tags frozen / showing bad quality', description: 'Operator reports values on the HMI are not updating and some tags show "?" or a red quality flag. Plant is still running.', protocol: 'Wonderware', priority: 'P2', category: 'Communications', tool: 'opc', preset: 'comm' },
    { label: 'OPC Server Disconnected', title: 'OPC server disconnected from HMI', description: 'HMI cannot connect to the OPC server. All tags from that server are bad.', protocol: 'OPC DA', priority: 'P2', category: 'Communications', tool: 'opc', preset: 'dcom' },
    { label: 'Modbus Meter Timeout', title: 'Modbus meter not responding (timeout)', description: 'Energy / flow meter on the Modbus network stopped responding. Values stuck at last reading.', protocol: 'Modbus RTU', priority: 'P3', category: 'Integration', tool: 'modbus', preset: 'timeout' },
    { label: 'Historian Trend Missing', title: 'Historian trend has a gap / no data', description: 'Trend charts show a flat line or gap for some tags. Live values look normal on the HMI.', protocol: 'SQL/Historian', priority: 'P3', category: 'Historian', tool: 'wonderware', preset: 'historian' },
    { label: 'PLC Comm Alarm', title: 'PLC communication alarm on SCADA', description: 'SCADA raises a PLC communication failure alarm. Local panel at the PLC still looks healthy.', protocol: 'Siemens S7', priority: 'P2', category: 'Communications', tool: 'plc', preset: 's7' }
  ];

  // [title, description, siteIdx, protocol, priority, status, category, caller, ageH, resolvedAfterH, resolutionNote, tool, preset]
  const T = [
    ['InTouch tags showing bad quality (?) on Chiller 2 group', 'All Chiller 2 analog tags went to Bad / Comm Failure. Other chillers are fine. HMI still running.', 1, 'EtherNet/IP', 'P1', 'In Progress', 'Communications', 'Shift Operator — DMDC', 1.0, 0, '', 'opc', 'comm'],
    ['Alarm flood on 33kV feeder after relay reset', 'More than 400 alarms in 10 minutes after a protection relay reset. Operators cannot see priority alarms.', 0, 'Wonderware', 'P1', 'In Progress', 'Alarm Management', 'Control Room Supervisor — JAUS', 2.3, 0, '', 'wonderware', 'flood'],
    ['Historian not storing data for RO skid tags', 'Trend is flat since 06:10. Historian client shows no new values for 38 tags.', 3, 'SQL/Historian', 'P2', 'In Progress', 'Historian', 'Plant Chemist — SHRO', 3.0, 0, '', 'wonderware', 'historian'],
    ['OPC DA connection to DAServer fails after Windows update', 'DCOM "access denied" appears on the HMI server after monthly patching.', 2, 'OPC DA', 'P2', 'Open', 'Communications', 'Operations Engineer — AQWP', 5.0, 0, '', 'opc', 'dcom'],
    ['Modbus RTU meters returning exception 02', 'Energy meters 5-9 answer with "illegal data address" after a meter firmware change.', 5, 'Modbus RTU', 'P3', 'Open', 'Integration', 'FM Technical Manager — BBBM', 4.0, 0, '', 'modbus', 'exc02'],
    ['QuickScript error on pump alternation logic', 'Runtime script reports an error at pump changeover.', 2, 'Wonderware', 'P3', 'In Progress', 'Scripting', 'Operations Engineer — AQWP', 9.0, 0, '', 'wonderware', 'script'],
    ['S7-1500 connection drops every 20 minutes', 'HMI loses the S7 connection for about 15 s. PLC CPU shows no fault.', 6, 'Siemens S7', 'P2', 'Open', 'Communications', 'Maintenance Lead — DICP', 1.5, 0, '', 'plc', 's7'],
    ['Add two new analog points to Compressor HMI screen', 'Request to add suction pressure and temperature transmitters to the overview screen.', 4, 'EtherNet/IP', 'P4', 'Open', 'Change Request', 'Instrument Supervisor — HGCS', 6.0, 0, '', 'plc', 'ab'],
    ['Slow InTouch screen call-up (8–10 s)', 'Main overview takes a long time to open on two clients.', 6, 'Wonderware', 'P4', 'Open', 'Performance', 'Maintenance Lead — DICP', 7.0, 0, '', 'wonderware', 'slow'],
    ['HMI trend shows wrong timezone', 'Trends are 4 hours off compared with the plant clock after a server restore.', 1, 'SQL/Historian', 'P3', 'Resolved', 'Historian', 'Plant Manager — DMDC', 7.0, 4.0, 'Historian server timezone had reverted to UTC after the restore. Reset to Arabian Standard Time and verified retrieval.', 'wonderware', 'historian'],
    ['Galaxy platform in Warning after reboot', 'Platform2 shows Warning and objects are not deploying.', 0, 'Wonderware', 'P2', 'Resolved', 'System Platform', 'Control Room Supervisor — JAUS', 30, 3.0, 'Stuck aaEngine process blocked the Bootstrap service. Restarted services in order and redeployed.', 'wonderware', 'flood'],
    ['Pump 3 status stuck on Running in HMI', 'Pump stopped locally but the HMI still shows Running.', 2, 'Modbus TCP', 'P3', 'Resolved', 'Integration', 'Operations Engineer — AQWP', 60, 9.0, 'Register offset was off by one (40001 vs 0-based) after a PLC program update. Corrected the address map.', 'modbus', 'exc02'],
    ['OPC UA certificate rejected after server replacement', 'Client cannot connect, BadSecurityChecksFailed.', 3, 'OPC UA', 'P2', 'Resolved', 'Communications', 'Plant Chemist — SHRO', 100, 3.0, 'New server certificate was not trusted by the client. Imported to the trusted store and verified the endpoint.', 'opc', 'uacert'],
    ['Weekly Historian backup job failed', 'SQL Agent job failed, disk about 96% full.', 1, 'SQL/Historian', 'P2', 'Resolved', 'Historian', 'Plant Manager — DMDC', 200, 3.5, 'Old history blocks were not archived. Archived them and added a disk-space alert at 80%.', 'wonderware', 'historian'],
    // Older history (so the 6-month cleanup has something to archive)
    ['PLC comm alarm after switch replacement', 'S7 connection dropped after the network switch was swapped.', 6, 'Siemens S7', 'P2', 'Resolved', 'Communications', 'Maintenance Lead — DICP', 5200, 2.0, 'Port speed mismatch on the new switch. Set to auto-negotiate.', 'plc', 's7'],
    ['Modbus gateway timeout on BTU meters', 'Meters behind the serial gateway stopped answering.', 1, 'Modbus RTU', 'P3', 'Resolved', 'Integration', 'Plant Manager — DMDC', 6500, 5.0, 'Termination resistor missing at the end of the RS-485 line. Fitted 120 ohm resistor.', 'modbus', 'timeout'],
    ['OPC DA tags bad after HMI server rebuild', 'DCOM permissions were lost on the rebuilt server.', 2, 'OPC DA', 'P2', 'Resolved', 'Communications', 'Operations Engineer — AQWP', 9000, 3.0, 'Re-applied DCOM launch and access permissions for the OPC client user.', 'opc', 'dcom'],
    ['Historian query timeout on yearly report', 'Report query ran out of time on a large tag list.', 3, 'SQL/Historian', 'P4', 'Resolved', 'Historian', 'Plant Chemist — SHRO', 12000, 8.0, 'Query used Full retrieval over 12 months. Switched to Cyclic with 1 h resolution.', 'wonderware', 'historian']
  ];

  function buildTickets(now, sla) {
    const year = new Date(now).getFullYear();
    const hrs = sla || { P1: 2, P2: 4, P3: 12, P4: 24 };
    return T.map((r, i) => {
      const createdAt = now - r[8] * H;
      const resolved = r[5] === 'Resolved';
      const resolvedAt = resolved ? createdAt + r[9] * H : null;
      const updatedAt = resolved ? resolvedAt : now - Math.min(r[8], 0.5) * H;
      const site = sites[r[2]];
      const timeline = [{ ts: createdAt, author: r[7], text: 'Ticket logged.' }];
      if (r[5] !== 'Open') timeline.push({ ts: createdAt + 0.1 * H, author: 'SCADA Support Engineer', text: 'Acknowledged. Started remote checks.' });
      if (resolved) timeline.push({ ts: resolvedAt, author: 'SCADA Support Engineer', text: 'Resolved: ' + r[10] });
      return {
        id: 'tk_seed_' + String(i + 1).padStart(2, '0'),
        ticketNumber: 'AGAC-' + year + '-' + String(1001 + i).padStart(5, '0'),
        title: r[0], description: r[1], siteId: site.id, siteName: site.name, protocol: r[3], priority: r[4], status: r[5],
        category: r[6], reporter: r[7], contact: '', assignee: 'SCADA Support Engineer', createdAt, updatedAt, resolvedAt,
        respondedAt: r[5] === 'Open' ? null : createdAt + 0.1 * H, slaHours: hrs[r[4]], slaResolveDue: createdAt + hrs[r[4]] * H,
        resolutionNote: r[10], hoursSpent: resolved ? r[9] : 0, tool: r[11], preset: r[12], timeline
      };
    });
  }

  function buildDiagnostics(now) {
    const mk = (id, ticketId, ageH, type, summary, diagnosis, steps, technical) => ({
      id, ticketId, timestamp: now - ageH * H, diagnosticType: type, summary,
      payload: { diagnosis, steps: steps.map((s, i) => ({ text: s, done: i < 2 })), technical: technical || '' }
    });
    return [
      mk('dg_seed_1', 'tk_seed_01', 0.8, 'opc', 'OPC 0x0018 — Comm Failure', 'The OPC server lost contact with the device. Values on the HMI are old.', ['Ping the PLC / gateway', 'Check the topic status in the DAServer', 'Check cable and switch port'], 'Quality 0x0018 = Bad / Comm failure'),
      mk('dg_seed_2', 'tk_seed_02', 2.0, 'wonderware', 'Alarm flood: 36 alarms in 10 min, top tag LT_101_HI', 'A flood is more than 10 alarms in 10 minutes. One tag is chattering.', ['Find the chattering tag', 'Add an on-delay / deadband', 'Check for a common cause (relay reset)'], 'Peak 36 / 10 min'),
      mk('dg_seed_3', 'tk_seed_03', 2.5, 'wonderware', 'Historian query built for RO skid tags', 'Storage looks interrupted; the query helps confirm where data stops.', ['Run the query for the last hour', 'Check the free disk space on the history drive', 'Check the Historian storage service'], ''),
      mk('dg_seed_4', 'tk_seed_05', 3.5, 'modbus', 'Modbus exception 02 — Illegal Data Address', 'The meter does not have the register that was asked for.', ['Check 0-based vs 1-based address', 'Check the quantity', 'Compare with the meter manual'], 'RTU 05 03 00 00 00 0A C4 4E'),
      mk('dg_seed_5', 'tk_seed_07', 1.0, 'plc', 'Siemens S7 pre-check', 'Use this list to rule out the network and CPU before closing.', ['Ping the PLC', 'Check for a duplicate IP address', 'Check the CPU diagnostic buffer'], 'Port TCP 102'),
      mk('dg_seed_6', 'tk_seed_13', 99, 'opc', 'OPC UA certificate rejected', 'The client does not trust the new server certificate.', ['Open the server certificate', 'Move it to the trusted list', 'Reconnect'], '')
    ];
  }

  global.SEED = { SLA, sites, QUICK, buildTickets, buildDiagnostics, ticketCount: T.length };
})(window);
