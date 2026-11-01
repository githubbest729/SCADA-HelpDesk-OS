<div align="center">

<img src="favicon.svg" alt="SCADA HelpDesk OS Logo" width="88" height="88" />

# SCADA HelpDesk OS
### Automation & Controls — Dubai, U.A.E.

**A zero-dependency, offline-first Progressive Web App (PWA) for industrial SCADA/PLC technical support.**  
*Log plant calls, diagnose OPC/Modbus/Wonderware issues in plain English, attach telemetry to tickets, and track SLA resolution.*

[![PWA Ready](https://img.shields.io/badge/PWA-Installable-06b6d4?style=flat-square&logo=pwa&logoColor=white)](manifest.webmanifest)
[![Offline First](https://img.shields.io/badge/Offline-100%25%20IndexedDB-10b981?style=flat-square)](#storage-engine-23-years)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero%20CDN-3b82f6?style=flat-square)](#run-it)
[![License](https://img.shields.io/badge/License-Proprietary-slate?style=flat-square)](#notes)

<br/>

<img src="screenshots/screenshot-wide.png" alt="SCADA HelpDesk OS Interface" width="880" style="border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.2);" />

</div>

---

## Quick Start

PWAs require `http://localhost` or a secure **HTTPS** origin to enable the Service Worker offline cache and the native browser install prompt.

```bash
# Clone or navigate to the project directory
cd SCADA-HelpDesk-OS-PWA

# Start a local static server
python3 -m http.server 8080
```

1. Open `http://localhost:8080` (or your static host, such as GitHub Pages).
2. Open the app once while online to populate the offline cache.
3. Click **⬇ Install App** in the header to install it as a standalone desktop or mobile application. The app functions indefinitely with zero internet access.

---

## System Architecture

The application runs entirely on the client edge within the browser sandbox. No external servers, cloud databases, or CDN services are queried during runtime.

```mermaid
flowchart TB
    subgraph UI ["User Interface Layer"]
        HMI["Responsive Industrial HMI Shell\n(Dark / Light Modes, ISA-101 Palette)"]
        TICKETS["🎫 HelpDesk Tickets\n(KPIs, Kanban / List, SLA Countdown)"]
        DIAG["🔌 Remote Diagnostics\n(OPC UA/DA, Modbus, InTouch/SQL, S7/AB)"]
        GUIDE["📖 Interactive Guide & Tour\n(Spotlight Walkthrough, PWA Onboarding)"]
        SETTINGS["⚙️ Settings & Storage Vault\n(JSON Backups, Quota Guard, Theme)"]
    end

    subgraph WORKER ["Service Worker Sandbox (sw.js)"]
        CACHE["Cache Storage (Cache-First)\nHTML, CSS, JS, SVG, Binary Icons"]
        OFFLINE["Offline Fallback Engine\n(offline.html)"]
    end

    subgraph STORAGE ["Local Persistence Engine (IndexedDB)"]
        DB[(SCADA_HelpDesk_OS_DB)]
        STORE_TICKETS[("tickets\n(Indexed by ID, SLA, Status, Site)")]
        STORE_DIAG[("diagnostics\n(Telemetry, Hex Frames, Decodes)")]
        STORE_COLD[("cold_archive\n(Compressed >6mo History)")]
        STORE_CONF[("settings\n(Profile, Theme, Hints, SLA Defaults)")]
    end

    subgraph HARDWARE ["Local Device Hardware & Browser API"]
        PERSIST["navigator.storage.persist()\n(Eviction Protection)"]
        ESTIMATE["navigator.storage.estimate()\n(Capacity Telemetry)"]
        FILESYSTEM["File System Streams\n(.json Snapshots / .csv Exports)"]
    end

    %% Routing & Wiring
    HMI --> TICKETS
    HMI --> DIAG
    HMI --> GUIDE
    HMI --> SETTINGS

    TICKETS -- "1-Click Telemetry Binding" <--> DIAG
    HMI <--> WORKER
    WORKER --> CACHE
    WORKER --> OFFLINE

    TICKETS <--> STORE_TICKETS
    DIAG --> STORE_DIAG
    STORE_DIAG -.-> STORE_TICKETS
    SETTINGS <--> STORE_CONF
    STORE_TICKETS -- "Auto-Archive (>180d)" --> STORE_COLD

    STORE_TICKETS & STORE_DIAG & STORE_COLD & STORE_CONF --- DB
    DB <--> PERSIST
    DB <--> ESTIMATE
    SETTINGS <--> FILESYSTEM
```

---

## Core Workspaces & Capabilities

| Workspace | Module Icon | Description & Key Functions |
|---|:---:|---|
| **HelpDesk Tickets** | <img src="icons/shortcut-new-ticket-96.png" width="28" height="28" /> | Real-time industrial incident tracking. Includes live SLA countdown timers (P1 Critical to P4 Low), multi-project site filters, quick-fill symptom templates, search cursor pagination, and printable Client Service Reports. |
| **Remote Diagnostics** | <img src="icons/shortcut-diagnostics-96.png" width="28" height="28" /> | Guided troubleshooting workbench with four built-in engines:<br/>• **OPC DA/UA**: Hex quality code decoder (`0x00C0`, `0x0018`, `0x80070005`) and endpoint syntax validator.<br/>• **Modbus TCP/RTU**: Frame generator, CRC-16/LRC calculator, and `40001` zero-based register mapper.<br/>• **InTouch & Historian**: SQL query optimizer (`Runtime.dbo.History`), deadband calculator, and QuickScript syntax checker.<br/>• **PLC Reference**: Pinouts, ports (`102`, `502`, `44818`), and LED fault tables for Siemens S7, ControlLogix, and Modicon.<br/>• **Direct Attachment**: Bind any diagnostic output directly to an active ticket in one click. |
| **Interactive Guide** | <img src="favicon-32x32.png" width="24" height="24" /> | Built-in spotlight coach-mark tour that navigates the live interface, paired with non-technical PWA installation steps for iOS, Android, and Windows/macOS. |
| **Settings & Vault** | <img src="icons/icon-72.png" width="26" height="26" /> | Engineer identity profiles, daylight-readable theme toggle, beginner tooltip switches, persistent storage locks, and one-click JSON/CSV import and export. |

---

## Storage Engine (2–3 Year Lifecycle)

```
SCADA_HelpDesk_OS_DB (IndexedDB)
├── 📂 tickets         -> High-speed cursor queries (Sub-5ms on 25,000+ entries)
├── 📂 diagnostics     -> Telemetry runs, raw Modbus frames, and SQL payloads
├── 📂 cold_archive   -> Compressed historical tickets (>180 days old)
└── 📂 settings       -> Local user preferences and SLA profiles
```

- **Quota Telemetry:** Real-time visual tracking of origin disk usage via `navigator.storage.estimate()`.
- **Eviction Lock:** Explicit invocation of `navigator.storage.persist()` guarantees that host operating systems (iOS Safari/Android Chrome) do not purge tickets under storage pressure.
- **Cold Storage Compaction:** Move resolved tickets past 6 months into the `cold_archive` store to preserve sub-5ms UI responsiveness while keeping old incidents fully searchable.
- **Portability:** Export and import full JSON database snapshots at any time for cross-workstation migration or backups.

---

## Universal PWA Icon Manifest

The application includes an icon asset suite matching PWA standards:

| Icon Asset | Resolution | Purpose |
|---|:---:|---|
| `favicon.svg` | Scalable | Modern vector browser tab icon |
| `favicon.ico` | Multi-size | Legacy desktop browser support |
| `apple-touch-icon.png` | 180×180 | iOS Safari Home Screen icon |
| `icons/icon-192.png` | 192×192 | Standard Android home screen & Chromium install |
| `icons/icon-512.png` | 512×512 | PWA splash screen & application stores |
| `icons/icon-maskable-512.png` | 512×512 | Adaptive Android icon wrapper with safe-zone margins |
| `icons/icon-monochrome-192.png` | 192×192 | Windows Taskbar and monochrome status panels |

---

## Important Operational Notes

> **Safety Notice:** This software does not initiate live network sockets to industrial PLCs, RTUs, or SCADA runtimes. All diagnostic decoders, frame calculators, and query builders provide diagnostic guidance and validation locally. Follow site-specific Permit-to-Work (PTW) protocols before executing any physical or logic changes.

- **Android TWA Integration:** `.well-known/assetlinks.json` is configured with placeholder values. Update the package name and SHA-256 fingerprint if packaging the web app into an Android `.apk` via Trusted Web Activities.
- **Data Boundary:** All data created within the app resides exclusively in the browser's local sandbox. To prevent data loss across OS upgrades or hardware changes, maintain scheduled JSON backups through **Settings → Storage Vault**.
