import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Canonical Mars vault lives in iCloud Drive; the old ~/Projects/Mars/Mars copy is retired.
// MARS_VAULT_ROOT overrides for tests or a moved vault.
const MARS_ROOT =
  process.env.MARS_VAULT_ROOT ||
  path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Mars', 'Mars')
const JOURNAL_DIR = path.join(MARS_ROOT, 'content', 'journal')
const VOICE_ANCHORS_DIR = path.join(MARS_ROOT, 'content', 'voice-anchors')

function todayStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoNow(): string {
  return new Date().toISOString()
}

interface JournalDoc {
  date: string
  path: string
  exists: boolean
  frontmatter: Record<string, unknown>
  body: string
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: raw }
  const fm: Record<string, unknown> = {}
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (m) fm[m[1]] = m[2]
  }
  return { frontmatter: fm, body: match[2] }
}

function ensureJournalDir() {
  if (!fs.existsSync(JOURNAL_DIR)) fs.mkdirSync(JOURNAL_DIR, { recursive: true })
}

export function readJournalDay(date?: string): JournalDoc {
  const d = date || todayStamp()
  const file = path.join(JOURNAL_DIR, `${d}.md`)
  if (!fs.existsSync(file)) {
    return { date: d, path: file, exists: false, frontmatter: {}, body: '' }
  }
  const raw = fs.readFileSync(file, 'utf-8')
  const parsed = parseFrontmatter(raw)
  return { date: d, path: file, exists: true, ...parsed }
}

export function readJournalToday(): JournalDoc {
  return readJournalDay(todayStamp())
}

export function writeJournalLine(text: string, opts?: { date?: string; tag?: string }): { ok: true; path: string } {
  ensureJournalDir()
  const d = opts?.date || todayStamp()
  const file = path.join(JOURNAL_DIR, `${d}.md`)
  const tag = opts?.tag ? `[${opts.tag}] ` : ''
  const stamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  const line = `- ${stamp} ${tag}${text}\n`
  if (!fs.existsSync(file)) {
    const header = `---\ndate: ${d}\ntype: journal\ncreatedAt: ${isoNow()}\n---\n\n# ${d}\n\n`
    fs.writeFileSync(file, header + line)
  } else {
    fs.appendFileSync(file, line)
  }
  return { ok: true, path: file }
}

export interface VaultMatch {
  path: string
  rel: string
  line: number
  snippet: string
}

export function searchVault(query: string, limit = 20): VaultMatch[] {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  const matches: VaultMatch[] = []
  const contentRoot = path.join(MARS_ROOT, 'content')
  if (!fs.existsSync(contentRoot)) return matches

  const walk = (dir: string) => {
    if (matches.length >= limit) return
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (matches.length >= limit) return
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue
        walk(full)
      } else if (e.isFile() && e.name.endsWith('.md')) {
        let raw: string
        try { raw = fs.readFileSync(full, 'utf-8') } catch { continue }
        const lines = raw.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= limit) break
          if (lines[i].toLowerCase().includes(q)) {
            matches.push({
              path: full,
              rel: path.relative(MARS_ROOT, full),
              line: i + 1,
              snippet: lines[i].trim().slice(0, 200),
            })
          }
        }
      }
    }
  }
  walk(contentRoot)
  return matches
}

export interface VoiceAnchor {
  name: string
  path: string
  body: string
}

export function readVoiceAnchors(): VoiceAnchor[] {
  if (!fs.existsSync(VOICE_ANCHORS_DIR)) return []
  const entries = fs.readdirSync(VOICE_ANCHORS_DIR).filter(f => f.endsWith('.md'))
  return entries.map(f => {
    const full = path.join(VOICE_ANCHORS_DIR, f)
    return {
      name: f.replace(/\.md$/, ''),
      path: full,
      body: fs.readFileSync(full, 'utf-8'),
    }
  })
}

export interface VaultStats {
  root: string
  totalNotes: number
  byFolder: Record<string, number>
  recentNotes: { rel: string; mtime: string }[]
}

export function vaultStats(): VaultStats {
  const root = path.join(MARS_ROOT, 'content')
  const stats: VaultStats = { root, totalNotes: 0, byFolder: {}, recentNotes: [] }
  if (!fs.existsSync(root)) return stats

  const all: { rel: string; mtimeMs: number; folder: string }[] = []
  const walk = (dir: string) => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue
        walk(full)
      } else if (e.isFile() && e.name.endsWith('.md')) {
        const rel = path.relative(MARS_ROOT, full)
        const folder = path.relative(root, dir).split(path.sep)[0] || 'root'
        const m = fs.statSync(full).mtimeMs
        all.push({ rel, mtimeMs: m, folder })
      }
    }
  }
  walk(root)
  stats.totalNotes = all.length
  for (const n of all) stats.byFolder[n.folder] = (stats.byFolder[n.folder] || 0) + 1
  stats.recentNotes = all
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 10)
    .map(n => ({ rel: n.rel, mtime: new Date(n.mtimeMs).toISOString() }))
  return stats
}
