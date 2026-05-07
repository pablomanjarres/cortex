# Cortex

Personal operating system for auditing your days as a founder, student, and human. A desktop-first Electron app with mobile access via Tailscale.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 8 |
| Desktop | Electron 41 |
| Styling | Tailwind CSS v4 (OKLCH palette, OLED black theme) |
| UI Components | shadcn/ui + Lucide icons |
| Charts | Recharts |
| Animations | Framer Motion |
| Routing | React Router v7 (HashRouter) |
| Markdown | react-markdown + turndown (HTML-to-MD on paste) |
| Fonts | Inter, Instrument Serif, Geist Variable |

---

## Project Structure

```
cortex/
├── electron/                    # Electron main process
│   ├── main.ts                  # Window, tray, web server, IPC handlers
│   ├── preload.ts               # Context-isolated IPC bridge
│   ├── calendar.ts              # Swift EventKit integration
│   ├── crypto.ts                # AES-256-GCM encryption
│   ├── keychain.ts              # Secure credential storage
│   ├── integrations/            # External API connectors
│   │   ├── github.ts            # Commits, PRs, streaks
│   │   ├── lemon.ts             # MRR, customers (Lemon Squeezy)
│   │   ├── vercel.ts            # Deployments, analytics
│   │   └── supabase.ts          # Users, signups
│   ├── tsconfig.json            # Electron TypeScript config
│   └── tsconfig.preload.json    # Preload TypeScript config
├── src/
│   ├── App.tsx                  # Root router + lazy routes
│   ├── index.css                # Global styles + Tailwind
│   ├── features/                # Feature pages (one folder per page)
│   │   ├── daily/               # Daily review, targets, sprints
│   │   ├── habits/              # Weekly habit grid with streaks
│   │   ├── stats/               # KPI dashboard
│   │   ├── automations/         # Scheduled tasks + approvals
│   │   ├── founder/             # Startup metrics (GitHub, MRR, deploys)
│   │   ├── gtm/                 # Go-to-market tracking
│   │   ├── student/             # Course assignments + deadlines
│   │   ├── projects/            # ~/Projects scanner
│   │   ├── crm/                 # Contact management + birthdays
│   │   ├── finance/             # Revenue + expenses
│   │   ├── social/              # Social contacts
│   │   ├── books/               # Reading list + notes
│   │   ├── thoughts/            # Idea capture
│   │   ├── captures/            # Media captures with markdown editor
│   │   └── settings/            # API keys, export/import, data stats
│   ├── components/
│   │   ├── layout/              # DashboardLayout, Sidebar, Header
│   │   ├── shared/              # PageShell wrapper
│   │   ├── widgets/             # WidgetCard
│   │   └── ui/                  # shadcn components (button, input, etc.)
│   ├── lib/
│   │   ├── store.ts             # 3-tier persistence (IPC → HTTP → localStorage)
│   │   ├── date-utils.ts        # Date helpers
│   │   ├── utils.ts             # cn() and general utilities
│   │   └── use-daily-habits.ts  # Habit tracking hook
│   └── types/                   # TypeScript interfaces
├── public/                      # Static assets, PWA manifest, service worker
├── build/                       # App icons, entitlements, signing config
├── scripts/                     # Icon generation
├── dist/                        # Built web app (git-ignored)
├── dist-electron/               # Compiled Electron JS (git-ignored)
├── release/                     # Packaged .app (git-ignored)
├── vite.config.ts
├── package.json
├── tsconfig.json
└── eslint.config.js
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **macOS** (Electron features are macOS-specific: calendar, keychain, tray)

### Install Dependencies

```bash
npm install
```

### Development

```bash
# Web only (fast HMR, no Electron features)
npm run dev

# Full Electron + web dev mode
npm run electron:dev
```

- Vite dev server starts on `http://localhost:5173`
- Electron loads from dev server with hot reload
- Changes to `src/` hot-reload instantly
- Changes to `electron/` require restarting `electron:dev`

### Production Build

```bash
# Build web + compile Electron + package app
npm run electron:build
```

Output: `release/mac-arm64/Cortex.app`

### Install to /Applications

```bash
npm run cortex:install
```

This runs the full build, copies to `/Applications/Cortex.app`, clears quarantine, and code-signs.

**Manual install (if the script doesn't exist or fails):**

```bash
npm run electron:build
pkill -9 -f "Cortex.app"          # Kill running instance first!
sleep 2
rm -rf /Applications/Cortex.app
cp -R release/mac-arm64/Cortex.app /Applications/Cortex.app
xattr -cr /Applications/Cortex.app
codesign --force --deep --sign - /Applications/Cortex.app
open /Applications/Cortex.app
```

> **Important:** You MUST kill the running Cortex.app before copying. macOS locks the app bundle while it's running, and `cp -R` will silently fail to overwrite locked files.

---

## Build Pipeline Details

The build is a 3-step pipeline:

1. **`npm run build`** — TypeScript compile + Vite bundle → `dist/`
2. **`npm run electron:compile`** — Compiles `electron/*.ts` → `dist-electron/`
3. **`npx electron-builder`** — Packages everything into `Cortex.app` with asar archive

Each step is independent. If you only changed frontend code, you only need step 1. If you only changed Electron main process code, you need step 2. Step 3 always needs both.

### Verifying Your Changes Made It Into the Build

After building, verify the asar contains your changes:

```bash
# Extract the packaged app's code
npx asar extract release/mac-arm64/Cortex.app/Contents/Resources/app.asar /tmp/cortex-check

# Search for your change (example: search for a string you added)
grep -o "yourSearchTerm" /tmp/cortex-check/dist/assets/index-*.js | wc -l

# Verify Electron changes
grep -o "yourSearchTerm" /tmp/cortex-check/dist-electron/main.js | wc -l
```

### Code Signing

The app uses ad-hoc signing (no Apple Developer certificate):

```bash
codesign --force --deep --sign - /Applications/Cortex.app
```

If the app crashes on launch with "Library not loaded" or "different Team IDs", the signing is broken. Run:

```bash
xattr -cr /Applications/Cortex.app
codesign --force --deep --sign - /Applications/Cortex.app
```

---

## Data Layer

### Three-Tier Persistence

The `useStore<T>(key, fallback)` hook provides persistent state with automatic sync:

```
Priority 1: Electron IPC  →  JSON files in data/ directory (encrypted)
Priority 2: HTTP API      →  Web server at :3456 (for phone/browser)
Priority 3: localStorage  →  Fallback for dev mode
```

### Data Directory

```
~/Library/Application Support/Cortex/
├── data/
│   ├── cortex-habits.json          # Encrypted JSON
│   ├── cortex-daily-2026-04-04.json
│   ├── cortex-captures.json
│   └── ...
├── backups/
│   └── cortex-backup-latest.json.gz
├── media/
│   ├── cap-1234567-0.png           # Capture images (binary)
│   └── ...
└── cortex-keys.enc                 # Encrypted keychain
```

### Encryption

All JSON data files are encrypted at rest using AES-256-GCM:
- Master key stored in macOS Keychain via Electron safeStorage
- Random 12-byte IV per write
- Binary format: `MAGIC(4) + VERSION(2) + IV(12) + TAG(16) + CIPHERTEXT`
- Implementation: `electron/crypto.ts`

### Store Keys (Convention)

- `cortex-{feature}` — Main data for a feature
- `cortex-{feature}-{date}` — Date-partitioned data (daily, habits)
- `cortex-{feature}-state` — UI/tracking state

### Adding a New Store

```tsx
// In your feature component:
const [data, updateData] = useStore<MyType>('cortex-my-feature', defaultValue)

// Read
const items = data.items

// Write (pass updater function)
updateData(prev => ({ ...prev, items: [...prev.items, newItem] }))
```

Writes are automatically debounced (150ms–1000ms based on data size) and batched.

---

## Adding a New Feature Page

### 1. Create the Feature

```bash
mkdir src/features/my-feature
touch src/features/my-feature/MyFeaturePage.tsx
```

```tsx
// src/features/my-feature/MyFeaturePage.tsx
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { useStore } from '@/lib/store'

export function MyFeaturePage() {
  const [data, updateData] = useStore<MyData>('cortex-my-feature', defaultData)

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">My Feature</h1>
          <p className="text-xs text-muted-foreground">Description</p>
        </div>
      </div>

      <WidgetCard title="Widget" description="Info" delay={0.1}>
        {/* Content */}
      </WidgetCard>
    </PageShell>
  )
}
```

### 2. Add the Route

```tsx
// src/App.tsx — add lazy import and route
const MyFeaturePage = lazy(() => import('./features/my-feature/MyFeaturePage').then(m => ({ default: m.MyFeaturePage })))

// Inside <Route element={<DashboardLayout />}>:
<Route path="/my-feature" element={<MyFeaturePage />} />
```

### 3. Add to Sidebar

```tsx
// src/components/layout/Sidebar.tsx — add to the appropriate section
{ to: '/my-feature', icon: SomeIcon, label: 'My Feature' },
```

### 4. Add to Header Title Map

```tsx
// src/components/layout/Header.tsx
const pageTitles: Record<string, string> = {
  // ...
  '/my-feature': 'My Feature',
}
```

---

## Web Server & Mobile Access

### How It Works

Cortex runs an HTTP server on **port 3456** that serves the built React app and exposes data APIs. This enables access from phones and other devices.

### Security

The server restricts access by IP:
- `127.0.0.1` / `::1` — localhost
- `192.168.x.x` / `10.x.x.x` — LAN
- `100.64–127.x.x.x` — Tailscale peer IPs

CORS validates origins against the same patterns plus `*.ts.net` domains.

### Accessing from Phone

1. Install [Tailscale](https://tailscale.com) on both Mac and phone
2. The Cortex tray menu shows the LAN IP and port
3. Open `http://<tailscale-ip>:3456` on your phone
4. Add to home screen for app-like experience

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/data?key=<key>` | GET | Read a store value |
| `/api/data` | POST | Write `{ key, data }` |
| `/api/data/keys` | GET | List all store keys |
| `/api/media?id=<id>` | GET | Load a capture image (base64 JSON) |
| `/api/media` | POST | Save `{ id, base64 }` |
| `/api/media/delete` | POST | Delete `{ id }` |
| `/api/calendar/today` | GET | Today's calendar events |
| `/api/calendar/events?start=<>&end=<>` | GET | Events in date range |
| `/api/calendar/events` | POST | Create event |
| `/api/calendar/events/<id>` | PUT | Update event |
| `/api/calendar/events/<id>` | DELETE | Delete event |
| `/api/integrations/<name>` | GET | GitHub/Lemon/Vercel/Supabase stats |
| `/api/projects/scan` | GET | Scan ~/Projects |
| `/api/automation/run` | POST | Ingest scheduled task output |

---

## Electron IPC API

All IPC calls are exposed via `window.electronAPI` (set up in `preload.ts`). Available in renderer process only.

### Calendar

```ts
window.electronAPI.calendar.getTodayEvents()
window.electronAPI.calendar.getEventsInRange(startISO, endISO)
window.electronAPI.calendar.createEvent(payload)
window.electronAPI.calendar.updateEvent(id, payload)
window.electronAPI.calendar.deleteEvent(id)
```

### Data

```ts
window.electronAPI.data.read(key)        // Returns parsed JSON or null
window.electronAPI.data.write(key, data)  // Encrypts and saves
window.electronAPI.data.listKeys()        // All store keys
window.electronAPI.data.exportAll()       // Full backup
window.electronAPI.data.importAll(data)   // Restore from backup
window.electronAPI.data.getPath()         // Data directory path
window.electronAPI.data.getStats()        // Storage usage stats
```

### Keychain

```ts
window.electronAPI.keychain.save(service, value)
window.electronAPI.keychain.get(service)
window.electronAPI.keychain.delete(service)
window.electronAPI.keychain.has(service)
window.electronAPI.keychain.list()
```

Service names: `github-token`, `vercel-token`, `supabase-url`, `supabase-service-key`, `lemon-api-key`, `lemon-store-id`, `calendar-email`

### Media

```ts
window.electronAPI.media.save(id, base64)   // Save image to disk
window.electronAPI.media.load(id)           // Returns data URI or null
window.electronAPI.media.delete(id)         // Remove image file
```

### Integrations

```ts
window.electronAPI.integrations.github()    // { commits, prs, streak, ... }
window.electronAPI.integrations.lemon()     // { mrr, customers, ... }
window.electronAPI.integrations.vercel()    // { deployments, ... }
window.electronAPI.integrations.supabase()  // { users, signups, ... }
```

### Other

```ts
window.electronAPI.projects.scan()          // Scan ~/Projects
window.electronAPI.tray.updateStats(stats)  // Update tray menu
window.electronAPI.onNavigate(callback)     // Tray menu navigation
```

---

## Integrations Setup

Configure API keys in **Settings** page or via the keychain API.

### GitHub

- Go to GitHub > Settings > Developer Settings > Personal Access Tokens
- Create token with `repo` scope
- Paste in Settings page
- Provides: commits today/week, PRs, streak, repo count

### Lemon Squeezy

- Go to Lemon Squeezy dashboard > Settings > API Keys
- Copy API key and Store ID
- Provides: MRR, total customers, new/churned this month

### Vercel

- Go to Vercel > Settings > Tokens
- Create token with full access
- Provides: deployments today/week, latest deployment info

### Supabase

- Go to Supabase project > Settings > API
- Copy Project URL and **Service Role Key** (not anon key)
- Provides: total users, signups today/week

---

## Styling Guide

### Theme

The app uses an OLED-optimized dark theme with OKLCH colors defined in `src/index.css`:

- Background: pure black (`oklch(0 0 0)`)
- Cards: `liquid-glass` class for glassmorphism effect
- Borders: subtle `border-border` for separation

### Key CSS Classes

```
liquid-glass          — Glassmorphism card style
bg-background         — Pure black background
text-foreground       — Primary text color
text-muted-foreground — Secondary/dimmed text
border-border         — Subtle border
bg-input              — Input field background
bg-secondary          — Card/section background
```

### Component Patterns

```tsx
// Standard widget
<WidgetCard title="Title" description="Subtitle" delay={0.1}>
  {/* Content */}
</WidgetCard>

// Page wrapper (handles padding + spacing)
<PageShell>
  {/* Page content */}
</PageShell>

// Source-colored badge
<span className={`text-[9px] px-2 py-0.5 rounded-full ${sourceColor[source]}`}>
  {label}
</span>
```

### Responsive Breakpoints

- Mobile: default (< 768px)
- Desktop: `md:` prefix (>= 768px)
- Sidebar hidden on mobile, hamburger menu shows `MobileSidebar` overlay
- iPhone safe areas: use `env(safe-area-inset-top)` for headers/overlays

### macOS Traffic Lights

Fullscreen overlays/modals must account for the traffic light buttons:

```tsx
// Add left padding on desktop to avoid traffic lights
className="px-4 md:pl-20"

// Make buttons clickable over the drag region
className="[-webkit-app-region:no-drag]"
```

---

## Common Tasks

### Modifying Electron Main Process

1. Edit files in `electron/`
2. Run `npm run electron:compile` to recompile
3. Rebuild app: `npx electron-builder`
4. Kill + replace + sign (see Install section)

### Adding a New IPC Channel

1. Add handler in `electron/main.ts`:
   ```ts
   ipcMain.handle('my-channel', async (_event, arg) => { ... })
   ```

2. Expose in `electron/preload.ts`:
   ```ts
   myFeature: {
     doThing: (arg: string) => ipcRenderer.invoke('my-channel', arg),
   }
   ```

3. Add TypeScript types in `src/types/electron.d.ts`

4. Use in renderer:
   ```ts
   const result = await window.electronAPI.myFeature.doThing('hello')
   ```

### Adding a New HTTP API Endpoint

Add the route handler in `electron/main.ts` inside `startWebServer()`, **before** the CORS preflight handler and static file serving:

```ts
if (url.pathname === '/api/my-endpoint' && req.method === 'GET') {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
  res.end(JSON.stringify({ data: 'hello' }))
  return
}
```

### Adding a New Integration

1. Create `electron/integrations/my-service.ts`:
   ```ts
   export async function fetchMyServiceStats(apiKey: string) {
     // Fetch from API, return structured data
   }
   ```

2. Import and wire up in `electron/main.ts` (IPC handler + HTTP endpoint)

3. Add keychain service name for the API key

4. Add UI in Settings page for credential input

5. Add display widget in the relevant feature page

---

## Troubleshooting

### App crashes on launch after rebuild

**Cause:** Code signature mismatch (different Team IDs in Electron framework).

```bash
xattr -cr /Applications/Cortex.app
codesign --force --deep --sign - /Applications/Cortex.app
```

### Changes not appearing after rebuild

**Cause:** `cp -R` silently fails when the app is running (macOS locks the bundle).

```bash
pkill -9 -f "Cortex.app"    # Kill first!
sleep 2                       # Wait for process to die
rm -rf /Applications/Cortex.app
cp -R release/mac-arm64/Cortex.app /Applications/Cortex.app
```

### Port 3456 already in use

**Cause:** Previous Cortex instance still running.

```bash
lsof -ti:3456 | xargs kill -9
```

### Two Cortex icons in dock

**Cause:** Running both `/Applications/Cortex.app` (bundled) and `npx electron .` (dev).

Kill the dev instance — it has no app icon. The bundled one has the C logo.

### Phone can't see images uploaded from PC

**Cause:** Images are stored as binary files on disk. The phone must access them via the HTTP API (`/api/media`), not localStorage.

Make sure media save/load functions use `fetch('/api/media')` when not in Electron context.

### iPhone status bar overlaps with app nav

**Cause:** Missing safe area insets. Add to headers/overlays:

```tsx
className="pt-[env(safe-area-inset-top)]"
// or
style={{ paddingTop: 'env(safe-area-inset-top)' }}
```

The `index.html` must have `viewport-fit=cover` in the viewport meta tag (already set).

---

## Environment

- **macOS** 26.4+ (Apple Silicon)
- **Node.js** 18+
- **Electron** 41
- **Tailscale** for remote access (optional but recommended)
