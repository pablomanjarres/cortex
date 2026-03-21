import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { getTodayEvents } from './calendar.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

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

function createTray() {
  const iconPath = isDev
    ? path.join(__dirname, '../build/trayTemplate.png')
    : path.join(process.resourcesPath, 'build/trayTemplate.png')

  const icon = nativeImage.createFromPath(iconPath)
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('Cortex')

  const contextMenu = Menu.buildFromTemplate([
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
      label: 'Daily',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.webContents.send('navigate', '/daily')
        }
      },
    },
    {
      label: 'Habits',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.webContents.send('navigate', '/habits')
        }
      },
    },
    {
      label: 'Content',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.webContents.send('navigate', '/content')
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Cortex',
      accelerator: 'CommandOrControl+Q',
      click: () => app.quit(),
    },
  ])

  tray.setContextMenu(contextMenu)

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

app.on('ready', () => {
  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  // On macOS, keep running in tray when window is closed
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
