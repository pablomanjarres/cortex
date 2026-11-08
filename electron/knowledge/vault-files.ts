// File-level primitives for vault writes: atomic exclusive create, atomic
// revision-checked replace, note rewriting and input sanitizing, plus the
// cloud placeholder check that keeps reads from waiting on iCloud downloads.

import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { bodyOf, composeNote, isPropertyValue, serializeProperties, type ParsedNote, type Properties } from './frontmatter.js'

export class VaultError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 413 | 503
  readonly details?: Record<string, unknown>
  constructor(status: VaultError['status'], message: string, details?: Record<string, unknown>) { super(message); this.status = status; this.details = details }
}

export const MAX_WRITE_BYTES = 1024 * 1024
export const revisionOf = (raw: string) => createHash('sha256').update(raw).digest('hex')

/**
 * A cloud placeholder, such as an iCloud Drive file evicted to save space: its
 * size is known but none of its bytes are on disk. Reading one blocks until the
 * download finishes, which can take hours, so callers must never read it inline.
 */
export const isPlaceholder = (stat: Pick<fs.Stats, 'size' | 'blocks'>) => stat.size > 0 && stat.blocks === 0

const ICLOUD_DRIVE = `${path.sep}Library${path.sep}Mobile Documents${path.sep}`

/** Ask iCloud Drive to download a placeholder in the background. Never waits. */
export function requestDownload(full: string): void {
  if (process.platform !== 'darwin' || !full.includes(ICLOUD_DRIVE)) return
  try {
    const child = spawn('/usr/bin/brctl', ['download', full], { detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
  } catch {
    // Best effort: the caller already answers without the file.
  }
}

/** The answer for a file whose bytes are still in iCloud: request them and fail fast. */
export function stillInCloud(full: string): VaultError {
  requestDownload(full)
  return new VaultError(503, 'This file is still in iCloud. Its download was requested; try again shortly.')
}

export interface CanvasNode { id: string; type?: string; x?: number; y?: number; width?: number; height?: number; text?: string; label?: string; [key: string]: unknown }
export interface CanvasEdge { id: string; fromNode: string; toNode: string; [key: string]: unknown }
export function parseCanvas(raw: string): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new VaultError(400, 'The Canvas file is not valid JSON.') }
  const row = parsed && typeof parsed === 'object' ? parsed as { nodes?: unknown; edges?: unknown } : {}
  return { nodes: Array.isArray(row.nodes) ? row.nodes.filter(node => node && typeof node === 'object') as CanvasNode[] : [], edges: Array.isArray(row.edges) ? row.edges.filter(edge => edge && typeof edge === 'object') as CanvasEdge[] : [] }
}

export function sanitizeTitle(raw: unknown): string {
  if (typeof raw !== 'string') throw new VaultError(400, 'A note title is required.')
  const title = raw.replace(/[\\/:*?"<>|#^[\]\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120).trim()
  if (!title) throw new VaultError(400, 'A note title is required.')
  return title
}

export function cleanProperties(raw: unknown, allowNull = false): Properties {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new VaultError(400, 'properties must be an object.')
  const out: Properties = {}
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > 50) throw new VaultError(400, 'Too many properties.')
  for (const [key, value] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_ -]{0,63}$/.test(key)) throw new VaultError(400, `Invalid property name "${key}".`)
    if (value === null && !allowNull) continue
    if (!isPropertyValue(value)) throw new VaultError(400, `Property "${key}" must be text, a number, a boolean or a list of those.`)
    out[key] = value
  }
  return out
}

export function withoutKeys(properties: Properties, keys: string[]): Properties {
  return Object.fromEntries(Object.entries(properties).filter(([key]) => !keys.includes(key)))
}

export function isGenerated(parsed: ParsedNote): boolean {
  return parsed.properties.generated === true || parsed.properties.cortex_generated === true
}

/** New note text: body replaced and/or properties merged (null deletes). `id` and `created` are immutable. */
export function rewrite(parsed: ParsedNote, change: { body?: string; properties?: Properties; now: string }): string {
  const body = change.body ?? bodyOf(parsed)
  if (Buffer.byteLength(body) > MAX_WRITE_BYTES) throw new VaultError(413, 'The note body is too large.')
  if (!parsed.rawFrontmatter) return change.properties ? composeNote(mergeProperties({}, change.properties, change.now), body) : `${body}\n`
  if (change.properties === undefined) return `${parsed.rawFrontmatter}\n${body}\n`
  if (parsed.complex) {
    throw new VaultError(409, 'This note has properties that cannot be edited safely here; edit them in Obsidian.')
  }
  return composeNote(mergeProperties(parsed.properties, change.properties ?? {}, change.now), body)
}

export function mergeProperties(current: Properties, change: Properties, now: string): Properties {
  const next: Properties = { ...current }
  for (const [key, value] of Object.entries(change)) {
    if (key === 'id' || key === 'created') { if (current[key] !== undefined && value !== current[key]) throw new VaultError(400, `Property "${key}" cannot change.`); if (current[key] === undefined && value !== null) next[key] = value; continue }
    if (value === null) delete next[key]
    else next[key] = value
  }
  if ('updated' in next || Object.keys(change).length) next.updated = now
  serializeProperties(next) // validates names
  return next
}

function temporaryFor(full: string): string {
  return path.join(path.dirname(full), `.${path.basename(full)}.${randomUUID().slice(0, 8)}.tmp`)
}

/** Atomically create `full`; returns false if it already exists. Never overwrites. */
export function createExclusive(full: string, content: string): boolean {
  if (Buffer.byteLength(content) > MAX_WRITE_BYTES + 64 * 1024) throw new VaultError(413, 'The note is too large.')
  fs.mkdirSync(path.dirname(full), { recursive: true })
  const temporary = temporaryFor(full)
  fs.writeFileSync(temporary, content, { flag: 'wx' })
  try {
    fs.linkSync(temporary, full)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

/** Atomically replace `full`, re-checking the revision right before the rename. */
export function replaceAtomic(full: string, content: string, expectedRevision: string): void {
  const temporary = temporaryFor(full)
  const mode = fs.statSync(full).mode & 0o777
  fs.writeFileSync(temporary, content, { flag: 'wx', mode })
  try {
    if (revisionOf(fs.readFileSync(full, 'utf8')) !== expectedRevision) throw new VaultError(409, 'The note changed while saving.')
    fs.renameSync(temporary, full)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}
