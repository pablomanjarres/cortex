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
import { MAX_WRITE_BYTES, VaultError, cleanProperties, createExclusive, isGenerated, parseCanvas, replaceAtomic, revisionOf, rewrite, sanitizeTitle, withoutKeys } from './vault-files.js'

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

}
