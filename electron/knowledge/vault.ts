// The one Obsidian vault service. HTTP (/api/knowledge/*), MCP (obsidian_*)
// and the research narrative store all go through this class, so path
// confinement, paging bounds, note identity and write rules live here only.
//
// Writes are limited to the primary (configured) vault, Markdown only, never
// into hidden/config folders or protected generated files, always atomic and
// revision-checked for updates.

import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { bodyOf, composeNote, parseNote, type Properties, type PropertyValue } from './frontmatter.js'
import { DEFAULT_REGISTRY_PATHS, DEFAULT_VAULT_ROOT, isDir, obsidianUri, readRegistry, resolveMarsRoot } from './vault-discovery.js'
import { VaultError, cleanProperties, createExclusive, isGenerated, parseCanvas, replaceAtomic, revisionOf, rewrite, sanitizeTitle, withoutKeys } from './vault-files.js'

export { DEFAULT_REGISTRY_PATHS, DEFAULT_VAULT_ROOT, obsidianSearchUri, obsidianUri, resolveMarsRoot } from './vault-discovery.js'
export { VaultError, revisionOf, type CanvasEdge, type CanvasNode } from './vault-files.js'

export type VaultSource = 'configured' | 'registry' | 'legacy-mars'
export interface VaultRecord { id: string; name: string; path: string; open: boolean; ts?: number; source: VaultSource; primary: boolean; writable: boolean }
export type FileKind = 'markdown' | 'text' | 'canvas' | 'base' | 'attachment'
export interface NoteRef { vault: string; vaultId: string; id: string | null; path: string; title: string; uri: string }


const READABLE: Record<string, FileKind> = { '.md': 'markdown', '.markdown': 'markdown', '.txt': 'text', '.canvas': 'canvas', '.base': 'base' }
const SKIP_DIRS = new Set(['node_modules', '.trash', '.git', '.obsidian'])
/** Folders owned by generators (root runtime overview, templates). Never written by this service. */
export const PROTECTED_FOLDERS = ['System', 'Templates']
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const MAX_DEPTH = 24
const MAX_READ_BYTES = 2 * 1024 * 1024
const HEAD_BYTES = 16 * 1024
const SEARCH_BYTE_BUDGET = 64 * 1024 * 1024

export interface VaultServiceOptions {
  /** Explicit primary vault root. Defaults to ~/Knowledge/Eightfold when that folder exists. */
  configuredRoot?: string | null
  registryPaths?: string[]
  /** Explicit legacy Mars root (MARS_VAULT_ROOT); otherwise discovered from the registry. */
  legacyMarsRoot?: string | null
  maxFiles?: number
  now?: () => Date
}

interface WalkEntry { path: string; kind: FileKind; size: number; mtimeMs: number }
interface HeadEntry { mtimeMs: number; size: number; id: string | null; type: string | null; cortexRefs: string[]; title: string }

const limitOf = (value?: number) => Math.max(1, Math.min(MAX_LIMIT, Math.trunc(Number.isFinite(value) ? Number(value) : DEFAULT_LIMIT)))
const offsetOf = (cursor?: string | null, offset?: number) => {
  if (offset !== undefined && Number.isInteger(offset) && offset >= 0) return offset
  const parsed = Number.parseInt(cursor || '0', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}
const hashId = (value: string) => createHash('sha1').update(value).digest('hex').slice(0, 12)
const posix = (rel: string) => rel.split(path.sep).join('/')
const extensionsOf = (values?: string[]) => values?.map(value => (value.startsWith('.') ? value : `.${value}`).toLowerCase())
const titleOf = (rel: string) => path.posix.basename(rel).replace(/\.(md|markdown)$/i, '')
const stringList = (value: PropertyValue | undefined): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : typeof value === 'string' && value ? [value] : []

export class KnowledgeVaultService {
  private readonly opts: VaultServiceOptions
  private readonly heads = new Map<string, Map<string, HeadEntry>>()
  constructor(opts: VaultServiceOptions = {}) { this.opts = opts }
  private now(): Date { return this.opts.now?.() ?? new Date() }
  private get maxFiles(): number { return this.opts.maxFiles ?? 20_000 }

  // ─── Vault discovery ────────────────────────────────────

  vaults(): VaultRecord[] {
    const registryPaths = this.opts.registryPaths ?? DEFAULT_REGISTRY_PATHS
    const registry = registryPaths.flatMap(readRegistry).filter(entry => isDir(entry.path))
    const configured = this.opts.configuredRoot === undefined ? (isDir(DEFAULT_VAULT_ROOT) ? DEFAULT_VAULT_ROOT : null) : this.opts.configuredRoot
    const out: VaultRecord[] = []
    const seen = new Set<string>()
    const add = (entry: { id?: string; path: string; open?: boolean; ts?: number }, source: VaultSource, primary: boolean) => {
      const full = path.resolve(entry.path)
      if (seen.has(full) || !isDir(full)) return
      seen.add(full)
      const known = registry.find(item => item.path === full)
      out.push({ id: entry.id ?? known?.id ?? `path-${hashId(full)}`, name: path.basename(full), path: full, open: entry.open ?? known?.open ?? false, ...(entry.ts ?? known?.ts) !== undefined ? { ts: entry.ts ?? known?.ts } : {}, source, primary, writable: primary })
    }
    if (configured) add({ path: configured }, 'configured', true)
    const sorted = [...registry].sort((a, b) => Number(b.open) - Number(a.open) || (b.ts ?? 0) - (a.ts ?? 0) || a.path.localeCompare(b.path))
    for (const entry of sorted) add(entry, 'registry', false)
    const mars = resolveMarsRoot({ envRoot: this.opts.legacyMarsRoot, registryPaths })
    add({ path: mars }, 'legacy-mars', false)
    return out
  }

  primary(): VaultRecord | null { return this.vaults().find(vault => vault.primary) ?? null }

  private pick(vaultId?: string | null): VaultRecord {
    const vaults = this.vaults()
    if (!vaultId) {
      const chosen = vaults.find(vault => vault.primary) ?? vaults.find(vault => vault.open) ?? vaults[0]
      if (!chosen) throw new VaultError(503, 'No Obsidian vault is available.')
      return chosen
    }
    const match = vaults.find(vault => vault.id === vaultId || vault.name === vaultId)
    if (!match) throw new VaultError(404, `No Obsidian vault matches "${vaultId}".`)
    return match
  }

  private writableVault(vaultId?: string | null): VaultRecord {
    const vault = vaultId ? this.pick(vaultId) : this.primary()
    if (!vault) throw new VaultError(503, 'The knowledge vault is not available.')
    if (!vault.writable) throw new VaultError(403, `Vault "${vault.name}" is read-only here.`)
    return vault
  }

  ref(vault: VaultRecord, rel: string, id: string | null): NoteRef {
    return { vault: vault.name, vaultId: vault.id, id, path: rel, title: titleOf(rel), uri: obsidianUri(vault.name, rel) }
  }

  // ─── Path confinement ───────────────────────────────────

  private segments(rel: string): string[] {
    if (typeof rel !== 'string' || !rel.trim() || rel.length > 1_000 || rel.includes('\0')) throw new VaultError(400, 'A vault-relative path is required.')
    const clean = rel.replaceAll('\\', '/')
    if (clean.startsWith('/') || /^[A-Za-z]:/.test(clean)) throw new VaultError(400, 'Path stays inside the vault.')
    const parts = clean.split('/').filter(part => part && part !== '.')
    if (!parts.length || parts.includes('..')) throw new VaultError(400, 'Path stays inside the vault.')
    if (parts.some(part => part.startsWith('.') || SKIP_DIRS.has(part))) throw new VaultError(403, 'Obsidian hidden or config paths are not accessible.')
    return parts
  }

  /** Resolve an existing file, rejecting traversal, hidden paths and symlink escapes. */
  private existing(vault: VaultRecord, rel: string): { full: string; rel: string } {
    const parts = this.segments(rel)
    const rootReal = fs.realpathSync(vault.path)
    let real: string
    try { real = fs.realpathSync(path.join(vault.path, ...parts)) } catch { throw new VaultError(404, `No file found at "${rel}".`) }
    if (real !== rootReal && !real.startsWith(rootReal + path.sep)) throw new VaultError(403, 'Path symlink escapes the vault.')
    const realRel = path.relative(rootReal, real)
    if (realRel.split(path.sep).some(part => part.startsWith('.') || SKIP_DIRS.has(part))) throw new VaultError(403, 'Obsidian hidden or config paths are not accessible.')
    if (!fs.statSync(real).isFile()) throw new VaultError(404, `No file found at "${rel}".`)
    return { full: real, rel: parts.join('/') }
  }

  /** Resolve a path for writing: every existing ancestor must be a real directory inside the vault. */
  private writeTarget(vault: VaultRecord, rel: string): { full: string; rel: string } {
    const parts = this.segments(rel)
    if (!/\.md$/i.test(parts.at(-1)!)) throw new VaultError(400, 'Only Markdown notes can be written.')
    if (PROTECTED_FOLDERS.some(folder => folder.toLowerCase() === parts[0].toLowerCase())) throw new VaultError(403, `"${parts[0]}" is generated and protected.`)
    const rootReal = fs.realpathSync(vault.path)
    let current = rootReal
    for (const part of parts.slice(0, -1)) {
      current = path.join(current, part)
      let stat: fs.Stats
      try { stat = fs.lstatSync(current) } catch { continue }
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new VaultError(403, 'Path symlink escapes the vault.')
    }
    const full = path.join(rootReal, ...parts)
    try { if (fs.lstatSync(full).isSymbolicLink()) throw new VaultError(403, 'Path symlink escapes the vault.') } catch (error) { if (error instanceof VaultError) throw error }
    return { full, rel: parts.join('/') }
  }

  // ─── Bounded walk ───────────────────────────────────────

  private walk(vault: VaultRecord, folder?: string): { files: WalkEntry[]; truncated: boolean } {
    const files: WalkEntry[] = []
    let truncated = false
    const root = fs.realpathSync(vault.path)
    const start = folder ? path.join(root, ...this.segments(folder)) : root
    const visit = (dir: string, depth: number) => {
      if (truncated) return
      if (depth > MAX_DEPTH) { truncated = true; return }
      let entries: fs.Dirent[]
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      entries.sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of entries) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) { visit(full, depth + 1); if (truncated) return; continue }
        // Symlinked files and directories are skipped while listing; reads re-check confinement.
        if (!entry.isFile()) continue
        if (files.length >= this.maxFiles) { truncated = true; return }
        let stat: fs.Stats
        try { stat = fs.statSync(full) } catch { continue }
        const rel = posix(path.relative(root, full))
        files.push({ path: rel, kind: READABLE[path.extname(rel).toLowerCase()] ?? 'attachment', size: stat.size, mtimeMs: stat.mtimeMs })
      }
    }
    if (isDir(start)) {
      const real = fs.realpathSync(start)
      if (real !== root && !real.startsWith(root + path.sep)) throw new VaultError(403, 'Path symlink escapes the vault.')
      visit(start, 0)
    }
    files.sort((a, b) => a.path.localeCompare(b.path))
    return { files, truncated }
  }

  /** Frontmatter heads for Markdown notes, cached by mtime+size. */
  private noteHeads(vault: VaultRecord, folder?: string): { notes: (HeadEntry & { path: string })[]; truncated: boolean } {
    const { files, truncated } = this.walk(vault, folder)
    let cache = this.heads.get(vault.path)
    if (!cache) { cache = new Map(); this.heads.set(vault.path, cache) }
    const root = fs.realpathSync(vault.path)
    const notes: (HeadEntry & { path: string })[] = []
    for (const file of files) {
      if (file.kind !== 'markdown') continue
      let head = cache.get(file.path)
      if (!head || head.mtimeMs !== file.mtimeMs || head.size !== file.size) {
        let raw = ''
        try {
          const fd = fs.openSync(path.join(root, file.path), 'r')
          try { const buffer = Buffer.alloc(Math.min(HEAD_BYTES, file.size)); fs.readSync(fd, buffer, 0, buffer.length, 0); raw = buffer.toString('utf8') } finally { fs.closeSync(fd) }
        } catch { continue }
        const { properties } = parseNote(raw)
        head = { mtimeMs: file.mtimeMs, size: file.size, id: typeof properties.id === 'string' && properties.id ? properties.id : null, type: typeof properties.type === 'string' ? properties.type : null, cortexRefs: stringList(properties.cortex_refs), title: titleOf(file.path) }
        cache.set(file.path, head)
      }
      notes.push({ ...head, path: file.path })
    }
    return { notes, truncated }
  }

  // ─── Public read API ────────────────────────────────────

  listVaults() {
    return {
      primary: this.primary()?.id ?? null,
      vaults: this.vaults().map(vault => {
        const { files, truncated } = this.walk(vault)
        const counts = { contentFiles: files.length, markdown: 0, text: 0, canvas: 0, base: 0, attachments: 0 }
        for (const file of files) { if (file.kind === 'attachment') counts.attachments++; else counts[file.kind]++ }
        return { ...vault, counts, truncated }
      }),
    }
  }

  listFiles(opts: { vault?: string; query?: string; extensions?: string[]; folder?: string; limit?: number; cursor?: string } = {}) {
    const vault = this.pick(opts.vault)
    const query = opts.query?.trim().toLowerCase()
    const exts = extensionsOf(opts.extensions)
    const walked = this.walk(vault, opts.folder), truncated = walked.truncated
    let files = walked.files
    if (query) files = files.filter(file => file.path.toLowerCase().includes(query))
    if (exts?.length) files = files.filter(file => exts.includes(path.extname(file.path).toLowerCase()))
    const start = offsetOf(opts.cursor), limit = limitOf(opts.limit)
    return {
      vaultId: vault.id, vault: vault.name,
      files: files.slice(start, start + limit).map(file => ({ path: file.path, kind: file.kind, size: file.size, mtime: new Date(file.mtimeMs).toISOString(), ...(file.kind === 'markdown' ? { uri: obsidianUri(vault.name, file.path) } : {}) })),
      nextCursor: start + limit < files.length ? String(start + limit) : null, total: files.length, truncated,
    }
  }

  search(opts: { query: string; vault?: string; extensions?: string[]; limit?: number; cursor?: string }) {
    const vault = this.pick(opts.vault)
    const query = typeof opts.query === 'string' ? opts.query.trim().toLowerCase() : ''
    if (!query || query.length > 500) throw new VaultError(400, 'A search query of up to 500 characters is required.')
    const start = offsetOf(opts.cursor), limit = limitOf(opts.limit), wanted = start + limit + 1
    const exts = extensionsOf(opts.extensions)
    const { files, truncated: walkTruncated } = this.walk(vault)
    const root = fs.realpathSync(vault.path)
    const matches: Record<string, unknown>[] = []
    let budget = SEARCH_BYTE_BUDGET, truncated = walkTruncated
    const push = (match: Record<string, unknown>) => { matches.push({ vaultId: vault.id, ...match }); return matches.length >= wanted }
    outer: for (const file of files) {
      if (exts?.length && !exts.includes(path.extname(file.path).toLowerCase())) continue
      if (file.path.toLowerCase().includes(query) && push({ path: file.path, kind: 'filename', snippet: file.path })) break
      if (file.kind === 'attachment') continue
      if (file.size > MAX_READ_BYTES) continue
      if ((budget -= file.size) < 0) { truncated = true; break }
      let raw: string
      try { raw = fs.readFileSync(path.join(root, file.path), 'utf8') } catch { continue }
      if (file.kind === 'canvas') {
        for (const node of parseCanvas(raw).nodes) {
          const text = typeof node.text === 'string' ? node.text : typeof node.label === 'string' ? node.label : ''
          if (text.toLowerCase().includes(query) && push({ path: file.path, kind: 'canvas-node', nodeId: node.id, snippet: text.slice(0, 240) })) break outer
        }
        continue
      }
      const lines = raw.split('\n')
      for (let index = 0; index < lines.length; index++) {
        if (lines[index].toLowerCase().includes(query) && push({ path: file.path, kind: 'text', line: index + 1, snippet: lines[index].trim().slice(0, 240), ...(file.kind === 'markdown' ? { uri: obsidianUri(vault.name, file.path) } : {}) })) break outer
      }
    }
    const more = matches.length > start + limit
    return { vaultId: vault.id, vault: vault.name, query: opts.query, matches: matches.slice(start, start + limit), nextCursor: more ? String(start + limit) : null, truncated }
  }

  read(opts: { path?: string; id?: string; vault?: string; limit?: number; cursor?: string; offset?: number; includeText?: boolean }) {
    const vault = this.pick(opts.vault)
    const rel = this.locate(vault, opts)
    const { full, rel: clean } = this.existing(vault, rel)
    const kind = READABLE[path.extname(clean).toLowerCase()]
    if (!kind) throw new VaultError(400, 'Only Markdown, text, Base and Canvas files can be read.')
    const stat = fs.statSync(full)
    if (stat.size > MAX_READ_BYTES) throw new VaultError(413, 'The file is too large to read through this service.')
    const raw = fs.readFileSync(full, 'utf8')
    const start = offsetOf(opts.cursor, opts.offset), limit = limitOf(opts.limit)
    const base = { vaultId: vault.id, vault: vault.name, path: clean, kind, revision: revisionOf(raw), mtime: new Date(stat.mtimeMs).toISOString() }
    if (kind === 'canvas') {
      const parsed = parseCanvas(raw)
      const nodes = parsed.nodes.slice(start, start + limit).map(node => {
        const { text, ...rest } = node
        return opts.includeText && text !== undefined ? { ...rest, text } : rest
      })
      const ids = new Set(nodes.map(node => node.id))
      const edges = parsed.edges.filter(edge => ids.has(edge.fromNode) || ids.has(edge.toNode))
      return { ...base, nodes, edges, nextCursor: start + limit < parsed.nodes.length ? String(start + limit) : null, totalNodes: parsed.nodes.length, totalEdges: parsed.edges.length }
    }
    const parsed = kind === 'markdown' ? parseNote(raw) : null
    const lines = raw.replace(/\n$/, '').split('\n')
    return {
      ...base,
      ...(parsed ? { note: this.ref(vault, clean, typeof parsed.properties.id === 'string' && parsed.properties.id ? parsed.properties.id : null), properties: parsed.properties } : {}),
      lines: lines.slice(start, start + limit), nextCursor: start + limit < lines.length ? String(start + limit) : null, totalLines: lines.length,
    }
  }

  private locate(vault: VaultRecord, opts: { path?: string; id?: string }): string {
    if (opts.path) return opts.path
    if (!opts.id || typeof opts.id !== 'string') throw new VaultError(400, 'A path or note id is required.')
    const found = this.noteHeads(vault).notes.filter(note => note.id === opts.id)
    if (!found.length) throw new VaultError(404, `No note has id "${opts.id}".`)
    if (found.length > 1) throw new VaultError(409, `More than one note has id "${opts.id}".`, { paths: found.map(note => note.path) })
    return found[0].path
  }

  /** Notes whose `cortex_refs` property contains the given Cortex record reference. */
  notesForRef(cortexRef: string, opts: { vault?: string; limit?: number } = {}): NoteRef[] {
    const vault = this.pick(opts.vault)
    return this.noteHeads(vault).notes.filter(note => note.cortexRefs.includes(cortexRef)).slice(0, limitOf(opts.limit)).map(note => this.ref(vault, note.path, note.id))
  }

  /** The vault Home note: `type: home`, else Home.md at the root. */
  homeNote(opts: { vault?: string } = {}): NoteRef | null {
    const vault = this.pick(opts.vault)
    const notes = this.noteHeads(vault).notes
    const home = notes.find(note => note.type === 'home') ?? notes.find(note => note.path.toLowerCase() === 'home.md')
    return home ? this.ref(vault, home.path, home.id) : null
  }

  // ─── Notes for adapters (primary vault) ─────────────────

  /** Full notes under a folder of the primary vault, optionally filtered by `type`. */
  readNotes(folder: string, type?: string): { ref: NoteRef; properties: Properties; body: string; revision: string; complex: boolean }[] {
    const vault = this.writableVault()
    const { notes, truncated } = this.noteHeads(vault, folder)
    if (truncated) throw new VaultError(413, `Too many files under "${folder}".`)
    const out = []
    for (const head of notes) {
      if (type && head.type !== type) continue
      const { full } = this.existing(vault, head.path)
      if (fs.statSync(full).size > MAX_READ_BYTES) continue
      const raw = fs.readFileSync(full, 'utf8'), parsed = parseNote(raw)
      out.push({ ref: this.ref(vault, head.path, head.id), properties: parsed.properties, body: bodyOf(parsed), revision: revisionOf(raw), complex: parsed.complex })
    }
    return out
  }

  // ─── Writes ─────────────────────────────────────────────

  capture(opts: { title: string; body?: string; folder?: string; properties?: Record<string, unknown>; vault?: string }): NoteRef & { revision: string } {
    const vault = this.writableVault(opts.vault)
    const title = sanitizeTitle(opts.title)
    const body = typeof opts.body === 'string' ? opts.body : ''
    const folder = (opts.folder ?? 'Inbox').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
    const extra = cleanProperties(opts.properties)
    const now = this.now().toISOString()
    const properties: Properties = { id: typeof extra.id === 'string' && /^[A-Za-z0-9._:-]{3,120}$/.test(extra.id) ? extra.id : `note-${randomUUID()}`, type: 'note', ...withoutKeys(extra, ['id', 'created', 'updated']), created: now, updated: now }
    if (this.noteHeads(vault).notes.some(note => note.id === properties.id)) throw new VaultError(409, `A note with id "${properties.id}" already exists.`)
    const content = composeNote(properties, body)
    for (let attempt = 1; attempt <= 50; attempt++) {
      const name = attempt === 1 ? `${title}.md` : `${title} ${attempt}.md`
      const target = this.writeTarget(vault, folder ? `${folder}/${name}` : name)
      if (createExclusive(target.full, content)) return { ...this.ref(vault, target.rel, String(properties.id)), revision: revisionOf(content) }
    }
    throw new VaultError(409, 'Could not find a free file name for this note.')
  }

  /** Create a note at an exact path. Fails if the path exists. */
  createAt(rel: string, properties: Properties, body: string): NoteRef & { revision: string } {
    const vault = this.writableVault()
    const target = this.writeTarget(vault, rel)
    const content = composeNote(properties, body)
    if (!createExclusive(target.full, content)) throw new VaultError(409, `A file already exists at "${target.rel}".`)
    return { ...this.ref(vault, target.rel, typeof properties.id === 'string' ? properties.id : null), revision: revisionOf(content) }
  }

  updateNote(opts: { path?: string; id?: string; baseRevision: string; body?: string; properties?: Record<string, unknown>; vault?: string }): NoteRef & { revision: string } {
    const vault = this.writableVault(opts.vault)
    if (typeof opts.baseRevision !== 'string' || !/^[a-f0-9]{64}$/.test(opts.baseRevision)) throw new VaultError(400, 'baseRevision from a previous read is required.')
    if (opts.body === undefined && opts.properties === undefined) throw new VaultError(400, 'Nothing to update.')
    if (opts.body !== undefined && typeof opts.body !== 'string') throw new VaultError(400, 'body must be text.')
    const rel = this.locate(vault, opts)
    const { rel: clean } = this.existing(vault, rel)
    const target = this.writeTarget(vault, clean)
    const raw = fs.readFileSync(target.full, 'utf8')
    const current = revisionOf(raw)
    if (current !== opts.baseRevision) throw new VaultError(409, 'The note changed since it was read.', { revision: current })
    const parsed = parseNote(raw)
    if (isGenerated(parsed)) throw new VaultError(403, 'This note is generated and protected.')
    const next = rewrite(parsed, { body: opts.body, properties: opts.properties === undefined ? undefined : cleanProperties(opts.properties, true), now: this.now().toISOString() })
    replaceAtomic(target.full, next, current)
    const id = parseNote(next).properties.id
    return { ...this.ref(vault, target.rel, typeof id === 'string' && id ? id : null), revision: revisionOf(next) }
  }
}

