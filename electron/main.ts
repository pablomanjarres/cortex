import { app, BrowserWindow, dialog, ipcMain, Tray, Menu, nativeImage, shell, clipboard, globalShortcut, Notification } from 'electron'
import path from 'path'
import http from 'http'
import os from 'os'
import fs from 'fs'
import zlib from 'zlib'
import { fileURLToPath } from 'url'
import { getTodayEvents, syncBirthdays, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, getEventsInRange, getCalendarEvent } from './calendar.js'
import type { BirthdayEntry, CreateEventPayload } from './calendar.js'
import { saveKey, getKey, deleteKey, hasKey, listKeys } from './keychain.js'
import { initEncryption, encrypt, encryptAndWrite, encryptAndWriteAsync, readAndDecrypt, readAndDecryptAsync, migrateToEncrypted, isEncryptionEnabled } from './crypto.js'
import { startFounderRefresher, getStatsForEndpoint } from './founder-refresher.js'
import type { FounderSource } from './founder-refresher.js'
import { readJournalDay, readJournalToday, writeJournalLine, searchVault, readVoiceAnchors, vaultStats } from './integrations/mars.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Local YYYY-MM-DD (avoids UTC shift from toISOString) */
function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let webServer: http.Server | null = null
let currentStats = { tasks: '0/0', habits: '0/0', score: '—' }

// Web server port — overridable via CORTEX_PORT (int, default 3456).
const WEB_PORT = (() => {
  const raw = process.env.CORTEX_PORT
  const p = raw ? parseInt(raw, 10) : NaN
  if (raw && (!Number.isInteger(p) || p <= 0 || p > 65535)) {
    console.warn(`[Cortex] Ignoring invalid CORTEX_PORT="${raw}" — using 3456`)
    return 3456
  }
  return Number.isInteger(p) && p > 0 && p <= 65535 ? p : 3456
})()

// ─── Store key / media id sanitization ────────────────────
// Keys become file names inside dataDir/mediaDir — enforce a strict charset
// at every boundary (HTTP + IPC) so no key can traverse out of the data dir.
const KEY_RE = /^[A-Za-z0-9._-]{1,200}$/
const MAX_BODY_BYTES = 25 * 1024 * 1024 // HTTP JSON body cap (~25MB)
const VERSIONED_BACKUPS_KEPT = 10
const DAILY_FILE_RETENTION_DAYS = 90 // StatsPage reads 90 days back

// ─── Tray live data (events, sprint, habits) ─────────────
let cachedEvents: { title: string; startTime: string; endTime: string; isAllDay: boolean }[] = []
let cachedHabits: { id: string; name: string; emoji: string }[] = []
let cachedHabitHistory: Record<string, boolean> = {}
let traySprintEndMs: number | null = null
let traySprintTask: string | null = null
let traySprintInterval: ReturnType<typeof setInterval> | null = null
let trayRefreshTimer: ReturnType<typeof setInterval> | null = null

// ─── Live system stats (from Glances on the Mac mini) ───
interface HostStats {
  cpu: number; mem: number; memUsed: number; memTotal: number
  swap: number; load1: number; cores: number; uptime: string
  rootFsPct?: number; rootFsUsed?: number; rootFsSize?: number
  rxBps?: number; txBps?: number
}
let cachedMacStats: HostStats | null = null
let macStatsError: string | null = null
let traySystemTimer: ReturnType<typeof setInterval> | null = null

// ─── System history (rolling 24h ring buffer per host) ───
type SystemHostKey = 'mac'
interface SystemHistorySample {
  t: number       // epoch ms
  cpu: number     // % 0–100
  mem: number     // % 0–100
  memUsed: number // bytes
  memTotal: number
  swap: number    // % 0–100
  load1: number
  cores: number
  rxBps?: number
  txBps?: number
}

// 7d at one sample per 5s → 120,960 entries (~12 MB per host as JSON).
// Keep raw, downsample on read.
const SYSTEM_HISTORY_MAX = 120_960
const SYSTEM_HISTORY_RETAIN_MS = 7 * 24 * 3600 * 1000
const systemHistory: Record<SystemHostKey, SystemHistorySample[]> = { mac: [] }
let systemHistoryDirty = false
let systemHistoryPersistTimer: ReturnType<typeof setInterval> | null = null

const isDev = !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function showAndNavigate(route: string) {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('navigate', route)
  } else {
    createWindow()
  }
}

// ─── Tray data helpers ────────────────────────────────────

async function refreshTrayData() {
  try { cachedEvents = await getTodayEvents() } catch { cachedEvents = [] }
  try {
    cachedHabits = await readDataKeyParsed<{ id: string; name: string; emoji: string }[]>('cortex-habits', [])
  } catch { cachedHabits = [] }
  try {
    const today = localDate()
    const history = await readDataKeyParsed<Record<string, Record<string, boolean>>>('cortex-habits-history', {})
    cachedHabitHistory = history[today] || {}
  } catch { cachedHabitHistory = {} }
  if (tray) tray.setContextMenu(buildTrayMenu())
}

// ─── System stats refresh (Mac mini via Glances) ──────────
// Pulls from local Glances on 127.0.0.1:61208 every 5s.
// Updates tray title + menu.

async function fetchHostStats(host: string): Promise<HostStats> {
  const opts = { signal: AbortSignal.timeout(3000) }
  const base = `http://${host}:61208/api/4`
  const [cpuR, memR, loadR, upR, fsR, swR, netR] = await Promise.all([
    fetch(`${base}/cpu`, opts),
    fetch(`${base}/mem`, opts),
    fetch(`${base}/load`, opts),
    fetch(`${base}/uptime`, opts),
    fetch(`${base}/fs`, opts),
    fetch(`${base}/memswap`, opts).catch(() => null),
    fetch(`${base}/network`, opts).catch(() => null),
  ])
  if (!cpuR.ok || !memR.ok || !loadR.ok) {
    throw new Error(`glances ${cpuR.status}/${memR.status}/${loadR.status}`)
  }
  const cpu = await cpuR.json() as { total: number }
  const mem = await memR.json() as { percent: number; used: number; total: number }
  const load = await loadR.json() as { min1: number; cpucore: number }
  const upRaw = upR.ok ? await upR.json() : ''
  const uptime = typeof upRaw === 'string' ? upRaw : (upRaw?.seconds != null ? `${Math.floor(upRaw.seconds / 86400)}d` : '')
  let swap = 0
  if (swR && swR.ok) {
    try { const s = await swR.json(); swap = s?.percent ?? 0 } catch { /* ignore */ }
  }
  const fsList = fsR.ok ? (await fsR.json()) as Array<{ mnt_point: string; percent: number; used: number; size: number }> : []
  const root = fsList.find((f) => f.mnt_point === '/')
  let rxBps: number | undefined
  let txBps: number | undefined
  if (netR && netR.ok) {
    try {
      const nets = await netR.json() as Array<{ interface_name: string; bytes_recv_rate_per_sec?: number; bytes_sent_rate_per_sec?: number }>
      let rx = 0, tx = 0
      for (const n of nets) {
        const name = n.interface_name || ''
        if (name.startsWith('lo') || name.startsWith('utun') || name.startsWith('llw') ||
            name.startsWith('awdl') || name.startsWith('anpi') || name.startsWith('veth') ||
            name.startsWith('docker') || name.startsWith('br-')) continue
        rx += n.bytes_recv_rate_per_sec ?? 0
        tx += n.bytes_sent_rate_per_sec ?? 0
      }
      rxBps = rx
      txBps = tx
    } catch { /* ignore */ }
  }
  return {
    cpu: cpu.total ?? 0,
    mem: mem.percent ?? 0,
    memUsed: mem.used ?? 0,
    memTotal: mem.total ?? 0,
    swap,
    load1: load.min1 ?? 0,
    cores: load.cpucore ?? 1,
    uptime,
    rootFsPct: root?.percent,
    rootFsUsed: root?.used,
    rootFsSize: root?.size,
    rxBps,
    txBps,
  }
}

function pushHistorySample(host: SystemHostKey, s: HostStats) {
  const sample: SystemHistorySample = {
    t: Date.now(),
    cpu: s.cpu,
    mem: s.mem,
    memUsed: s.memUsed,
    memTotal: s.memTotal,
    swap: s.swap,
    load1: s.load1,
    cores: s.cores,
    rxBps: s.rxBps,
    txBps: s.txBps,
  }
  const ring = systemHistory[host]
  ring.push(sample)
  if (ring.length > SYSTEM_HISTORY_MAX) ring.splice(0, ring.length - SYSTEM_HISTORY_MAX)
  systemHistoryDirty = true
}

function getSystemHistoryDir(): string {
  // Lives in non-iCloud app data — high-frequency churn shouldn't sync.
  return isDev
    ? path.join(__dirname, '..', 'data', 'system-history')
    : path.join(app.getPath('userData'), 'system-history')
}

function loadSystemHistory() {
  try {
    const dir = getSystemHistoryDir()
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); return }
    const cutoff = Date.now() - SYSTEM_HISTORY_RETAIN_MS
    for (const host of ['mac'] as SystemHostKey[]) {
      const file = path.join(dir, `${host}.json`)
      if (!fs.existsSync(file)) continue
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as SystemHistorySample[]
        if (Array.isArray(raw)) {
          systemHistory[host] = raw.filter((s) => s && typeof s.t === 'number' && s.t > cutoff)
        }
      } catch (e) {
        console.warn(`[Cortex] system-history: failed to load ${host}:`, (e as Error).message)
      }
    }
  } catch (e) {
    console.warn('[Cortex] system-history: load failed:', (e as Error).message)
  }
}

function persistSystemHistory() {
  if (!systemHistoryDirty) return
  systemHistoryDirty = false
  try {
    const dir = getSystemHistoryDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    for (const host of ['mac'] as SystemHostKey[]) {
      const file = path.join(dir, `${host}.json`)
      const tmp = `${file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(systemHistory[host]))
      fs.renameSync(tmp, file)
    }
  } catch (e) {
    console.warn('[Cortex] system-history: persist failed:', (e as Error).message)
  }
}

interface HistoryBucket {
  t: number
  cpu: number; cpuMax: number
  mem: number; memMax: number
  load1: number; load1Max: number
  rxBps: number
  txBps: number
}

function buildHistoryResponse(host: SystemHostKey, windowMs: number) {
  const ring = systemHistory[host]
  const cutoff = Date.now() - windowMs
  const samples = ring.filter((s) => s.t >= cutoff)

  if (samples.length === 0) {
    return {
      host, windowMs, count: 0, samples: [] as HistoryBucket[],
      stats: {
        cpu: { avg: 0, min: 0, max: 0 },
        mem: { avg: 0, min: 0, max: 0 },
        load1: { avg: 0, min: 0, max: 0 },
        swap: { avg: 0, min: 0, max: 0 },
      },
      latest: ring[ring.length - 1] ?? null,
    }
  }

  // Bucket size: aim for ~80 points across the window (good for charts).
  const bucketMs = Math.max(5000, Math.floor(windowMs / 80))
  const buckets: HistoryBucket[] = []
  let current: { t: number; cpu: number[]; mem: number[]; load1: number[]; rx: number[]; tx: number[] } | null = null
  for (const s of samples) {
    const bucketStart = Math.floor(s.t / bucketMs) * bucketMs
    if (!current || current.t !== bucketStart) {
      if (current) {
        buckets.push({
          t: current.t,
          cpu: avg(current.cpu), cpuMax: Math.max(...current.cpu),
          mem: avg(current.mem), memMax: Math.max(...current.mem),
          load1: avg(current.load1), load1Max: Math.max(...current.load1),
          rxBps: avg(current.rx),
          txBps: avg(current.tx),
        })
      }
      current = { t: bucketStart, cpu: [], mem: [], load1: [], rx: [], tx: [] }
    }
    current.cpu.push(s.cpu)
    current.mem.push(s.mem)
    current.load1.push(s.load1)
    if (s.rxBps != null) current.rx.push(s.rxBps)
    if (s.txBps != null) current.tx.push(s.txBps)
  }
  if (current) {
    buckets.push({
      t: current.t,
      cpu: avg(current.cpu), cpuMax: Math.max(...current.cpu),
      mem: avg(current.mem), memMax: Math.max(...current.mem),
      load1: avg(current.load1), load1Max: Math.max(...current.load1),
      rxBps: avg(current.rx),
      txBps: avg(current.tx),
    })
  }

  const cpuVals = samples.map((s) => s.cpu)
  const memVals = samples.map((s) => s.mem)
  const loadVals = samples.map((s) => s.load1)
  const swapVals = samples.map((s) => s.swap)

  return {
    host,
    windowMs,
    count: samples.length,
    bucketMs,
    samples: buckets,
    stats: {
      cpu: { avg: avg(cpuVals), min: Math.min(...cpuVals), max: Math.max(...cpuVals) },
      mem: { avg: avg(memVals), min: Math.min(...memVals), max: Math.max(...memVals) },
      load1: { avg: avg(loadVals), min: Math.min(...loadVals), max: Math.max(...loadVals) },
      swap: { avg: avg(swapVals), min: Math.min(...swapVals), max: Math.max(...swapVals) },
    },
    latest: samples[samples.length - 1],
  }
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0
  let sum = 0
  for (const v of arr) sum += v
  return sum / arr.length
}

async function refreshSystemStats() {
  try {
    const stats = await fetchHostStats('127.0.0.1')
    cachedMacStats = stats
    macStatsError = null
    pushHistorySample('mac', stats)
  } catch (e) {
    macStatsError = (e as Error)?.message ?? 'fetch failed'
  }
  updateTraySystemTitle()
  if (tray) tray.setContextMenu(buildTrayMenu())
}

function updateTraySystemTitle() {
  if (!tray) return
  // Sprint timer takes priority.
  if (traySprintEndMs && traySprintEndMs > Date.now()) return
  const parts: string[] = []
  if (cachedMacStats) parts.push(`Mac ${Math.round(cachedMacStats.cpu)}·${Math.round(cachedMacStats.mem)}`)
  tray.setTitle(parts.join('  '))
}

// ─── Tray sprint title (synced from renderer) ───────────

function updateTraySprintTitle() {
  if (!traySprintEndMs) return
  const remaining = Math.max(0, Math.round((traySprintEndMs - Date.now()) / 1000))
  if (remaining <= 0) {
    clearTraySprintState()
    new Notification({ title: 'Cortex', body: 'Sprint complete!' }).show()
    return
  }
  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  tray?.setTitle(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
}

function startTraySprintSync(endTimeMs: number, task: string) {
  traySprintEndMs = endTimeMs
  traySprintTask = task
  if (traySprintInterval) clearInterval(traySprintInterval)
  updateTraySprintTitle()
  traySprintInterval = setInterval(updateTraySprintTitle, 1000)
  tray?.setToolTip(`Cortex — Sprint: ${task}`)
  if (tray) tray.setContextMenu(buildTrayMenu())
}

function clearTraySprintState() {
  traySprintEndMs = null
  traySprintTask = null
  if (traySprintInterval) { clearInterval(traySprintInterval); traySprintInterval = null }
  tray?.setTitle('')
  tray?.setToolTip('Cortex')
  // Restore system stats title if we have data.
  updateTraySystemTitle()
  if (tray) tray.setContextMenu(buildTrayMenu())
}

// Tray habit toggle goes through the shared write path (source 'main') so the
// renderer gets a data:changed push instead of silently racing this write.
async function toggleHabitFromTray(habitId: string) {
  try {
    const today = localDate()
    const history = await readDataKeyParsed<Record<string, Record<string, boolean>>>('cortex-habits-history', {})
    if (!history[today]) history[today] = {}
    history[today][habitId] = !history[today][habitId]
    await writeDataKey('cortex-habits-history', history, { source: 'main' })
    cachedHabitHistory = history[today]
    if (tray) tray.setContextMenu(buildTrayMenu())
  } catch (e) {
    console.error('[Cortex] tray habit toggle failed:', e)
  }
}

function fmtBytesShort(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1)
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`
}

function buildHostStatsItems(label: string, s: HostStats | null, err: string | null): Electron.MenuItemConstructorOptions[] {
  const items: Electron.MenuItemConstructorOptions[] = [{ label, enabled: false }]
  if (!s) {
    items.push({ label: err ? `· offline: ${err}` : '· connecting…', enabled: false })
    return items
  }
  const loadPct = s.cores > 0 ? (s.load1 / s.cores) * 100 : 0
  items.push(
    { label: `· CPU  ${s.cpu.toFixed(1)}%  (${s.cores} cores)`, enabled: false },
    { label: `· RAM  ${s.mem.toFixed(1)}%  ${fmtBytesShort(s.memUsed)} / ${fmtBytesShort(s.memTotal)}`, enabled: false },
    { label: `· Load ${s.load1.toFixed(2)}  (${loadPct.toFixed(0)}% of ${s.cores}c)`, enabled: false },
  )
  if (s.swap > 0) items.push({ label: `· Swap ${s.swap.toFixed(1)}%`, enabled: false })
  if (s.rootFsPct != null && s.rootFsSize != null && s.rootFsUsed != null) {
    items.push({ label: `· Disk /  ${s.rootFsPct.toFixed(1)}%  ${fmtBytesShort(s.rootFsUsed)} / ${fmtBytesShort(s.rootFsSize)}`, enabled: false })
  }
  if (s.uptime) items.push({ label: `· Uptime ${s.uptime}`, enabled: false })
  return items
}

function buildMacStatsMenuItems(): Electron.MenuItemConstructorOptions[] {
  return [
    ...buildHostStatsItems('Mac mini', cachedMacStats, macStatsError),
    { label: 'Open System page', click: () => showAndNavigate('/system') },
  ]
}

function buildTrayMenu() {
  // Sprint section (synced from renderer)
  const sprintItems: Electron.MenuItemConstructorOptions[] = []
  if (traySprintEndMs && traySprintEndMs > Date.now()) {
    const remaining = Math.max(0, Math.ceil((traySprintEndMs - Date.now()) / 60000))
    sprintItems.push(
      { label: `⏱ Sprint: ${remaining}m left${traySprintTask ? ` — ${traySprintTask}` : ''}`, enabled: false },
      { label: 'Stop Sprint', click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('sprint:action', 'stop')
        }
        clearTraySprintState()
      }},
    )
  } else {
    sprintItems.push(
      { label: '⏱ Start Sprint (60m)', click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('sprint:action', 'start', { duration: 60 })
          mainWindow.show()
          mainWindow.focus()
        } else {
          createWindow()
        }
      }},
    )
  }

  // Events section
  const eventItems: Electron.MenuItemConstructorOptions[] = []
  if (cachedEvents.length > 0) {
    for (const ev of cachedEvents.slice(0, 8)) {
      const time = ev.isAllDay ? 'All day' : ev.startTime
      eventItems.push({ label: `${time} — ${ev.title}`, enabled: false })
    }
  } else {
    eventItems.push({ label: 'No events today', enabled: false })
  }

  // Habits section
  const habitItems: Electron.MenuItemConstructorOptions[] = []
  if (cachedHabits.length > 0) {
    for (const h of cachedHabits) {
      const done = cachedHabitHistory[h.id] ?? false
      habitItems.push({
        label: `${done ? '✅' : '☐'} ${h.emoji} ${h.name}`,
        click: () => toggleHabitFromTray(h.id),
      })
    }
  } else {
    habitItems.push({ label: 'No habits configured', enabled: false })
  }

  return Menu.buildFromTemplate([
    {
      label: 'Open Cortex',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus() } else { createWindow() }
      },
    },
    { type: 'separator' },
    { label: `Tasks: ${currentStats.tasks}`, enabled: false },
    { label: `Habits: ${currentStats.habits}`, enabled: false },
    { label: `Score: ${currentStats.score}`, enabled: false },
    { type: 'separator' },
    ...buildMacStatsMenuItems(),
    { type: 'separator' },
    ...sprintItems,
    { type: 'separator' },
    { label: 'Today', enabled: false },
    ...eventItems,
    { type: 'separator' },
    { label: 'Habits', submenu: habitItems },
    { type: 'separator' },
    {
      label: 'Core',
      submenu: [
        { label: 'Daily Overview', click: () => showAndNavigate('/daily') },
        { label: 'Habits', click: () => showAndNavigate('/habits') },
        { label: 'Stats', click: () => showAndNavigate('/stats') },
        { label: 'Automations', click: () => showAndNavigate('/automations') },
      ],
    },
    {
      label: 'Roles',
      submenu: [
        { label: 'Founder', click: () => showAndNavigate('/founder') },
        { label: 'Student', click: () => showAndNavigate('/student') },
        { label: 'Projects', click: () => showAndNavigate('/projects') },
        { label: 'CRM', click: () => showAndNavigate('/crm') },
      ],
    },
    {
      label: 'Life',
      submenu: [
        { label: 'Finance', click: () => showAndNavigate('/finance') },
        { label: 'Social', click: () => showAndNavigate('/social') },
        { label: 'Books', click: () => showAndNavigate('/books') },
        { label: 'Thoughts', click: () => showAndNavigate('/thoughts') },
      ],
    },
    { label: 'Settings', click: () => showAndNavigate('/settings') },
    { type: 'separator' },
    ...(webServer ? [
      { label: `localhost:${WEB_PORT}`, click: () => shell.openExternal(`http://localhost:${WEB_PORT}`) },
      // Only advertise the Tailscale URL when a 100.x address exists — the
      // socket gate rejects plain LAN clients, so a LAN URL would never work.
      ...((): Electron.MenuItemConstructorOptions[] => {
        const ts = getTailscaleIP()
        if (!ts) return []
        const tsUrl = `http://${ts}:${WEB_PORT}`
        return [{ label: `${ts}:${WEB_PORT} (Tailscale)`, click: () => { clipboard.writeText(tsUrl); shell.openExternal(tsUrl) } }]
      })(),
    ] : [
      {
        label: 'Open in Browser',
        click: () => {
          startWebServer()
          if (tray) tray.setContextMenu(buildTrayMenu())
          shell.openExternal(`http://localhost:${WEB_PORT}`)
        },
      },
    ]),
    {
      label: 'Quit Cortex',
      accelerator: 'CommandOrControl+Q',
      click: () => { stopWebServer(); app.quit() },
    },
  ])
}

function createTray() {
  const iconPath = isDev
    ? path.join(__dirname, '../build/trayTemplate.png')
    : path.join(process.resourcesPath, 'build/trayTemplate.png')
  const icon = nativeImage.createFromPath(iconPath)
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('Cortex')
  tray.setContextMenu(buildTrayMenu())
  // Refresh tray data (events, habits) on startup + every 5 minutes
  refreshTrayData()
  trayRefreshTimer = setInterval(refreshTrayData, 5 * 60 * 1000)
  // Live system stats: pull from local Glances + VM Glances every 5s
  loadSystemHistory()
  refreshSystemStats()
  traySystemTimer = setInterval(refreshSystemStats, 5000)
  // Flush ring buffers to disk every minute (only if dirty).
  if (systemHistoryPersistTimer) clearInterval(systemHistoryPersistTimer)
  systemHistoryPersistTimer = setInterval(persistSystemHistory, 60_000)
}

// ─── Web server ────────────────────────────────────────────

// The web server's socket gate only accepts localhost + Tailscale (100.64/10),
// so the tray must only advertise URLs that gate actually accepts. Plain LAN
// IPs are deliberately NOT advertised.
function getTailscaleIP(): string | null {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue
      const parts = iface.address.split('.')
      const first = parseInt(parts[0], 10)
      const second = parseInt(parts[1], 10)
      if (first === 100 && second >= 64 && second <= 127) return iface.address
    }
  }
  return null
}

const mimeTypes: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

function getAllowedOrigin(req: http.IncomingMessage): string {
  const origin = req.headers.origin || ''
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin
  if (/^https?:\/\/(192\.168\.|10\.|100\.)/.test(origin)) return origin
  if (/^https?:\/\/[a-z0-9-]+\.ts\.net(:\d+)?$/i.test(origin)) return origin
  return ''
}

function isTailscaleOrLocal(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, '')
  if (clean === '127.0.0.1' || clean === '::1') return true
  const parts = clean.split('.')
  if (parts.length !== 4) return false
  const first = parseInt(parts[0], 10)
  const second = parseInt(parts[1], 10)
  return first === 100 && second >= 64 && second <= 127
}

/**
 * Accumulate a request body with a size cap. On overflow it answers 413 and
 * resolves null (the caller must just `return`). Also resolves null on stream error.
 */
function readBody(req: http.IncomingMessage, res: http.ServerResponse): Promise<string | null> {
  return new Promise((resolve) => {
    let body = ''
    let size = 0
    let done = false
    req.on('data', (chunk: Buffer) => {
      if (done) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        done = true
        try {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'payload too large' }))
        } catch { /* headers may already be gone */ }
        req.destroy()
        resolve(null)
        return
      }
      body += chunk.toString()
    })
    req.on('end', () => { if (!done) { done = true; resolve(body) } })
    req.on('error', () => { if (!done) { done = true; resolve(null) } })
  })
}

// ─── Claude scheduled-tasks discovery ─────────────────────────────
// Live source of truth for Claude-type automation cards: read SKILL.md
// frontmatter (name + description) from ~/.claude/scheduled-tasks/. New
// tasks appear automatically; removed ones disappear. Dot-dirs (.trash)
// are skipped, so trashed tasks stay gone.
function readScheduledTasks(): { name: string; description: string }[] {
  try {
    const dir = path.join(os.homedir(), '.claude', 'scheduled-tasks')
    if (!fs.existsSync(dir)) return []
    const out: { name: string; description: string }[] = []
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('.')) continue
      const skill = path.join(dir, entry, 'SKILL.md')
      if (!fs.existsSync(skill)) continue
      let name = entry
      let description = ''
      try {
        const fm = fs.readFileSync(skill, 'utf8').match(/^---\s*\n([\s\S]*?)\n---/)
        if (fm) {
          const nameM = fm[1].match(/^name:\s*(.+)$/m)
          const descM = fm[1].match(/^description:\s*(.+)$/m)
          if (nameM) name = nameM[1].trim()
          if (descM) description = descM[1].trim()
        }
      } catch { /* use folder name */ }
      out.push({ name, description })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  } catch { return [] }
}

function startWebServer() {
  if (webServer) return
  const distPath = path.join(__dirname, '../dist')
  webServer = http.createServer(async (req, res) => {
    const remote = req.socket.remoteAddress ?? ''
    if (!isTailscaleOrLocal(remote)) {
      res.writeHead(403); res.end('Forbidden'); return
    }
    const url = new URL(req.url!, `http://localhost:${WEB_PORT}`)

    // ─── JSON API for data sync (used by browser/iPhone) ──────
    if (url.pathname === '/api/data' && req.method === 'GET') {
      const key = url.searchParams.get('key')
      if (!key || !KEY_RE.test(key)) { res.writeHead(400); res.end('Invalid key'); return }
      try {
        const { text, rev } = await readDataFile(key)
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': getAllowedOrigin(req),
          'Access-Control-Expose-Headers': 'X-Cortex-Rev',
        }
        if (rev !== null) headers['X-Cortex-Rev'] = rev
        res.writeHead(200, headers)
        res.end(text ?? 'null')
      } catch { res.writeHead(500); res.end('Read error') }
      return
    }

    // Batch read for the renderer's shared poller:
    // GET /api/data/batch?keys=a,b,c → { values: {key: data|null}, revs: {key: rev|null} }
    if (url.pathname === '/api/data/batch' && req.method === 'GET') {
      const keys = (url.searchParams.get('keys') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      if (keys.length === 0 || keys.length > 200 || keys.some((k) => !KEY_RE.test(k))) {
        res.writeHead(400); res.end('Invalid keys'); return
      }
      try {
        const values: Record<string, unknown> = {}
        const revs: Record<string, string | null> = {}
        for (const key of keys) {
          const { text, rev } = await readDataFile(key)
          revs[key] = rev
          if (text === null) { values[key] = null; continue }
          try { values[key] = JSON.parse(text) } catch { values[key] = null }
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
        res.end(JSON.stringify({ values, revs }))
      } catch { res.writeHead(500); res.end('Read error') }
      return
    }

    if (url.pathname === '/api/data' && req.method === 'POST') {
      const body = await readBody(req, res)
      if (body === null) return
      try {
        const { key, data, baseRev } = JSON.parse(body)
        if (typeof key !== 'string' || !KEY_RE.test(key)) { res.writeHead(400); res.end('Invalid key'); return }
        const result = await writeDataKey(key, data, { baseRev: baseRev ?? null, source: 'http' })
        const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) }
        if (result.ok) {
          res.writeHead(200, headers)
          res.end(JSON.stringify({ ok: true, rev: result.rev }))
        } else if (result.conflict) {
          res.writeHead(409, headers)
          res.end(JSON.stringify({ error: 'conflict', rev: result.rev, data: result.data }))
        } else {
          res.writeHead(result.error === 'invalid key' ? 400 : 500, headers)
          res.end(JSON.stringify({ error: result.error }))
        }
      } catch { res.writeHead(500); res.end('Write error') }
      return
    }

    if (url.pathname === '/api/data/keys' && req.method === 'GET') {
      try {
        const keys = fs.readdirSync(dataDir)
          .filter(f => f.endsWith('.json') && !f.includes('.bak') && !f.includes('.tmp'))
          .map(f => f.replace('.json', ''))
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
        res.end(JSON.stringify(keys))
      } catch { res.writeHead(500); res.end('[]') }
      return
    }

    // ─── Automation API (scheduled task output ingestion) ────
    if (url.pathname === '/api/automation/run' && req.method === 'POST') {
      const body = await readBody(req, res)
      if (body === null) return
      try {
        const { taskName, status, summary, fullOutput } = JSON.parse(body)
        if (!taskName) { res.writeHead(400); res.end('Missing taskName'); return }
        const data = await readDataKeyParsed<{ runs: any[] }>('cortex-automations', { runs: [] })
        if (!Array.isArray(data.runs)) data.runs = []
        const run = {
          id: `run-${Date.now()}`,
          taskName,
          timestamp: new Date().toISOString(),
          status: status || 'success',
          summary: summary || '',
          fullOutput: fullOutput || '',
        }
        data.runs.unshift(run)
        data.runs = data.runs.slice(0, 100) // keep last 100
        await writeDataKey('cortex-automations', data, { source: 'http' })

        // Send Pushover notification for all runs
        try {
          const { execFile: ef } = require('child_process')
          const notifyScript = path.join(os.homedir(), 'Projects', 'pushover', 'bin', 'notify.sh')
          if (fs.existsSync(notifyScript)) {
            const category = status === 'pending-approval' ? 'local-approval'
              : status === 'error' ? 'scheduled-alert'
              : 'scheduled-task'
            ef(notifyScript, [
              '-c', category,
              '-m', `${taskName}: ${summary || (status === 'pending-approval' ? 'Needs your approval' : 'Completed')}`,
              // Only advertise URLs the socket gate accepts (localhost + Tailscale).
              '--url', `http://${getTailscaleIP() ?? 'localhost'}:${WEB_PORT}/automations`,
              '--url-title', 'Open Cortex',
            ], { timeout: 10000 }, () => { /* fire and forget */ })
          }
        } catch { /* pushover optional */ }

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
        res.end(JSON.stringify({ ok: true, id: run.id }))
      } catch { res.writeHead(500); res.end('Error') }
      return
    }

    if (url.pathname === '/api/automation/scheduled-tasks' && req.method === 'GET') {
      try {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
        res.end(JSON.stringify(readScheduledTasks()))
      } catch { res.writeHead(500); res.end('[]') }
      return
    }

    if (url.pathname.match(/^\/api\/automation\/[^/]+\/(approve|reject)$/) && req.method === 'POST') {
      const parts = url.pathname.split('/')
      const runId = parts[3]
      const action = parts[4] as 'approve' | 'reject'
      try {
        const data = await readDataKeyParsed<{ runs: any[] } | null>('cortex-automations', null)
        const run = data?.runs?.find((r: any) => r.id === runId)
        if (data && run) {
          run.status = action === 'approve' ? 'success' : 'error'
          run.approved = action === 'approve'
          await writeDataKey('cortex-automations', data, { source: 'http' })
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
          res.end(JSON.stringify({ ok: true, action }))
          return
        }
        res.writeHead(404); res.end('Run not found')
      } catch { res.writeHead(500); res.end('Error') }
      return
    }

    // ─── HTTP API: Electron-only features (for PWA/browser) ───
    const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) }

    if (url.pathname === '/api/calendar/today' && req.method === 'GET') {
      try {
        const events = await getTodayEvents()
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(events))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    if (url.pathname === '/api/calendar/sync-birthdays' && req.method === 'POST') {
      const body = await readBody(req, res)
      if (body === null) return
      try {
        const birthdays = JSON.parse(body)
        const calEmail = getKey('calendar-email') || undefined
        const result = await syncBirthdays(birthdays, calEmail)
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(result))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    if (url.pathname === '/api/calendar/create' && req.method === 'POST') {
      const body = await readBody(req, res)
      if (body === null) return
      try {
        const payload = JSON.parse(body)
        const result = await createCalendarEvent(payload)
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(result))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    if (url.pathname?.startsWith('/api/calendar/update/') && req.method === 'POST') {
      const eventId = decodeURIComponent(url.pathname.slice('/api/calendar/update/'.length))
      const body = await readBody(req, res)
      if (body === null) return
      try {
        const payload = JSON.parse(body)
        const result = await updateCalendarEvent(eventId, payload)
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(result))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    if (url.pathname?.startsWith('/api/calendar/delete/') && req.method === 'POST') {
      const eventId = decodeURIComponent(url.pathname.slice('/api/calendar/delete/'.length))
      try {
        const result = await deleteCalendarEvent(eventId)
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(result))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    if (url.pathname === '/api/calendar/events' && req.method === 'GET') {
      try {
        const start = url.searchParams.get('start') || localDate()
        const end = url.searchParams.get('end') || localDate(new Date(Date.now() + 120 * 86400000))
        const events = await getEventsInRange(start, end)
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(events))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    // Founder integrations (MCP get_*_stats): cache-first via the refresher —
    // fresh cache (<10min) is served as-is, otherwise a live refresh of just
    // that source runs. MCP calls no longer hammer the upstream APIs.
    const integrationMatch = url.pathname.match(/^\/api\/integrations\/(github|lemon|vercel|supabase)$/)
    if (integrationMatch && req.method === 'GET') {
      const source = integrationMatch[1] as FounderSource
      try {
        const result = await getStatsForEndpoint(source)
        if (result.kind === 'unconfigured') {
          // Preserve the legacy per-source unconfigured contracts.
          const body = source === 'github' ? { error: 'No GitHub token saved' }
            : source === 'lemon' ? { error: 'No Lemon credentials saved' }
            : null
          res.writeHead(200, corsHeaders); res.end(JSON.stringify(body))
        } else if (result.kind === 'ok') {
          res.writeHead(200, corsHeaders); res.end(JSON.stringify(result.data))
        } else {
          res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: result.error }))
        }
      } catch (e) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: (e as Error).message })) }
      return
    }

    // ─── Mars (Obsidian vault) integration ──────────────────
    if (url.pathname === '/api/mars/journal' && req.method === 'GET') {
      try {
        const date = url.searchParams.get('date') || undefined
        const doc = date ? readJournalDay(date) : readJournalToday()
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(doc))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    if (url.pathname === '/api/mars/journal' && req.method === 'POST') {
      const body = await readBody(req, res)
      if (body === null) return
      try {
        const { text, date, tag } = JSON.parse(body)
        if (!text) { res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: 'Missing text' })); return }
        const result = writeJournalLine(text, { date, tag })
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(result))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    if (url.pathname === '/api/mars/search' && req.method === 'GET') {
      try {
        const q = url.searchParams.get('q') || ''
        const limit = parseInt(url.searchParams.get('limit') || '20')
        const matches = searchVault(q, limit)
        res.writeHead(200, corsHeaders); res.end(JSON.stringify({ query: q, matches }))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    if (url.pathname === '/api/mars/voice-anchors' && req.method === 'GET') {
      try {
        const anchors = readVoiceAnchors()
        res.writeHead(200, corsHeaders); res.end(JSON.stringify({ anchors }))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    if (url.pathname === '/api/mars/stats' && req.method === 'GET') {
      try {
        const stats = vaultStats()
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(stats))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    // ─── System metrics (Glances proxy) ─────────────────────
    // Mac mini: glances launchd service on 127.0.0.1:61208
    if (url.pathname === '/api/system/mac' && req.method === 'GET') {
      try {
        const r = await fetch('http://127.0.0.1:61208/api/4/all', { signal: AbortSignal.timeout(4000) })
        if (!r.ok) throw new Error(`glances ${r.status}`)
        res.writeHead(200, corsHeaders); res.end(await r.text())
      } catch (e: any) { res.writeHead(502, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    // Aggregated history bucketed for charts. Window: 1h | 6h | 24h.
    if (url.pathname === '/api/system/history' && req.method === 'GET') {
      try {
        const hostParam = url.searchParams.get('host') as SystemHostKey | null
        if (hostParam !== 'mac') {
          res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: 'host must be mac' })); return
        }
        const win = url.searchParams.get('window') ?? '1h'
        const windowMs =
          win === '7d'  ? 7 * 24 * 3600 * 1000 :
          win === '3d'  ? 3 * 24 * 3600 * 1000 :
          win === '24h' ? 24 * 3600 * 1000 :
          win === '6h'  ? 6 * 3600 * 1000  :
          win === '15m' ? 15 * 60 * 1000   :
                          1 * 3600 * 1000
        const payload = buildHistoryResponse(hostParam, windowMs)
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(payload))
      } catch (e: any) {
        res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e?.message ?? 'history failed' }))
      }
      return
    }

    if (url.pathname === '/api/projects/scan' && req.method === 'GET') {
      try {
        const projectsDir = path.join(os.homedir(), 'Projects')
        if (!fs.existsSync(projectsDir)) { res.writeHead(200, corsHeaders); res.end('[]'); return }
        const entries = fs.readdirSync(projectsDir, { withFileTypes: true })
        const projects: ProjectInfo[] = []
        for (const entry of entries) {
          if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
          if (entry.name.startsWith('.')) continue
          try {
            const dir = path.join(projectsDir, entry.name)
            if (!fs.statSync(dir).isDirectory()) continue
            projects.push(scanProject(dir, entry.name))
          } catch { /* skip */ }
        }
        projects.sort((a, b) => a.name.localeCompare(b.name))
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(projects))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    // ─── Media API (images for captures — sync from phone) ─────
    if (url.pathname === '/api/media' && req.method === 'POST') {
      const body = await readBody(req, res)
      if (body === null) return
      try {
        const { id, base64 } = JSON.parse(body)
        if (!id || !base64) { res.writeHead(400); res.end('Missing id or base64'); return }
        if (typeof id !== 'string' || !KEY_RE.test(id)) { res.writeHead(400); res.end('Invalid id'); return }
        const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
        await fs.promises.writeFile(path.join(mediaDir, id), buffer)
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
        res.end('true')
      } catch { res.writeHead(500); res.end('Save error') }
      return
    }

    if (url.pathname === '/api/media' && req.method === 'GET') {
      const id = url.searchParams.get('id')
      if (!id || !KEY_RE.test(id)) { res.writeHead(400); res.end('Invalid id'); return }
      try {
        const file = path.join(mediaDir, id)
        if (!fs.existsSync(file)) {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
          res.end('null')
          return
        }
        const buffer = await fs.promises.readFile(file)
        const ext = id.split('.').pop()?.toLowerCase() || 'png'
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png'
        const b64 = `data:${mime};base64,${buffer.toString('base64')}`
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
        res.end(JSON.stringify(b64))
      } catch { res.writeHead(500); res.end('Load error') }
      return
    }

    if (url.pathname === '/api/media/delete' && req.method === 'POST') {
      const body = await readBody(req, res)
      if (body === null) return
      try {
        const { id } = JSON.parse(body)
        if (!id) { res.writeHead(400); res.end('Missing id'); return }
        if (typeof id !== 'string' || !KEY_RE.test(id)) { res.writeHead(400); res.end('Invalid id'); return }
        const file = path.join(mediaDir, id)
        if (fs.existsSync(file)) await fs.promises.unlink(file)
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
        res.end('true')
      } catch { res.writeHead(500); res.end('Delete error') }
      return
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': getAllowedOrigin(req),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      res.end()
      return
    }

    // ─── Static file serving ──────────────────────────────────
    let filePath = path.join(distPath, url.pathname === '/' ? '/index.html' : url.pathname)
    if (!fs.existsSync(filePath)) filePath = path.join(distPath, 'index.html')
    const ext = path.extname(filePath)
    try {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' })
      res.end(fs.readFileSync(filePath))
    } catch { res.writeHead(404); res.end('Not found') }
  })
  webServer.listen(WEB_PORT, '0.0.0.0')
}

function stopWebServer() { if (webServer) { webServer.close(); webServer = null } }

// ─── IPC: Calendar ─────────────────────────────────────────

ipcMain.handle('calendar:getTodayEvents', async () => getTodayEvents())
ipcMain.handle('calendar:syncBirthdays', async (_event, birthdays: BirthdayEntry[]) => {
  const calEmail = getKey('calendar-email') || undefined
  return syncBirthdays(birthdays, calEmail)
})
ipcMain.handle('calendar:createEvent', async (_event, payload: CreateEventPayload) => createCalendarEvent(payload))
ipcMain.handle('calendar:updateEvent', async (_event, eventId: string, payload: Partial<CreateEventPayload>) => updateCalendarEvent(eventId, payload))
ipcMain.handle('calendar:deleteEvent', async (_event, eventId: string) => deleteCalendarEvent(eventId))
ipcMain.handle('calendar:getEventsInRange', async (_event, start: string, end: string) => getEventsInRange(start, end))
ipcMain.handle('calendar:getEvent', async (_event, eventId: string) => getCalendarEvent(eventId))

// ─── IPC: Tray stats ──────────────────────────────────────

ipcMain.on('tray:updateStats', (_event, stats) => {
  currentStats = stats
  if (tray) tray.setContextMenu(buildTrayMenu())
})

// ─── IPC: Sprint sync (renderer → tray title) ────────────

ipcMain.on('sprint:sync', (_event, data: { active: boolean; endTimeMs?: number; task?: string }) => {
  if (data.active && data.endTimeMs) {
    startTraySprintSync(data.endTimeMs, data.task || '')
  } else {
    clearTraySprintState()
  }
})

// ─── IPC: Keychain ─────────────────────────────────────────

ipcMain.handle('keychain:save', async (_event, service: string, value: string) => saveKey(service, value))
ipcMain.handle('keychain:get', async (_event, service: string) => getKey(service))
ipcMain.handle('keychain:delete', async (_event, service: string) => deleteKey(service))
ipcMain.handle('keychain:has', async (_event, service: string) => hasKey(service))
ipcMain.handle('keychain:list', async () => listKeys())

// ─── IPC: Founder integrations (legacy per-source handlers) ──
// Route through the refresher so every path shares one cache shape/write.

ipcMain.handle('github:getStats', async () => {
  const r = await getStatsForEndpoint('github')
  if (r.kind === 'unconfigured') return { error: 'No GitHub token saved' }
  if (r.kind === 'ok') return r.data
  return { error: `GitHub: ${r.error}` }
})

ipcMain.handle('lemon:getStats', async () => {
  const r = await getStatsForEndpoint('lemon')
  if (r.kind === 'unconfigured') return { error: 'No Lemon credentials saved' }
  if (r.kind === 'ok') return r.data
  return { error: `Lemon: ${r.error}` }
})

ipcMain.handle('vercel:getStats', async () => {
  const r = await getStatsForEndpoint('vercel')
  return r.kind === 'ok' ? r.data : null
})

ipcMain.handle('supabase:getStats', async () => {
  const r = await getStatsForEndpoint('supabase')
  return r.kind === 'ok' ? r.data : null
})

// ─── IPC: Projects scanner ────────────────────────────────

interface ProjectInfo {
  name: string
  path: string
  description: string | null
  type: 'app' | 'monorepo' | 'library' | 'skill' | 'assets' | 'unknown'
  hasPackageJson: boolean
  hasClaude: boolean
  gitRemote: string | null
  latestCommit: { message: string; date: string } | null
  workflows: { name: string; scheduled: boolean; cron?: string }[]
  techStack: string[]
  scripts: string[]
  connections: string[]
}

const TECH_DETECT: Record<string, string> = {
  'react': 'React', 'react-dom': 'React', 'next': 'Next.js', 'vue': 'Vue',
  'electron': 'Electron', 'express': 'Express', 'fastify': 'Fastify',
  'remotion': 'Remotion', 'tailwindcss': 'Tailwind', '@tailwindcss/vite': 'Tailwind',
  'typescript': 'TypeScript', 'vite': 'Vite', 'turbo': 'Turborepo',
  'drizzle-orm': 'Drizzle', 'prisma': 'Prisma',
}

const CONNECTION_DETECT: Record<string, string> = {
  '@supabase/supabase-js': 'Supabase', '@supabase/ssr': 'Supabase',
  '@vercel/analytics': 'Vercel', '@vercel/speed-insights': 'Vercel',
  'stripe': 'Stripe', '@lemonsqueezy/lemonsqueezy.js': 'Lemon Squeezy',
  'openai': 'OpenAI', '@anthropic-ai/sdk': 'Anthropic',
  'resend': 'Resend', 'nodemailer': 'Email',
  '@clerk/nextjs': 'Clerk', 'lucia': 'Lucia Auth',
  '@sentry/nextjs': 'Sentry', '@sentry/node': 'Sentry',
}

function scanProject(dir: string, name: string): ProjectInfo {
  const info: ProjectInfo = {
    name, path: dir, description: null,
    type: 'unknown', hasPackageJson: false, hasClaude: false,
    gitRemote: null, latestCommit: null,
    workflows: [], techStack: [], scripts: [], connections: [],
  }

  // package.json
  const pkgPath = path.join(dir, 'package.json')
  let pkg: any = null
  if (fs.existsSync(pkgPath)) {
    info.hasPackageJson = true
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) } catch { /* skip */ }
  }

  if (pkg) {
    if (pkg.description) info.description = pkg.description
    if (pkg.scripts) info.scripts = Object.keys(pkg.scripts)

    // Detect tech stack + connections from all dependency fields
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    const techSet = new Set<string>()
    const connSet = new Set<string>()
    for (const dep of Object.keys(allDeps || {})) {
      if (TECH_DETECT[dep]) techSet.add(TECH_DETECT[dep])
      if (CONNECTION_DETECT[dep]) connSet.add(CONNECTION_DETECT[dep])
    }
    info.techStack = [...techSet]
    info.connections = [...connSet]

    // Type detection
    if (allDeps?.electron || allDeps?.['electron-builder']) info.type = 'app'
    else if (pkg.workspaces || fs.existsSync(path.join(dir, 'turbo.json'))) info.type = 'monorepo'
    else if (allDeps?.next || allDeps?.react) info.type = 'app'
    else info.type = 'library'
  }

  // Skill detection
  if (fs.existsSync(path.join(dir, 'skill.md'))) info.type = 'skill'

  // Assets detection (no package.json, has images/videos)
  if (!info.hasPackageJson) {
    try {
      const entries = fs.readdirSync(dir)
      const mediaExts = ['.png', '.jpg', '.jpeg', '.svg', '.mp4', '.mov', '.mkv', '.webm']
      const hasMedia = entries.some(e => mediaExts.some(ext => e.toLowerCase().endsWith(ext)))
      const hasDirs = entries.some(e => { try { return fs.statSync(path.join(dir, e)).isDirectory() } catch { return false } })
      info.type = hasMedia || hasDirs ? 'assets' : 'unknown'
    } catch { /* skip */ }
  }

  // CLAUDE.md
  info.hasClaude = fs.existsSync(path.join(dir, 'CLAUDE.md'))

  // Description fallback from README
  if (!info.description) {
    const readmePath = path.join(dir, 'README.md')
    if (fs.existsSync(readmePath)) {
      try {
        const lines = fs.readFileSync(readmePath, 'utf-8').split('\n')
        // Find first non-empty, non-heading line
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('!') && !trimmed.startsWith('---')) {
            info.description = trimmed.slice(0, 200)
            break
          }
        }
      } catch { /* skip */ }
    }
  }

  // Git remote
  const gitConfigPath = path.join(dir, '.git', 'config')
  if (fs.existsSync(gitConfigPath)) {
    try {
      const gitConfig = fs.readFileSync(gitConfigPath, 'utf-8')
      const match = gitConfig.match(/url\s*=\s*(.+)/)
      if (match) info.gitRemote = match[1].trim()
    } catch { /* skip */ }
  }

  // Latest commit (sync, with timeout protection)
  try {
    const { execSync } = require('child_process')
    const log = execSync(`git -C "${dir}" log --oneline --format="%s|||%ci" -1`, { timeout: 3000, encoding: 'utf-8' }).trim()
    if (log) {
      const [message, date] = log.split('|||')
      info.latestCommit = { message: message || '', date: date?.slice(0, 10) || '' }
    }
  } catch { /* not a git repo or no commits */ }

  // GitHub Actions workflows
  const workflowsDir = path.join(dir, '.github', 'workflows')
  if (fs.existsSync(workflowsDir)) {
    try {
      for (const wf of fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))) {
        const content = fs.readFileSync(path.join(workflowsDir, wf), 'utf-8')
        const nameMatch = content.match(/^name:\s*(.+)/m)
        const cronMatch = content.match(/cron:\s*'([^']+)'/)
        info.workflows.push({
          name: nameMatch ? nameMatch[1].trim() : wf.replace(/\.ya?ml$/, ''),
          scheduled: !!cronMatch,
          cron: cronMatch ? cronMatch[1] : undefined,
        })
      }
    } catch { /* skip */ }
  }

  return info
}

ipcMain.handle('projects:scan', async () => {
  const projectsDir = path.join(os.homedir(), 'Projects')
  if (!fs.existsSync(projectsDir)) return []
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true })
    const projects: ProjectInfo[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      if (entry.name.startsWith('.')) continue
      const dir = path.join(projectsDir, entry.name)
      try {
        // Resolve symlinks and verify it's a directory
        const stat = fs.statSync(dir)
        if (!stat.isDirectory()) continue
        projects.push(scanProject(dir, entry.name))
      } catch { /* skip broken symlinks */ }
    }
    const sorted = projects.sort((a, b) => a.name.localeCompare(b.name))
    try { encryptAndWrite(path.join(dataDir, 'cortex-cache-projects.json'), JSON.stringify({ data: sorted, lastUpdated: new Date().toISOString() })) } catch { /* cache optional */ }
    return sorted
  } catch (e) { console.error('[Cortex] projects:scan error:', e); return [] }
})

// ─── Data persistence (JSON files in project data/) ───────

// In dev: data/ in project root. In prod: iCloud Drive for cross-device sync.
// CORTEX_DATA_DIR (absolute path) overrides both. Never write inside the asar archive.
const iCloudDir = path.join(
  app.getPath('home'),
  'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Cortex'
)
const legacyDir = path.join(app.getPath('home'), 'Projects', 'cortex', 'data')

const envDataDir = (() => {
  const raw = process.env.CORTEX_DATA_DIR
  if (!raw) return null
  if (!path.isAbsolute(raw)) {
    console.warn(`[Cortex] Ignoring CORTEX_DATA_DIR="${raw}" — must be an absolute path`)
    return null
  }
  return raw
})()

const dataDir = envDataDir ?? (isDev
  ? path.join(__dirname, '..', 'data')
  : iCloudDir)
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

// Migrate existing data from legacy location to iCloud (skipped when CORTEX_DATA_DIR overrides)
if (!isDev && !envDataDir && fs.existsSync(legacyDir) && legacyDir !== dataDir) {
  const legacyFiles = fs.readdirSync(legacyDir)
  if (legacyFiles.length > 0) {
    console.log(`[Cortex] Migrating ${legacyFiles.length} items from legacy dir to iCloud...`)
    for (const item of legacyFiles) {
      const src = path.join(legacyDir, item)
      const dest = path.join(dataDir, item)
      if (!fs.existsSync(dest)) {
        const stat = fs.statSync(src)
        if (stat.isDirectory()) {
          fs.cpSync(src, dest, { recursive: true })
        } else {
          fs.copyFileSync(src, dest)
        }
      }
    }
    // Rename legacy dir so migration doesn't re-run
    const renamedDir = legacyDir + '.migrated-to-icloud'
    if (fs.existsSync(renamedDir)) {
      fs.rmSync(legacyDir, { recursive: true })
      console.log('[Cortex] Migration complete. Legacy dir removed (backup already exists)')
    } else {
      fs.renameSync(legacyDir, renamedDir)
      console.log('[Cortex] Migration complete. Legacy dir renamed to data.migrated-to-icloud')
    }
  }
}

const backupDir = path.join(dataDir, 'backups')
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

// ─── Shared store read/write path ──────────────────────────
// ONE write pipeline used by IPC data:write, HTTP POST /api/data, and
// main-process writers (tray habit toggle, automations): sanitize →
// versioned backups → encrypt + atomic write → broadcast data:changed.

type DataChangeSource = 'ipc' | 'http' | 'main'

type WriteOutcome =
  | { ok: true; rev: string }
  | { ok: false; conflict: true; rev: string | null; data: unknown }
  | { ok: false; conflict?: undefined; error: string }

function broadcastDataChanged(key: string, source: DataChangeSource, rev: string | null) {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send('data:changed', { key, source, rev }) } catch { /* window closing */ }
  }
}

/** rev = the key file's mtimeMs as a string; null when the file doesn't exist. */
async function statRev(file: string): Promise<string | null> {
  try { return String((await fs.promises.stat(file)).mtimeMs) } catch { return null }
}

/**
 * Read a store key (async), falling back to .bak / versioned backups when the
 * main file is corrupt. Returns the decrypted JSON text plus the main file's rev.
 */
async function readDataFile(key: string): Promise<{ text: string | null; rev: string | null }> {
  const file = path.join(dataDir, `${key}.json`)
  const rev = await statRev(file)
  if (rev === null) return { text: null, rev: null }
  try {
    const text = await readAndDecryptAsync(file)
    JSON.parse(text) // validate — corrupt content triggers the backup fallbacks
    return { text, rev }
  } catch (e) {
    console.warn(`[Cortex] data read: main file corrupt for "${key}", falling back to backup...`)
    // Fallback 1: the .bak.json
    try {
      const text = await readAndDecryptAsync(path.join(backupDir, `${key}.bak.json`))
      JSON.parse(text)
      console.warn(`[Cortex] data read: recovered "${key}" from .bak`)
      return { text, rev }
    } catch { /* continue to versioned fallback */ }
    // Fallback 2: latest readable versioned backup
    try {
      const versionsDir = path.join(backupDir, 'versions', key)
      const versions = (await fs.promises.readdir(versionsDir)).sort().reverse()
      for (const v of versions) {
        try {
          const text = await readAndDecryptAsync(path.join(versionsDir, v))
          JSON.parse(text)
          console.warn(`[Cortex] data read: recovered "${key}" from version ${v}`)
          return { text, rev }
        } catch { /* try next version */ }
      }
    } catch { /* no versions dir */ }
    console.error(`[Cortex] data read: all fallbacks failed for "${key}":`, e)
    return { text: null, rev }
  }
}

// Serialize writes per key so concurrent writers can't interleave the
// stat-check → backup → write sequence.
const keyWriteLocks = new Map<string, Promise<unknown>>()
function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = keyWriteLocks.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  keyWriteLocks.set(key, next.then(() => undefined, () => undefined))
  return next
}

async function writeDataKey(
  key: string,
  data: unknown,
  opts: { baseRev?: string | number | null; source: DataChangeSource },
): Promise<WriteOutcome> {
  if (typeof key !== 'string' || !KEY_RE.test(key)) return { ok: false, error: 'invalid key' }

  let serialized: string
  try {
    // Compact JSON — the plaintext is encrypted at rest anyway.
    serialized = JSON.stringify(data)
    if (serialized === undefined) throw new Error('value is not JSON-serializable')
  } catch (serErr) {
    console.error(`[Cortex] data write: serialization failed for "${key}":`, serErr)
    return { ok: false, error: 'serialization failed' }
  }
  if (serialized.length > 5 * 1024 * 1024) {
    console.warn(`[Cortex] data write: "${key}" is ${(serialized.length / 1024 / 1024).toFixed(1)}MB — consider cleanup`)
  }

  const baseRev = opts.baseRev == null ? null : String(opts.baseRev)

  return withKeyLock(key, async (): Promise<WriteOutcome> => {
    const file = path.join(dataDir, `${key}.json`)
    const currentRev = await statRev(file)

    // Optimistic concurrency — only enforced when the writer sent a baseRev.
    // Rev-less writes (deployed old writers) behave exactly as before.
    if (baseRev !== null && baseRev !== currentRev) {
      const { text } = await readDataFile(key)
      let currentData: unknown = null
      if (text !== null) { try { currentData = JSON.parse(text) } catch { /* corrupt */ } }
      return { ok: false, conflict: true, rev: currentRev, data: currentData }
    }

    try {
      if (currentRev !== null) {
        // .bak + versioned backup of the previous file (copies encrypted bytes as-is)
        await fs.promises.copyFile(file, path.join(backupDir, `${key}.bak.json`))
        const versionsDir = path.join(backupDir, 'versions', key)
        await fs.promises.mkdir(versionsDir, { recursive: true })
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        await fs.promises.copyFile(file, path.join(versionsDir, `${timestamp}.json`))
        const versions = (await fs.promises.readdir(versionsDir)).sort().reverse()
        for (const v of versions.slice(VERSIONED_BACKUPS_KEPT)) {
          try { await fs.promises.unlink(path.join(versionsDir, v)) } catch { /* ignore */ }
        }
      }

      await encryptAndWriteAsync(file, serialized)
      const rev = (await statRev(file)) ?? String(Date.now())
      broadcastDataChanged(key, opts.source, rev)
      return { ok: true, rev }
    } catch (e) {
      console.error(`data:write error for ${key}:`, e)
      return { ok: false, error: String((e as Error)?.message ?? e) }
    }
  })
}

/** Read + parse a store key in the main process (backup-fallback included). */
async function readDataKeyParsed<T>(key: string, fallback: T): Promise<T> {
  const { text } = await readDataFile(key)
  if (text === null) return fallback
  try { return JSON.parse(text) as T } catch { return fallback }
}

ipcMain.handle('automation:scheduledTasks', async () => readScheduledTasks())

ipcMain.handle('data:read', async (_event, key: string) => {
  if (typeof key !== 'string' || !KEY_RE.test(key)) return { data: null, rev: null, error: 'invalid key' }
  const { text, rev } = await readDataFile(key)
  if (text === null) return { data: null, rev }
  try { return { data: JSON.parse(text), rev } } catch { return { data: null, rev } }
})

ipcMain.handle('data:write', async (_event, key: string, data: unknown, baseRev?: string | null) =>
  writeDataKey(key, data, { baseRev: baseRev ?? null, source: 'ipc' }))

// ── Media storage (images for captures) ────────────────────────────────────
const mediaDir = path.join(dataDir, 'media')
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true })

ipcMain.handle('media:save', async (_event, id: string, base64: string) => {
  try {
    if (typeof id !== 'string' || !KEY_RE.test(id)) return false
    const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    await fs.promises.writeFile(path.join(mediaDir, id), buffer)
    return true
  } catch (e) { console.error('media:save error:', e); return false }
})

ipcMain.handle('media:load', async (_event, id: string) => {
  try {
    if (typeof id !== 'string' || !KEY_RE.test(id)) return null
    const file = path.join(mediaDir, id)
    if (!fs.existsSync(file)) return null
    const buffer = await fs.promises.readFile(file)
    const ext = id.split('.').pop()?.toLowerCase() || 'png'
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch (e) { console.error('media:load error:', e); return null }
})

ipcMain.handle('media:delete', async (_event, id: string) => {
  try {
    if (typeof id !== 'string' || !KEY_RE.test(id)) return false
    const file = path.join(mediaDir, id)
    if (fs.existsSync(file)) await fs.promises.unlink(file)
    return true
  } catch (e) { console.error('media:delete error:', e); return false }
})

ipcMain.handle('notify:pushover', async (_event, category: string, message: string) => {
  try {
    const { execFile: ef } = require('child_process')
    const notifyScript = path.join(os.homedir(), 'Projects', 'pushover', 'bin', 'notify.sh')
    if (fs.existsSync(notifyScript)) {
      ef(notifyScript, ['-c', category, '-m', message], { timeout: 10000 }, () => {})
      return true
    }
    return false
  } catch { return false }
})

ipcMain.handle('data:listKeys', async () => {
  try {
    return fs.readdirSync(dataDir)
      .filter(f => f.endsWith('.json') && !f.includes('.bak'))
      .map(f => f.replace('.json', ''))
  } catch { return [] }
})

ipcMain.handle('data:exportAll', async () => {
  try {
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.includes('.bak'))
    const bundle: Record<string, unknown> = {
      _meta: { version: '1.0', exported: new Date().toISOString(), app: 'Cortex' }
    }
    for (const f of files) {
      const key = f.replace('.json', '')
      bundle[key] = JSON.parse(readAndDecrypt(path.join(dataDir, f)))
    }
    return JSON.stringify(bundle, null, 2)
  } catch (e) { console.error('data:exportAll error:', e); return null }
})

ipcMain.handle('data:importAll', async (_event, json: string) => {
  try {
    const bundle = JSON.parse(json)
    // Backup everything first
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const importBackupDir = path.join(backupDir, `pre-import-${timestamp}`)
    await fs.promises.mkdir(importBackupDir, { recursive: true })
    for (const f of (await fs.promises.readdir(dataDir)).filter(f => f.endsWith('.json'))) {
      await fs.promises.copyFile(path.join(dataDir, f), path.join(importBackupDir, f))
    }
    // Write imported data through the shared path ('main' so every window,
    // including the importer, reloads the fresh values).
    let count = 0
    for (const [key, value] of Object.entries(bundle)) {
      if (key === '_meta') continue
      if (!KEY_RE.test(key)) { console.warn(`[Cortex] importAll: skipping invalid key "${key}"`); continue }
      const result = await writeDataKey(key, value, { source: 'main' })
      if (result.ok) count++
    }
    return { success: true, count }
  } catch (e) { console.error('data:importAll error:', e); return { success: false, error: String(e) } }
})

ipcMain.handle('data:getPath', async () => dataDir)

ipcMain.handle('data:getStats', async () => {
  try {
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.includes('.tmp'))
    return files.map(f => ({
      key: f.replace('.json', ''),
      size: fs.statSync(path.join(dataDir, f)).size,
    }))
  } catch { return [] }
})

// ─── Daily file cleanup ───────────────────────────────────

function cleanupOldDailyFiles() {
  try {
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('cortex-daily-') && f.endsWith('.json'))
    const now = Date.now()
    const retentionMs = DAILY_FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000
    let cleaned = 0

    for (const file of files) {
      // Format: cortex-daily-{type}-YYYY-MM-DD.json — date is the last 10 chars before .json
      const baseName = file.replace('.json', '')
      const dateStr = baseName.slice(-10) // YYYY-MM-DD
      const fileDate = new Date(dateStr)
      if (isNaN(fileDate.getTime())) continue // skip if date can't be parsed

      if (now - fileDate.getTime() > retentionMs) {
        fs.unlinkSync(path.join(dataDir, file))
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[Cortex] Cleaned up ${cleaned} daily file${cleaned === 1 ? '' : 's'} older than ${DAILY_FILE_RETENTION_DAYS} days`)
    }
  } catch (e) {
    console.error('[Cortex] Daily file cleanup failed:', e)
  }
}

// ─── Auto-export every 30 minutes ─────────────────────────

async function autoExport() {
  try {
    const files = (await fs.promises.readdir(dataDir)).filter(f => f.endsWith('.json') && !f.includes('.bak') && !f.startsWith('cortex-backup'))
    if (files.length === 0) return
    const bundle: Record<string, unknown> = {
      _meta: { version: '1.0', exported: new Date().toISOString(), app: 'Cortex', auto: true }
    }
    for (const f of files) {
      const key = f.replace('.json', '')
      try { bundle[key] = JSON.parse(await readAndDecryptAsync(path.join(dataDir, f))) } catch { /* skip corrupted */ }
    }
    const json = JSON.stringify(bundle) // compact — this copy is encrypted, not human-facing
    await encryptAndWriteAsync(path.join(backupDir, 'cortex-backup-latest.json'), json)
    // Also save compressed encrypted version
    try {
      if (isEncryptionEnabled()) {
        const encrypted = encrypt(json)
        await fs.promises.writeFile(path.join(backupDir, 'cortex-backup-latest.json.gz'), zlib.gzipSync(encrypted))
      } else {
        await fs.promises.writeFile(path.join(backupDir, 'cortex-backup-latest.json.gz'), zlib.gzipSync(json))
      }
    } catch { /* compression optional */ }
    console.log(`[Cortex] Auto-export: ${files.length} stores saved to data/backups/`)
  } catch (e) { console.error('[Cortex] Auto-export failed:', e) }
}

let autoExportInterval: ReturnType<typeof setInterval> | null = null

// ─── App lifecycle ─────────────────────────────────────────

app.on('ready', () => {
  console.log(`[Cortex] Web port: ${WEB_PORT}${process.env.CORTEX_PORT ? ' (CORTEX_PORT)' : ''} — data dir: ${dataDir}${envDataDir ? ' (CORTEX_DATA_DIR)' : ''}`)

  // Initialize at-rest encryption before any data access
  const encResult = initEncryption(dataDir)
  if (encResult === 'key-loss') {
    // The data dir holds CTX1-encrypted files but the master key is gone.
    // Minting a new key would silently orphan every existing file — refuse.
    dialog.showErrorBox(
      'Cortex — encryption key missing',
      `Your Cortex data is encrypted, but the master key file is missing or unreadable:\n\n${path.join(app.getPath('userData'), 'cortex-keys.enc')}\n\nCortex will NOT create a new key, because that would permanently orphan all existing data in:\n${dataDir}\n\nRestore cortex-keys.enc from a backup (e.g. Time Machine) and launch Cortex again.`,
    )
    app.exit(1)
    return
  }
  if (encResult === 'unavailable') {
    console.warn('[Cortex] safeStorage unavailable — data will NOT be encrypted at rest')
  } else {
    migrateToEncrypted(dataDir, backupDir)
    console.log('[Cortex] Data encryption active')
  }

  createWindow()
  createTray()
  startWebServer() // Auto-start web server for iPhone/browser access

  // Founder metrics: background refresher (30min jittered + resume + IPC).
  // History goes through the shared backed-up write path; caches write via
  // the direct encrypt path + broadcast (no versioned-backup churn in iCloud).
  startFounderRefresher({
    dataDir,
    readDataKeyParsed,
    writeDataKey: (key, data, opts) => writeDataKey(key, data, opts),
    broadcastDataChanged,
  })

  // Global hotkey: Cmd+Shift+Alt+S to start a 60-min sprint (sends to renderer)
  globalShortcut.register('CommandOrControl+Shift+Alt+S', () => {
    if (mainWindow) {
      mainWindow.webContents.send('sprint:action', 'start', { duration: 60 })
      mainWindow.show()
      mainWindow.focus()
    }
  })
  cleanupOldDailyFiles()
  // Auto-export on startup + every 30 minutes
  setTimeout(autoExport, 5000)
  autoExportInterval = setInterval(autoExport, 30 * 60 * 1000)
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (mainWindow === null) createWindow() })
let quitExportDone = false
app.on('before-quit', (event) => {
  globalShortcut.unregisterAll()
  if (traySprintInterval) clearInterval(traySprintInterval)
  if (trayRefreshTimer) clearInterval(trayRefreshTimer)
  if (traySystemTimer) clearInterval(traySystemTimer)
  if (systemHistoryPersistTimer) clearInterval(systemHistoryPersistTimer)
  // Force-flush regardless of dirty flag so the latest 5s sample lands.
  systemHistoryDirty = true
  persistSystemHistory()
  if (autoExportInterval) clearInterval(autoExportInterval)
  // One final export on quit — autoExport is async now, so hold the quit
  // until it lands, then resume (guarded so the second pass falls through).
  if (!quitExportDone) {
    quitExportDone = true
    event.preventDefault()
    autoExport().finally(() => app.quit())
  }
})
