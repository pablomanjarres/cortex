import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, clipboard } from 'electron'
import path from 'path'
import http from 'http'
import os from 'os'
import fs from 'fs'
import zlib from 'zlib'
import { fileURLToPath } from 'url'
import { getTodayEvents, syncBirthdays, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, getEventsInRange, getCalendarEvent } from './calendar.js'
import type { BirthdayEntry, CreateEventPayload } from './calendar.js'
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
          res.end(fs.readFileSync(file, 'utf-8'))
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
          const tmpFile = path.join(dataDir, `${key}.json.tmp`)
          if (fs.existsSync(file)) {
            fs.copyFileSync(file, path.join(backupDir, `${key}.bak.json`))
          }
          fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8')
          fs.renameSync(tmpFile, file)
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
          try { if (fs.existsSync(automFile)) data = JSON.parse(fs.readFileSync(automFile, 'utf-8')) } catch { /* fresh */ }
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
          fs.writeFileSync(automFile, JSON.stringify(data, null, 2), 'utf-8')

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

    if (url.pathname.match(/^\/api\/automation\/[^/]+\/(approve|reject)$/) && req.method === 'POST') {
      const parts = url.pathname.split('/')
      const runId = parts[3]
      const action = parts[4] as 'approve' | 'reject'
      try {
        const automFile = path.join(dataDir, 'cortex-automations.json')
        if (fs.existsSync(automFile)) {
          const data = JSON.parse(fs.readFileSync(automFile, 'utf-8'))
          const run = data.runs.find((r: any) => r.id === runId)
          if (run) {
            run.status = action === 'approve' ? 'success' : 'error'
            run.approved = action === 'approve'
            fs.writeFileSync(automFile, JSON.stringify(data, null, 2), 'utf-8')
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
        const start = url.searchParams.get('start') || new Date().toISOString().slice(0, 10)
        const end = url.searchParams.get('end') || new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10)
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
    try { fs.writeFileSync(path.join(dataDir, 'cortex-cache-github.json'), JSON.stringify({ data: stats, lastUpdated: new Date().toISOString() }, null, 2)) } catch { /* cache optional */ }
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
    try { fs.writeFileSync(path.join(dataDir, 'cortex-cache-lemon.json'), JSON.stringify({ data: stats, lastUpdated: new Date().toISOString() }, null, 2)) } catch { /* cache optional */ }
    return stats
  } catch (e: any) { return { error: `Lemon: ${e.message}` } }
})

// ─── IPC: Vercel ───────────────────────────────────────────

ipcMain.handle('vercel:getStats', async () => {
  const token = getKey('vercel-token')
  if (!token) return null
  try {
    const stats = await getVercelStats(token)
    try { fs.writeFileSync(path.join(dataDir, 'cortex-cache-vercel.json'), JSON.stringify({ data: stats, lastUpdated: new Date().toISOString() }, null, 2)) } catch { /* cache optional */ }
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
    try { fs.writeFileSync(path.join(dataDir, 'cortex-cache-supabase.json'), JSON.stringify({ data: stats, lastUpdated: new Date().toISOString() }, null, 2)) } catch { /* cache optional */ }
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
    try { fs.writeFileSync(path.join(dataDir, 'cortex-cache-projects.json'), JSON.stringify({ data: sorted, lastUpdated: new Date().toISOString() }, null, 2)) } catch { /* cache optional */ }
    return sorted
  } catch (e) { console.error('[Cortex] projects:scan error:', e); return [] }
})

// ─── Data persistence (JSON files in project data/) ───────

// In dev: data/ in project root. In prod: ~/Projects/cortex/data/
// Never write inside the asar archive.
const dataDir = isDev
  ? path.join(__dirname, '..', 'data')
  : path.join(app.getPath('home'), 'Projects', 'cortex', 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const backupDir = path.join(dataDir, 'backups')
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

ipcMain.handle('data:read', async (_event, key: string) => {
  const file = path.join(dataDir, `${key}.json`)
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) {
    console.warn(`[Cortex] data:read: main file corrupt for "${key}", falling back to backup...`)
    // Fallback 1: try the .bak.json
    try {
      const bakFile = path.join(backupDir, `${key}.bak.json`)
      if (fs.existsSync(bakFile)) {
        const data = JSON.parse(fs.readFileSync(bakFile, 'utf-8'))
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
            const data = JSON.parse(fs.readFileSync(path.join(versionsDir, v), 'utf-8'))
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
  const tmpFile = path.join(dataDir, `${key}.json.tmp`)
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

    // Keep .bak + versioned backup of previous file
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

    // Atomic write: .tmp → rename
    fs.writeFileSync(tmpFile, serialized, 'utf-8')
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
      _meta: { version: '1.0', exported: new Date().toISOString(), app: 'Cortex' }
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
      try { bundle[key] = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8')) } catch { /* skip corrupted */ }
    }
    const json = JSON.stringify(bundle, null, 2)
    fs.writeFileSync(path.join(backupDir, 'cortex-backup-latest.json'), json, 'utf-8')
    // Also save compressed version
    try { fs.writeFileSync(path.join(backupDir, 'cortex-backup-latest.json.gz'), zlib.gzipSync(json)) } catch { /* compression optional */ }
    console.log(`[Cortex] Auto-export: ${files.length} stores saved to data/backups/`)
  } catch (e) { console.error('[Cortex] Auto-export failed:', e) }
}

let autoExportInterval: ReturnType<typeof setInterval> | null = null

// ─── App lifecycle ─────────────────────────────────────────

app.on('ready', () => {
  createWindow()
  createTray()
  startWebServer() // Auto-start web server for iPhone/browser access
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
