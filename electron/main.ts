import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { getTodayEvents } from './calendar.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let currentStats = { tasks: '0/0', habits: '0/0', score: '—' }

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
      label: 'Quit Cortex',
      accelerator: 'CommandOrControl+Q',
      click: () => app.quit(),
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
