import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from 'electron'
import path from 'path'
import http from 'http'
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
        { label: 'Content Hub', click: () => showAndNavigate('/content') },
      ],
    },
    {
      label: 'Life',
      submenu: [
        { label: 'Health & Energy', click: () => showAndNavigate('/health') },
        { label: 'Time & Focus', click: () => showAndNavigate('/focus') },
        { label: 'Finance', click: () => showAndNavigate('/finance') },
        { label: 'Journal', click: () => showAndNavigate('/journal') },
        { label: 'Social', click: () => showAndNavigate('/social') },
        { label: 'Life Admin', click: () => showAndNavigate('/admin') },
      ],
    },
    { label: 'Analytics', click: () => showAndNavigate('/analytics') },
    { label: 'Settings', click: () => showAndNavigate('/settings') },
    { type: 'separator' },
    {
      label: webServer ? `Web: localhost:${WEB_PORT}` : 'Start Web Server',
      click: () => {
        if (!webServer) { startWebServer(); if (tray) tray.setContextMenu(buildTrayMenu()) }
        shell.openExternal(`http://localhost:${WEB_PORT}`)
      },
    },
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
  tray.on('click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus() } else { createWindow() }
  })
}

// ─── Web server ────────────────────────────────────────────

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
  if (!token) return null
  try { return await getGitHubStats(token) } catch (e) { console.error('GitHub error:', e); return null }
})

// ─── IPC: Lemon Squeezy ───────────────────────────────────

ipcMain.handle('lemon:getStats', async () => {
  const apiKey = getKey('lemon-api-key')
  const storeId = getKey('lemon-store-id')
  if (!apiKey || !storeId) return null
  try { return await getLemonStats(apiKey, storeId) } catch (e) { console.error('Lemon error:', e); return null }
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

// ─── App lifecycle ─────────────────────────────────────────

app.on('ready', () => { createWindow(); createTray() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (mainWindow === null) createWindow() })
