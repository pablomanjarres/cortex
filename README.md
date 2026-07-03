# Cortex

> A private, encrypted desktop app for auditing your days as a founder, student, and human. Claude can read and write all of it.

![TypeScript](https://img.shields.io/badge/TypeScript_5.9-3178C6?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=flat&logo=react&logoColor=61DAFB)
![Electron](https://img.shields.io/badge/Electron_41-2C2E3B?style=flat&logo=electron&logoColor=9FEAF9)
![Vite](https://img.shields.io/badge/Vite_8-646CFF?style=flat&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_v4-0B1120?style=flat&logo=tailwindcss&logoColor=38BDF8)
![MCP](https://img.shields.io/badge/MCP-51_tools-c8542a?style=flat)
![Status](https://img.shields.io/badge/status-shipped-success?style=flat)
[![Portfolio](https://img.shields.io/badge/portfolio-pablomanjarres.com-c8542a?style=flat)](https://pablomanjarres.com/portfolio/projects/cortex)

Cortex is a macOS desktop app that pulls a founder's whole life into one private dashboard: habits, sprints, reading, CRM, calendar, coursework, finances, go-to-market state, and live founder metrics. Data stays on your machine, encrypted at rest. A local web server makes the same dashboard reachable from your phone over Tailscale, and a 51-tool MCP server lets Claude read and write all of it.

## Highlights

- **Encrypted at rest.** Every data file is sealed with AES-256-GCM in a custom binary container (magic, version, per-write IV, auth tag). The 32-byte master key lives behind Electron `safeStorage` (Keychain-backed on macOS), and plaintext files are migrated to ciphertext once, behind a sentinel guard.
- **51-tool MCP server.** An MCP server (18 groups) proxies the app's `localhost:3456` API, so Claude can read and write habits, journal, contacts, calendar, GTM, and founder metrics. Runs over stdio by default, with an optional `--http` transport for Tailscale access.
- **Three-tier persistence.** A single `useStore` hook writes through Electron IPC, then the HTTP web API, then `localStorage`, with size-adaptive debounce (150/500/1000ms) and batched `queueMicrotask` flushes.
- **Phone access over Tailscale.** A built-in web server serves the app as a PWA. The socket is IP-gated to localhost and the Tailscale CGNAT range (`100.64.0.0/10`); CORS echoes back only localhost, LAN, and `*.ts.net` origins.
- **Opportunity Radar.** A launchd-scheduled pipeline scrapes feeds on a VM, then has a *tool-less* `claude -p` call classify and score them against an editable profile. The model runs no tools, so a prompt-injected post can't escalate. Survivors are validated and deduped by normalized apply-URL, title, and host across X, Reddit, and Devpost.
- **Founder metrics, unified.** GitHub, Lemon Squeezy (MRR), Vercel, and Supabase integrations plus an Obsidian journal vault feed a weekly-audit rollup, visible in the UI and over MCP.

## How it works

```
cortex/
├── electron/            # main process: window, tray, IPC, :3456 web server
│   ├── crypto.ts        # AES-256-GCM at rest (key via safeStorage / Keychain)
│   ├── calendar.ts      # Swift EventKit calendar CRUD
│   └── integrations/    # github · lemon · vercel · supabase · mars vault
├── src/
│   ├── features/        # 20 feature modules (daily, habits, founder, crm, gym, …)
│   └── lib/store.ts     # 3-tier persistence: IPC → HTTP → localStorage
├── mcp-server/          # 51-tool MCP over the localhost API (stdio | --http)
└── scripts/             # Opportunity Radar: launchd + watcher + LLM classify
```

The Electron main process owns the encrypted data directory, a tray menu, and the `:3456` web server. The React renderer talks to it through a context-isolated preload bridge. The MCP server is a thin proxy over that same web API, which is why one code path serves the desktop app, the phone, and the agent.

## Tech stack

React 19 · TypeScript 5.9 · Electron 41 · Vite 8 · Tailwind CSS v4 (OKLCH, OLED-black theme) · shadcn/ui · Recharts · Zustand · Framer Motion · React Router v7 (HashRouter) · Model Context Protocol SDK · Supabase (publishable/anon, RLS-gated) · launchd.

## Getting started

Requires macOS on Apple Silicon and Node 20+ (Vite 8's floor).

```bash
npm install

# web only: fast HMR, no Electron features
npm run dev

# full Electron + web dev
npm run electron:dev

# package the app into release/mac-arm64/Cortex.app
npm run electron:build

# build, copy to /Applications, clear quarantine, and ad-hoc sign
npm run cortex:install
```

Create `.env` from the example. The Supabase key is a **publishable/anon** key, safe to embed in the client since access is controlled by RLS:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
```

### Wire up the MCP server

```bash
cd mcp-server && npm install && npm run build
# register with Claude (the Cortex app must be running; it hosts the API on :3456)
claude mcp add cortex --scope user -- node "$PWD/dist/index.js"
```

---

Built by Pablo Manjarres. More at [pablomanjarres.com/portfolio/projects/cortex](https://pablomanjarres.com/portfolio/projects/cortex).