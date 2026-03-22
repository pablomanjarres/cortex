import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, clipboard } from 'electron'
import path from 'path'
import http from 'http'
import os from 'os'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { getTodayEvents } from './calendar.js'
import { saveKey, getKey, deleteKey, hasKey, listKeys } from './keychain.js'
import { getGitHubStats } from './integrations/github.js'
import { getLemonStats } from './integrations/lemon.js'
import { getVercelStats } from './integrations/vercel.js'
import { getSupabaseStats } from './integrations/supabase.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let webServer: http.Server | null = null
let currentStats = { tasks: '0/0', habits: '0/0', score: '—' }
const WEB_PORT = 3456

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

function buildTrayMenu() {
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
    {
      label: 'Core',
      submenu: [
        { label: 'Daily Overview', click: () => showAndNavigate('/daily') },
        { label: 'Habits', click: () => showAndNavigate('/habits') },
      ],
    },
    {
      label: 'Roles',
      submenu: [
        { label: 'Founder', click: () => showAndNavigate('/founder') },
        { label: 'Student', click: () => showAndNavigate('/student') },
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
}

function startWebServer() {
  if (webServer) return
  const distPath = path.join(__dirname, '../dist')
  webServer = http.createServer((req, res) => {
    let filePath = path.join(distPath, req.url === '/' ? '/index.html' : req.url!)
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

// ─── IPC: Tray stats ──────────────────────────────────────

ipcMain.on('tray:updateStats', (_event, stats) => {
  currentStats = stats
  if (tray) tray.setContextMenu(buildTrayMenu())
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
  try { return await getGitHubStats(token) } catch (e: any) { return { error: `GitHub: ${e.message}` } }
})

// ─── IPC: Lemon Squeezy ───────────────────────────────────

ipcMain.handle('lemon:getStats', async () => {
  const apiKey = getKey('lemon-api-key')
  const storeId = getKey('lemon-store-id')
  if (!apiKey) return { error: 'No Lemon API key saved' }
  if (!storeId) return { error: 'No Lemon Store ID saved' }
  try { return await getLemonStats(apiKey, storeId) } catch (e: any) { return { error: `Lemon: ${e.message}` } }
})

// ─── IPC: Vercel ───────────────────────────────────────────

ipcMain.handle('vercel:getStats', async () => {
  const token = getKey('vercel-token')
  if (!token) return null
  try { return await getVercelStats(token) } catch (e) { console.error('Vercel error:', e); return null }
})

// ─── IPC: Supabase ─────────────────────────────────────────

ipcMain.handle('supabase:getStats', async () => {
  const url = getKey('supabase-url')
  const key = getKey('supabase-service-key')
  if (!url || !key) return null
  try { return await getSupabaseStats(url, key) } catch (e) { console.error('Supabase error:', e); return null }
})

// ─── Data persistence (JSON files in project data/) ───────

// In dev: data/ in project root (caught by hourly backup)
// In prod: also use project root via a symlink-friendly path
const dataDir = isDev
  ? path.join(__dirname, '..', 'data')
  : path.join(app.getPath('home'), 'Projects', 'life-audit-dashboard', 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const backupDir = path.join(dataDir, 'backups')
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

ipcMain.handle('data:read', async (_event, key: string) => {
  const file = path.join(dataDir, `${key}.json`)
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) {
    console.warn(`[Cortex] data:read: main file corrupt for "${key}", falling back to backup...`)
    // Fallback: try the .bak.json from backups directory
    try {
      const bakFile = path.join(backupDir, `${key}.bak.json`)
      if (fs.existsSync(bakFile)) {
        const data = JSON.parse(fs.readFileSync(bakFile, 'utf-8'))
        console.warn(`[Cortex] data:read: successfully recovered "${key}" from backup`)
        return data
      }
    } catch (bakErr) {
      console.error(`[Cortex] data:read: backup also failed for "${key}":`, bakErr)
    }
  }
  return null
})

ipcMain.handle('data:write', async (_event, key: string, data: unknown) => {
  const file = path.join(dataDir, `${key}.json`)
  const tmpFile = path.join(dataDir, `${key}.json.tmp`)
  try {
    // Keep .bak of previous version
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(backupDir, `${key}.bak.json`))
    }
    // Atomic write: write to .tmp first, then rename to prevent partial writes on crash
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmpFile, file)
    return true
  } catch (e) { console.error(`data:write error for ${key}:`, e); return false }
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
      _meta: { version: '1.0', exported: new Date().toISOString(), app: 'Cortex', dataDir }
    }
    for (const f of files) {
      const key = f.replace('.json', '')
      bundle[key] = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'))
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
    // Write imported data
    let count = 0
    for (const [key, value] of Object.entries(bundle)) {
      if (key === '_meta') continue
      fs.writeFileSync(path.join(dataDir, `${key}.json`), JSON.stringify(value, null, 2), 'utf-8')
      count++
    }
    return { success: true, count }
  } catch (e) { console.error('data:importAll error:', e); return { success: false, error: String(e) } }
})

ipcMain.handle('data:getPath', async () => dataDir)

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
      try { bundle[key] = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8')) } catch { /* skip corrupted */ }
    }
    fs.writeFileSync(path.join(backupDir, 'cortex-backup-latest.json'), JSON.stringify(bundle, null, 2), 'utf-8')
    console.log(`[Cortex] Auto-export: ${files.length} stores saved to data/backups/cortex-backup-latest.json`)
  } catch (e) { console.error('[Cortex] Auto-export failed:', e) }
}

let autoExportInterval: ReturnType<typeof setInterval> | null = null

// ─── App lifecycle ─────────────────────────────────────────

app.on('ready', () => {
  createWindow()
  createTray()
  cleanupOldDailyFiles()
  // Auto-export on startup + every 30 minutes
  setTimeout(autoExport, 5000)
  autoExportInterval = setInterval(autoExport, 30 * 60 * 1000)
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (mainWindow === null) createWindow() })
app.on('before-quit', () => {
  if (autoExportInterval) clearInterval(autoExportInterval)
  autoExport() // One final export on quit
})
