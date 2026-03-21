import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from 'electron'
import path from 'path'
import http from 'http'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { getTodayEvents } from './calendar.js'

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
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createWindow()
        }
      },
    },
    { type: 'separator' },
    {
      label: `Tasks: ${currentStats.tasks}`,
      enabled: false,
    },
    {
      label: `Habits: ${currentStats.habits}`,
      enabled: false,
    },
    {
      label: `Score: ${currentStats.score}`,
      enabled: false,
    },
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
    { type: 'separator' },
    {
      label: webServer ? `Web: localhost:${WEB_PORT}` : 'Start Web Server',
      click: () => {
        if (!webServer) {
          startWebServer()
          if (tray) tray.setContextMenu(buildTrayMenu())
        }
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
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
}

// ─── Web server ────────────────────────────────────────────

const mimeTypes: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

function startWebServer() {
  if (webServer) return // already running

  const distPath = isDev
    ? path.join(__dirname, '../dist')
    : path.join(__dirname, '../dist')

  webServer = http.createServer((req, res) => {
    let filePath = path.join(distPath, req.url === '/' ? '/index.html' : req.url!)

    // If file doesn't exist, serve index.html (SPA fallback)
    if (!fs.existsSync(filePath)) {
      filePath = path.join(distPath, 'index.html')
    }

    const ext = path.extname(filePath)
    const contentType = mimeTypes[ext] || 'application/octet-stream'

    try {
      const content = fs.readFileSync(filePath)
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(content)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })

  webServer.listen(WEB_PORT, '0.0.0.0', () => {
    console.log(`Cortex web server running at http://localhost:${WEB_PORT}`)
  })
}

function stopWebServer() {
  if (webServer) {
    webServer.close()
    webServer = null
  }
}

// IPC handlers
ipcMain.handle('calendar:getTodayEvents', async () => {
  return getTodayEvents()
})

ipcMain.on('tray:updateStats', (_event, stats: { tasks: string; habits: string; score: string }) => {
  currentStats = stats
  if (tray) {
    tray.setContextMenu(buildTrayMenu())
  }
})

app.on('ready', () => {
  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
