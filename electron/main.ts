import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, clipboard, globalShortcut, Notification } from 'electron'
import path from 'path'
import http from 'http'
import os from 'os'
import fs from 'fs'
import zlib from 'zlib'
import { fileURLToPath } from 'url'
import { getTodayEvents, syncBirthdays, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, getEventsInRange, getCalendarEvent } from './calendar.js'
import type { BirthdayEntry, CreateEventPayload } from './calendar.js'
import { saveKey, getKey, deleteKey, hasKey, listKeys } from './keychain.js'
import { initEncryption, encrypt, encryptAndWrite, readAndDecrypt, migrateToEncrypted, isEncryptionEnabled } from './crypto.js'
import { getGitHubStats } from './integrations/github.js'
import { getLemonStats } from './integrations/lemon.js'
import { getVercelStats } from './integrations/vercel.js'
import { getSupabaseStats } from './integrations/supabase.js'
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
const WEB_PORT = 3456

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
    const habitsFile = path.join(dataDir, 'cortex-habits.json')
    if (fs.existsSync(habitsFile)) cachedHabits = JSON.parse(readAndDecrypt(habitsFile))
    else cachedHabits = []
  } catch { cachedHabits = [] }
  try {
    const today = localDate()
    const historyFile = path.join(dataDir, 'cortex-habits-history.json')
    if (fs.existsSync(historyFile)) {
      const history = JSON.parse(readAndDecrypt(historyFile))
      cachedHabitHistory = history[today] || {}
    } else { cachedHabitHistory = {} }
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

function saveSession(session: { id: string; task: string; duration: number; startedAt: string; completedAt: string }) {
  const today = localDate()
  const file = path.join(dataDir, `cortex-daily-sessions-${today}.json`)
  let sessions: any[] = []
  try { if (fs.existsSync(file)) sessions = JSON.parse(readAndDecrypt(file)) } catch { /* fresh */ }
  sessions.push(session)
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(backupDir, `cortex-daily-sessions-${today}.bak.json`))
  encryptAndWrite(file, JSON.stringify(sessions, null, 2))
}


function toggleHabitFromTray(habitId: string) {
  const today = localDate()
  const historyFile = path.join(dataDir, 'cortex-habits-history.json')
  let history: Record<string, Record<string, boolean>> = {}
  try { if (fs.existsSync(historyFile)) history = JSON.parse(readAndDecrypt(historyFile)) } catch { /* fresh */ }
  if (!history[today]) history[today] = {}
  history[today][habitId] = !history[today][habitId]
  if (fs.existsSync(historyFile)) fs.copyFileSync(historyFile, path.join(backupDir, 'cortex-habits-history.bak.json'))
  encryptAndWrite(historyFile, JSON.stringify(history, null, 2))
  cachedHabitHistory = history[today]
  if (tray) tray.setContextMenu(buildTrayMenu())
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
      { label: `${getLanIP()}:${WEB_PORT}`, click: () => { clipboard.writeText(`http://${getLanIP()}:${WEB_PORT}`); shell.openExternal(`http://${getLanIP()}:${WEB_PORT}`) } },
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

function getLanIP(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return 'localhost'
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
      if (!key) { res.writeHead(400); res.end('Missing key'); return }
      const file = path.join(dataDir, `${key}.json`)
      try {
        if (fs.existsSync(file)) {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
          res.end(readAndDecrypt(file))
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
          res.end('null')
        }
      } catch { res.writeHead(500); res.end('Read error') }
      return
    }

    if (url.pathname === '/api/data' && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        try {
          const { key, data } = JSON.parse(body)
          if (!key) { res.writeHead(400); res.end('Missing key'); return }
          const file = path.join(dataDir, `${key}.json`)
          if (fs.existsSync(file)) {
            fs.copyFileSync(file, path.join(backupDir, `${key}.bak.json`))
          }
          encryptAndWrite(file, JSON.stringify(data, null, 2))
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
          res.end('true')
        } catch { res.writeHead(500); res.end('Write error') }
      })
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
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        try {
          const { taskName, status, summary, fullOutput } = JSON.parse(body)
          if (!taskName) { res.writeHead(400); res.end('Missing taskName'); return }
          const automFile = path.join(dataDir, 'cortex-automations.json')
          let data: { runs: any[] } = { runs: [] }
          try { if (fs.existsSync(automFile)) data = JSON.parse(readAndDecrypt(automFile)) } catch { /* fresh */ }
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
          encryptAndWrite(automFile, JSON.stringify(data, null, 2))

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
                '--url', `http://${getLanIP()}:${WEB_PORT}/automations`,
                '--url-title', 'Open Cortex',
              ], { timeout: 10000 }, () => { /* fire and forget */ })
            }
          } catch { /* pushover optional */ }

          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
          res.end(JSON.stringify({ ok: true, id: run.id }))
        } catch { res.writeHead(500); res.end('Error') }
      })
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
        const automFile = path.join(dataDir, 'cortex-automations.json')
        if (fs.existsSync(automFile)) {
          const data = JSON.parse(readAndDecrypt(automFile))
          const run = data.runs.find((r: any) => r.id === runId)
          if (run) {
            run.status = action === 'approve' ? 'success' : 'error'
            run.approved = action === 'approve'
            encryptAndWrite(automFile, JSON.stringify(data, null, 2))
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
            res.end(JSON.stringify({ ok: true, action }))
            return
          }
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
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', async () => {
        try {
          const birthdays = JSON.parse(body)
          const calEmail = getKey('calendar-email') || undefined
          const result = await syncBirthdays(birthdays, calEmail)
          res.writeHead(200, corsHeaders); res.end(JSON.stringify(result))
        } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      })
      return
    }

    if (url.pathname === '/api/calendar/create' && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body)
          const result = await createCalendarEvent(payload)
          res.writeHead(200, corsHeaders); res.end(JSON.stringify(result))
        } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      })
      return
    }

    if (url.pathname?.startsWith('/api/calendar/update/') && req.method === 'POST') {
      const eventId = decodeURIComponent(url.pathname.slice('/api/calendar/update/'.length))
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body)
          const result = await updateCalendarEvent(eventId, payload)
          res.writeHead(200, corsHeaders); res.end(JSON.stringify(result))
        } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      })
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

    if (url.pathname === '/api/integrations/github' && req.method === 'GET') {
      try {
        const token = getKey('github-token')
        if (!token) { res.writeHead(200, corsHeaders); res.end(JSON.stringify({ error: 'No GitHub token saved' })); return }
        const stats = await getGitHubStats(token)
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(stats))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    if (url.pathname === '/api/integrations/lemon' && req.method === 'GET') {
      try {
        const apiKey = getKey('lemon-api-key')
        const storeId = getKey('lemon-store-id')
        if (!apiKey || !storeId) { res.writeHead(200, corsHeaders); res.end(JSON.stringify({ error: 'No Lemon credentials saved' })); return }
        const stats = await getLemonStats(apiKey, storeId)
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(stats))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    if (url.pathname === '/api/integrations/vercel' && req.method === 'GET') {
      try {
        const token = getKey('vercel-token')
        if (!token) { res.writeHead(200, corsHeaders); res.end(JSON.stringify(null)); return }
        const stats = await getVercelStats(token)
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(stats))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      return
    }

    if (url.pathname === '/api/integrations/supabase' && req.method === 'GET') {
      try {
        const sbUrl = getKey('supabase-url')
        const sbKey = getKey('supabase-service-key')
        if (!sbUrl || !sbKey) { res.writeHead(200, corsHeaders); res.end(JSON.stringify(null)); return }
        const stats = await getSupabaseStats(sbUrl, sbKey)
        res.writeHead(200, corsHeaders); res.end(JSON.stringify(stats))
      } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
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
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        try {
          const { text, date, tag } = JSON.parse(body)
          if (!text) { res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: 'Missing text' })); return }
          const result = writeJournalLine(text, { date, tag })
          res.writeHead(200, corsHeaders); res.end(JSON.stringify(result))
        } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
      })
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
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        try {
          const { id, base64 } = JSON.parse(body)
          if (!id || !base64) { res.writeHead(400); res.end('Missing id or base64'); return }
          const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
          fs.writeFileSync(path.join(mediaDir, id), buffer)
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
          res.end('true')
        } catch { res.writeHead(500); res.end('Save error') }
      })
      return
    }

    if (url.pathname === '/api/media' && req.method === 'GET') {
      const id = url.searchParams.get('id')
      if (!id) { res.writeHead(400); res.end('Missing id'); return }
      try {
        const file = path.join(mediaDir, id)
        if (!fs.existsSync(file)) {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
          res.end('null')
          return
        }
        const buffer = fs.readFileSync(file)
        const ext = id.split('.').pop()?.toLowerCase() || 'png'
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png'
        const b64 = `data:${mime};base64,${buffer.toString('base64')}`
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
        res.end(JSON.stringify(b64))
      } catch { res.writeHead(500); res.end('Load error') }
      return
    }

    if (url.pathname === '/api/media/delete' && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        try {
          const { id } = JSON.parse(body)
          if (!id) { res.writeHead(400); res.end('Missing id'); return }
          const file = path.join(mediaDir, id)
          if (fs.existsSync(file)) fs.unlinkSync(file)
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getAllowedOrigin(req) })
          res.end('true')
        } catch { res.writeHead(500); res.end('Delete error') }
      })
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

// ─── IPC: GitHub ───────────────────────────────────────────

ipcMain.handle('github:getStats', async () => {
  const token = getKey('github-token')
  if (!token) return { error: 'No GitHub token saved' }
  try {
    const stats = await getGitHubStats(token)
    try { encryptAndWrite(path.join(dataDir, 'cortex-cache-github.json'), JSON.stringify({ data: stats, lastUpdated: new Date().toISOString() }, null, 2)) } catch { /* cache optional */ }
    return stats
  } catch (e: any) { return { error: `GitHub: ${e.message}` } }
})

// ─── IPC: Lemon Squeezy ───────────────────────────────────

ipcMain.handle('lemon:getStats', async () => {
  const apiKey = getKey('lemon-api-key')
  const storeId = getKey('lemon-store-id')
  if (!apiKey) return { error: 'No Lemon API key saved' }
  if (!storeId) return { error: 'No Lemon Store ID saved' }
  try {
    const stats = await getLemonStats(apiKey, storeId)
    try { encryptAndWrite(path.join(dataDir, 'cortex-cache-lemon.json'), JSON.stringify({ data: stats, lastUpdated: new Date().toISOString() }, null, 2)) } catch { /* cache optional */ }
    return stats
  } catch (e: any) { return { error: `Lemon: ${e.message}` } }
})

// ─── IPC: Vercel ───────────────────────────────────────────

ipcMain.handle('vercel:getStats', async () => {
  const token = getKey('vercel-token')
  if (!token) return null
  try {
    const stats = await getVercelStats(token)
    try { encryptAndWrite(path.join(dataDir, 'cortex-cache-vercel.json'), JSON.stringify({ data: stats, lastUpdated: new Date().toISOString() }, null, 2)) } catch { /* cache optional */ }
    return stats
  } catch (e) { console.error('Vercel error:', e); return null }
})

// ─── IPC: Supabase ─────────────────────────────────────────

ipcMain.handle('supabase:getStats', async () => {
  const url = getKey('supabase-url')
  const key = getKey('supabase-service-key')
  if (!url || !key) return null
  try {
    const stats = await getSupabaseStats(url, key)
    try { encryptAndWrite(path.join(dataDir, 'cortex-cache-supabase.json'), JSON.stringify({ data: stats, lastUpdated: new Date().toISOString() }, null, 2)) } catch { /* cache optional */ }
    return stats
  } catch (e) { console.error('Supabase error:', e); return null }
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
    try { encryptAndWrite(path.join(dataDir, 'cortex-cache-projects.json'), JSON.stringify({ data: sorted, lastUpdated: new Date().toISOString() }, null, 2)) } catch { /* cache optional */ }
    return sorted
  } catch (e) { console.error('[Cortex] projects:scan error:', e); return [] }
})

// ─── Data persistence (JSON files in project data/) ───────

// In dev: data/ in project root. In prod: iCloud Drive for cross-device sync.
// Never write inside the asar archive.
const iCloudDir = path.join(
  app.getPath('home'),
  'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Cortex'
)
const legacyDir = path.join(app.getPath('home'), 'Projects', 'cortex', 'data')

const dataDir = isDev
  ? path.join(__dirname, '..', 'data')
  : iCloudDir
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

// Migrate existing data from legacy location to iCloud
if (!isDev && fs.existsSync(legacyDir) && legacyDir !== dataDir) {
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

ipcMain.handle('automation:scheduledTasks', async () => readScheduledTasks())

ipcMain.handle('data:read', async (_event, key: string) => {
  const file = path.join(dataDir, `${key}.json`)
  try {
    if (fs.existsSync(file)) return JSON.parse(readAndDecrypt(file))
  } catch (e) {
    console.warn(`[Cortex] data:read: main file corrupt for "${key}", falling back to backup...`)
    // Fallback 1: try the .bak.json
    try {
      const bakFile = path.join(backupDir, `${key}.bak.json`)
      if (fs.existsSync(bakFile)) {
        const data = JSON.parse(readAndDecrypt(bakFile))
        console.warn(`[Cortex] data:read: recovered "${key}" from .bak`)
        return data
      }
    } catch { /* continue to versioned fallback */ }
    // Fallback 2: try latest versioned backup
    try {
      const versionsDir = path.join(backupDir, 'versions', key)
      if (fs.existsSync(versionsDir)) {
        const versions = fs.readdirSync(versionsDir).sort().reverse()
        for (const v of versions) {
          try {
            const data = JSON.parse(readAndDecrypt(path.join(versionsDir, v)))
            console.warn(`[Cortex] data:read: recovered "${key}" from version ${v}`)
            return data
          } catch { /* try next version */ }
        }
      }
    } catch (vErr) {
      console.error(`[Cortex] data:read: all fallbacks failed for "${key}":`, vErr)
    }
  }
  return null
})

ipcMain.handle('data:write', async (_event, key: string, data: unknown) => {
  const file = path.join(dataDir, `${key}.json`)
  try {
    // Validate serialization before writing
    let serialized: string
    try {
      serialized = JSON.stringify(data, null, 2)
    } catch (serErr) {
      console.error(`[Cortex] data:write: serialization failed for "${key}":`, serErr)
      return false
    }

    if (serialized.length > 5 * 1024 * 1024) {
      console.warn(`[Cortex] data:write: "${key}" is ${(serialized.length / 1024 / 1024).toFixed(1)}MB — consider cleanup`)
    }

    // Keep .bak + versioned backup of previous file (copies encrypted bytes as-is)
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(backupDir, `${key}.bak.json`))
      // Versioned backup: keep last 10
      const versionsDir = path.join(backupDir, 'versions', key)
      if (!fs.existsSync(versionsDir)) fs.mkdirSync(versionsDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      fs.copyFileSync(file, path.join(versionsDir, `${timestamp}.json`))
      // Prune old versions
      const versions = fs.readdirSync(versionsDir).sort().reverse()
      for (const v of versions.slice(10)) {
        try { fs.unlinkSync(path.join(versionsDir, v)) } catch { /* ignore */ }
      }
    }

    // Encrypt + atomic write
    encryptAndWrite(file, serialized)
    return true
  } catch (e) { console.error(`data:write error for ${key}:`, e); return false }
})

// ── Media storage (images for captures) ────────────────────────────────────
const mediaDir = path.join(dataDir, 'media')
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true })

ipcMain.handle('media:save', async (_event, id: string, base64: string) => {
  try {
    const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    fs.writeFileSync(path.join(mediaDir, id), buffer)
    return true
  } catch (e) { console.error('media:save error:', e); return false }
})

ipcMain.handle('media:load', async (_event, id: string) => {
  try {
    const file = path.join(mediaDir, id)
    if (!fs.existsSync(file)) return null
    const buffer = fs.readFileSync(file)
    const ext = id.split('.').pop()?.toLowerCase() || 'png'
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch (e) { console.error('media:load error:', e); return null }
})

ipcMain.handle('media:delete', async (_event, id: string) => {
  try {
    const file = path.join(mediaDir, id)
    if (fs.existsSync(file)) fs.unlinkSync(file)
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
    fs.mkdirSync(importBackupDir, { recursive: true })
    for (const f of fs.readdirSync(dataDir).filter(f => f.endsWith('.json'))) {
      fs.copyFileSync(path.join(dataDir, f), path.join(importBackupDir, f))
    }
    // Write imported data (encrypted)
    let count = 0
    for (const [key, value] of Object.entries(bundle)) {
      if (key === '_meta') continue
      encryptAndWrite(path.join(dataDir, `${key}.json`), JSON.stringify(value, null, 2))
      count++
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
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    let cleaned = 0

    for (const file of files) {
      // Format: cortex-daily-{type}-YYYY-MM-DD.json — date is the last 10 chars before .json
      const baseName = file.replace('.json', '')
      const dateStr = baseName.slice(-10) // YYYY-MM-DD
      const fileDate = new Date(dateStr)
      if (isNaN(fileDate.getTime())) continue // skip if date can't be parsed

      if (now - fileDate.getTime() > thirtyDaysMs) {
        fs.unlinkSync(path.join(dataDir, file))
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[Cortex] Cleaned up ${cleaned} daily file${cleaned === 1 ? '' : 's'} older than 30 days`)
    }
  } catch (e) {
    console.error('[Cortex] Daily file cleanup failed:', e)
  }
}

// ─── Auto-export every 30 minutes ─────────────────────────

function autoExport() {
  try {
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.includes('.bak') && !f.startsWith('cortex-backup'))
    if (files.length === 0) return
    const bundle: Record<string, unknown> = {
      _meta: { version: '1.0', exported: new Date().toISOString(), app: 'Cortex', auto: true }
    }
    for (const f of files) {
      const key = f.replace('.json', '')
      try { bundle[key] = JSON.parse(readAndDecrypt(path.join(dataDir, f))) } catch { /* skip corrupted */ }
    }
    const json = JSON.stringify(bundle, null, 2)
    encryptAndWrite(path.join(backupDir, 'cortex-backup-latest.json'), json)
    // Also save compressed encrypted version
    try {
      if (isEncryptionEnabled()) {
        const encrypted = encrypt(json)
        fs.writeFileSync(path.join(backupDir, 'cortex-backup-latest.json.gz'), zlib.gzipSync(encrypted))
      } else {
        fs.writeFileSync(path.join(backupDir, 'cortex-backup-latest.json.gz'), zlib.gzipSync(json))
      }
    } catch { /* compression optional */ }
    console.log(`[Cortex] Auto-export: ${files.length} stores saved to data/backups/`)
  } catch (e) { console.error('[Cortex] Auto-export failed:', e) }
}

let autoExportInterval: ReturnType<typeof setInterval> | null = null

// ─── App lifecycle ─────────────────────────────────────────

app.on('ready', () => {
  // Initialize at-rest encryption before any data access
  const encOk = initEncryption()
  if (!encOk) {
    console.warn('[Cortex] safeStorage unavailable — data will NOT be encrypted at rest')
  } else {
    migrateToEncrypted(dataDir, backupDir)
    console.log('[Cortex] Data encryption active')
  }

  createWindow()
  createTray()
  startWebServer() // Auto-start web server for iPhone/browser access

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
app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  if (traySprintInterval) clearInterval(traySprintInterval)
  if (trayRefreshTimer) clearInterval(trayRefreshTimer)
  if (traySystemTimer) clearInterval(traySystemTimer)
  if (systemHistoryPersistTimer) clearInterval(systemHistoryPersistTimer)
  // Force-flush regardless of dirty flag so the latest 5s sample lands.
  systemHistoryDirty = true
  persistSystemHistory()
  if (autoExportInterval) clearInterval(autoExportInterval)
  autoExport() // One final export on quit
})
