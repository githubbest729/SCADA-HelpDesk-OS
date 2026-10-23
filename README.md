# SCADA HelpDesk OS — Al Gurg Automation & Controls

Offline-first Progressive Web App for SCADA support engineers (Dubai, U.A.E.): SLA ticketing, OPC / Modbus / Wonderware remote diagnostics, SOP knowledge base and training log, site BOM estimator, and the Annexure-SCT-HR-001 QHSE gate. No external CDN or network dependency.

## Run it

PWAs need `http://localhost` or HTTPS for the service worker and install prompt.

```bash
cd SCADA-HelpDesk-OS-PWA
python3 -m http.server 8080
# open http://localhost:8080
```

Or host the folder on any static HTTPS host (IIS, nginx, Netlify, GitHub Pages). Open the site once while online so the service worker caches the shell; after that it works fully offline.

Install: Chrome/Edge show an **Install App** button in the header. On iOS Safari use Share → *Add to Home Screen*.

## Features

| View | What it does |
|---|---|
| Command Center | KPI cards, filtered/paginated ticket table, kanban, new ticket, ticket drawer (live SLA timer, RCA log, attached diagnostics, QHSE gate, printable service report) |
| Remote Diagnostics | OPC DA/UA quality decoder, Modbus frame builder with CRC-16 and LRC, register converter, exception decoder, Historian SQL builder, deadband calculator, QuickScript linter, alarm-flood analyzer, PLC reference. Results can be attached to a ticket |
| SOP & Training | CRUD knowledge base with search, training session log with competency sign-off |
| Sites · BOM · QHSE | UAE site registry, BOM/service-hour estimator (AED, VAT), QHSE gate audit log |
| Storage Vault | Persistent-storage lock, quota telemetry, per-store counts, 3-year forecast, cold archive compaction, JSON backup/restore, CSV export, service-worker cache manager |

## Storage design (2–3 years)

IndexedDB database `SCADA_HelpDesk_OS_DB` with stores `tickets`, `diagnostics`, `knowledge_base`, `training_sessions`, `sites_bom`, `qhse_audits`, `cold_archive`. Lists use indexed cursor pagination with debounced search, so the UI stays responsive at 25,000+ records. Closed tickets older than the configured threshold can be moved to `cold_archive`. Use the Storage Vault to lock persistent storage and take regular JSON backups.

## Notes

- Data lives only in the browser profile on the device. Back up regularly from the Storage Vault.
- Remote PLC forcing is never performed by this app; it records the QHSE gate (permit-to-work, LOTO, backup snapshot) that must be completed before any online change.
- `.well-known/assetlinks.json` contains a placeholder package name and fingerprint; replace both if you wrap the PWA as a Trusted Web Activity.
- Seed data is illustrative sample content, not real client records.
