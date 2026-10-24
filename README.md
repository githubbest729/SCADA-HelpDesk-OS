# SCADA HelpDesk OS — Al Gurg Automation & Controls

A beginner-friendly, offline-first Progressive Web App for end-user SCADA support (Dubai, U.A.E.): log a plant call, run a plain-English remote diagnostic, attach the fix and resolve the ticket. No server, no CDN, no account.

## Run it
PWAs need `http://localhost` or HTTPS for the offline engine and the install button.

```bash
cd SCADA-HelpDesk-OS-PWA
python3 -m http.server 8080      # then open http://localhost:8080
```
Or host the folder on any static HTTPS host. Open it once while online; after that it works with no network.

## What is inside
| Area | What it does |
|---|---|
| 🎫 HelpDesk Tickets | Clickable KPI cards, search, status/priority filters, list or kanban, **+ New Support Ticket** with Quick-Fill, ticket drawer with live SLA timer, 🔍 Diagnose, ✅ Mark Resolved, printable service report |
| 🔌 Remote Diagnostics | Active-ticket banner and 4 guided cards: OPC DA/UA helper, Modbus troubleshooter + register converter (CRC-16), Wonderware / Historian helper (SQL builder, QuickScript check, alarm-flood analyzer), PLC quick-check (S7, Allen-Bradley, Modicon). Each has presets, a plain-English meaning, a fix checklist and **Attach Result & Fix to Ticket** |
| 📖 How-To Guide | Interactive spotlight tour plus four tabs: PWA install help, handling a call, using diagnostics, FAQ |
| ⚙️ Settings | Engineer profile and SLA targets, hints on/off, dark/light theme, large text, storage health, permanent-storage lock, backup / restore / CSV, auto-archive, replay tour, reset samples, offline-cache check |

## Storage (2–3 years)
IndexedDB database `SCADA_HelpDesk_OS_DB` with stores `tickets`, `diagnostics`, `cold_archive`, `settings`. Lists use indexed cursor pagination so the first page stays fast with 25,000+ tickets. Settings → Storage Cleanup moves resolved tickets older than 6 months into compressed cold storage; they remain searchable from the ticket search box and can be brought back.

Data lives only in the browser on this device — download a backup from Settings regularly. Upgrading from the earlier multi-tab build keeps your tickets (extra stores are removed, old statuses mapped to Open / In Progress / Resolved).

## Notes
- The app never connects to PLCs or SCADA systems; diagnostics are guidance, decoders and frame builders. Get permission before any online change or write.
- `.well-known/assetlinks.json` holds a placeholder package name and fingerprint; replace both only if you wrap the PWA as an Android Trusted Web Activity.
- Seed data is illustrative sample content, not real client records.
