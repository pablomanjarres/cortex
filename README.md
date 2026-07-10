<p align="center">
  <a href="https://pablomanjarres.com/oss/cortex"><img src=".github/banner.webp" alt="Cortex" width="100%" /></a>
</p>

<h1 align="center">Cortex</h1>

<p align="center"><em>A private, encrypted desktop dashboard that audits your days as a founder, student, and human. Claude reads and writes all of it.</em></p>

<p align="center">
  <img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript_5.9-3178C6?style=flat&logo=typescript&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React_19-20232A?style=flat&logo=react&logoColor=61DAFB" />
  <img alt="Electron 41" src="https://img.shields.io/badge/Electron_41-2C2E3B?style=flat&logo=electron&logoColor=9FEAF9" />
  <img alt="Vite 8" src="https://img.shields.io/badge/Vite_8-646CFF?style=flat&logo=vite&logoColor=white" />
  <img alt="Tailwind v4" src="https://img.shields.io/badge/Tailwind_v4-0B1120?style=flat&logo=tailwindcss&logoColor=38BDF8" />
  <img alt="MCP 72 tools" src="https://img.shields.io/badge/MCP-72_tools-c8542a?style=flat" />
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-c8542a?style=flat" />
  <img alt="status shipped" src="https://img.shields.io/badge/status-shipped-success?style=flat" />
  <a href="https://pablomanjarres.com/portfolio/projects/cortex"><img alt="Portfolio" src="https://img.shields.io/badge/portfolio-pablomanjarres.com-c8542a?style=flat" /></a>
  <a href="https://pablomanjarres.com/oss/cortex"><img alt="Landing" src="https://img.shields.io/badge/landing-pablo--oss-c8542a?style=flat" /></a>
</p>

<p align="center"><img src="https://pablomanjarres.com/portfolio/previews/cortex.png" alt="Cortex screenshot" width="720" /></p>

Cortex is a macOS desktop app that pulls a founder's whole life into one private dashboard: habits, sprints, reading, CRM, calendar, coursework, finances, go-to-market state, and live founder metrics. The data stays on your machine, encrypted at rest. A local web server makes the same dashboard reachable from your phone over Tailscale, and a 72-tool MCP server lets Claude read and write all of it.

## Highlights

- **Encrypted at rest.** Every data file is sealed with AES-256-GCM inside a small binary container: a `CTX1` magic header, a version byte, a fresh 12-byte IV per write, and the GCM auth tag. The 32-byte master key lives behind Electron `safeStorage`, backed by the macOS Keychain. Plaintext files migrate to ciphertext once, guarded by a sentinel so the migration never runs twice.
- **A 72-tool MCP server.** One MCP server (18 tool groups) proxies the app's `localhost:3456` API, so Claude can read and write habits, journal, contacts, calendar, GTM state, and founder metrics. It runs over stdio by default, with an optional `--http` transport for Tailscale access, socket-gated to localhost and the Tailscale CGNAT range just like the app server.
- **Three-tier persistence, push-based.** A single `useStore` hook writes through Electron IPC first, then the HTTP web API, then `localStorage`. The main process broadcasts `data:changed` after every write (no renderer polling), and writes carry optimistic-concurrency revs — conflicting writers get a 409 and rebase instead of clobbering each other.
- **Phone access over Tailscale.** A built-in web server serves the app as a PWA. The socket is gated to localhost and the Tailscale CGNAT range (`100.64.0.0/10`), so only your own devices on your tailnet can reach it.
- **Opportunity Radar.** A weekly launchd pipeline (Monday 09:00) scrapes feeds natively on the host, then hands them to a tool-less `claude -p` call (`--allowedTools ""`) that classifies and scores each one against an editable profile — now with deadline intelligence (fixed / rolling / recurring / always-open), funding amounts, and age-eligibility flags. A curated catalog of 30 verified fellowships, grants, and programs (Emergent Ventures, Thiel, Z Fellows, Latitud, …) seeds the radar beyond hackathons. Recurring programs refresh across yearly cycles instead of being dropped as duplicates.
- **Founder metrics, background-refreshed.** An in-process refresher polls GitHub (1-2 GraphQL calls, commit-exact), Lemon Squeezy (MRR), Vercel, and Supabase every 30 minutes, persists daily rollups into a 365-day history, and pushes updates to the page live — metrics are consistent over time and render instantly even on first navigation.
- **One design system.** A warm-graphite instrument-panel theme: OKLCH tokens, a single ice-cyan signal accent, Instrument Serif display voice, IBM Plex Mono telemetry, and shared primitives (StatTile, Chip, EmptyState, Modal) across all 20 feature modules — zero raw palette classes in the codebase.

## How it works

```text
cortex/
├── electron/            # main process: window, tray, IPC, :3456 web server
│   ├── crypto.ts        # AES-256-GCM at rest (key via safeStorage / Keychain)
│   ├── calendar.ts      # native macOS calendar CRUD (embedded Swift + EventKit)
│   └── integrations/    # github · lemon · vercel · supabase · mars vault
├── src/
│   ├── features/        # 20 feature modules (daily, habits, founder, crm, gym, …)
│   └── lib/store.ts     # 3-tier persistence: IPC → HTTP → localStorage
├── mcp-server/          # 51-tool MCP over the localhost API (stdio | --http)
└── scripts/             # Opportunity Radar: launchd + watcher + tool-less LLM classify
```

The Electron main process owns the encrypted data directory, a tray menu, and the `:3456` web server. The React renderer talks to it through a context-isolated preload bridge. The MCP server is a thin proxy over that same web API, so one code path serves the desktop app, the phone, and the agent.

## What's inside

Cortex is one Electron plus React app with a standalone MCP package and a set of automation scripts beside it.

| Path | What it is |
|---|---|
| `src/` | React 19 renderer built with Vite 8: 20 feature modules under `src/features`, shared primitives in `src/components`, the persistence hook in `src/lib/store.ts` |
| `electron/` | Main process: window, tray, the `:3456` web server, `crypto.ts` (AES-256-GCM), `calendar.ts` (Swift + EventKit), `keychain.ts`, and the context-isolated `preload.ts` |
| `electron/integrations/` | One file per source: `github.ts`, `lemon.ts`, `vercel.ts`, `supabase.ts`, `mars.ts` (Obsidian vault) |
| `mcp-server/` | Standalone npm package `cortex-mcp-server`: 72 tools in 18 groups over the localhost API, stdio or `--http` |
| `scripts/` | Opportunity Radar (`radar-*.mjs`, `opportunity-radar-weekly.sh`, launchd `*.plist` files), the program catalog + seeder (`program-catalog.json`, `radar-seed-programs.mjs`), and `growth-fetch.mjs` for the fastest-growing-repos tab |
| `public/` | PWA shell: `manifest.webmanifest`, `sw.js` service worker, and app icons |

The 20 feature modules under `src/features`, grouped:

- **Days and routine:** `daily`, `habits`, `goals`, `gym`, `thoughts`, `captures`
- **People:** `crm`, `social`
- **Founder and growth:** `founder`, `opportunities`, `automations`, `stats`
- **Money:** `finance`
- **Learning:** `student`, `courses`, `books`, `library`, `projects`
- **App:** `system`, `settings`

## Tech stack

React 19 · TypeScript 5.9 · Electron 41 · Vite 8 · Tailwind CSS v4 (OKLCH warm-graphite instrument theme) · Instrument Serif + Inter + IBM Plex Mono · shadcn/ui · Recharts · Framer Motion · React Router v7 (HashRouter) · Model Context Protocol SDK · launchd.

## Getting started

Requires macOS on Apple Silicon and Node 20 or newer (Vite 8's floor).

```bash
npm install

# web only: fast HMR, no Electron features
npm run dev

# full Electron plus web dev
npm run electron:dev

# package the app into release/mac-arm64/Cortex.app
npm run electron:build

# build, copy to /Applications, clear quarantine, and ad-hoc sign
npm run cortex:install
```

### Wire up the MCP server

The Cortex app must be running first, since the MCP server proxies the API it hosts on `:3456`.

```bash
cd mcp-server && npm install && npm run build

# register with Claude (user scope, local stdio)
claude mcp add cortex --scope user -- node "$PWD/dist/index.js"
```

## License

MIT.

---

<p align="center">
  <a href="https://pablomanjarres.com/oss/cortex">Landing</a> ·
  <a href="https://pablomanjarres.com/portfolio/projects/cortex">Portfolio write-up</a> ·
  Built by Pablo Manjarres
</p>
