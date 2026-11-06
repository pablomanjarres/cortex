// /api/knowledge/* routes. The caller (main.ts web server) has already applied
// the localhost + Tailscale socket gate; vault writes and the migration are
// additionally limited to loopback connections (the local MCP server and
// runtime), matching the other import/write-sensitive routes.

import type http from 'node:http'
import { readKnowledgeHealth } from './health.js'
import { parseCortexRef, cortexRecordUrl, type KnowledgeLinkResult } from './refs.js'
import { buildKnowledgeSummary, type SummaryInputs } from './summary.js'
import { VaultError, obsidianSearchUri, type KnowledgeVaultService } from './vault.js'

export interface KnowledgeHttpDeps {
  vault: KnowledgeVaultService
  isLoopback(remote: string): boolean
  readBody(req: http.IncomingMessage, res: http.ServerResponse): Promise<string | null>
  /** Web origin for Cortex record URLs. */
  origin(): string
  summaryInputs(): Promise<Omit<SummaryInputs, 'now' | 'origin' | 'vault'>>
  migrateResearch(dryRun: boolean): Promise<unknown>
  healthFile?: string
}

const list = (value: string | null) => value ? value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 20) : undefined
const int = (value: string | null) => value === null || value === '' ? undefined : Number.parseInt(value, 10)

/** Resolve a Cortex record reference to vault notes, the Obsidian URI to open, and the Cortex URL. */
export function resolveKnowledgeLink(vault: KnowledgeVaultService, ref: string, origin: string): KnowledgeLinkResult {
  const parsed = parseCortexRef(ref)
  if (!parsed) throw new VaultError(400, 'A valid Cortex record reference is required.')
  const primary = vault.primary()
  if (!primary) return { ref, available: false, notes: [], uri: null, cortexUrl: cortexRecordUrl(origin, ref) }
  const notes = parsed.kind === 'home' ? [vault.homeNote()].filter(note => note !== null) : vault.notesForRef(ref, { limit: 10 })
  return { ref, available: true, vault: primary.name, notes, uri: notes[0]?.uri ?? obsidianSearchUri(primary.name, parsed.kind === 'home' ? 'Home' : ref), cortexUrl: cortexRecordUrl(origin, ref) }
}

export async function handleKnowledgeRequest(req: http.IncomingMessage, res: http.ServerResponse, url: URL, remote: string, deps: KnowledgeHttpDeps): Promise<boolean> {
  if (!url.pathname.startsWith('/api/knowledge/')) return false
  const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
  const route = `${req.method} ${url.pathname}`
  const q = url.searchParams
  const body = async (): Promise<Record<string, unknown> | null> => {
    const raw = await deps.readBody(req, res)
    if (raw === null) return null
    try { const parsed: unknown = JSON.parse(raw || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown> } catch { /* answered below */ }
    json(400, { error: 'Invalid JSON object' })
    return null
  }
  const localOnly = () => { if (deps.isLoopback(remote)) return true; json(403, { error: 'Vault writes require a local connection' }); return false }
  try {
    switch (route) {
      case 'GET /api/knowledge/vaults': json(200, deps.vault.listVaults()); break
      case 'GET /api/knowledge/files': json(200, deps.vault.listFiles({ vault: q.get('vault') ?? undefined, query: q.get('query') ?? undefined, extensions: list(q.get('extensions')), folder: q.get('folder') ?? undefined, limit: int(q.get('limit')), cursor: q.get('cursor') ?? undefined })); break
      case 'GET /api/knowledge/search': json(200, deps.vault.search({ query: q.get('q') ?? q.get('query') ?? '', vault: q.get('vault') ?? undefined, extensions: list(q.get('extensions')), limit: int(q.get('limit')), cursor: q.get('cursor') ?? undefined })); break
      case 'GET /api/knowledge/read': json(200, deps.vault.read({ path: q.get('path') ?? undefined, id: q.get('id') ?? undefined, vault: q.get('vault') ?? undefined, limit: int(q.get('limit')), cursor: q.get('cursor') ?? undefined, offset: int(q.get('offset')), includeText: q.get('includeText') === 'true' })); break
      case 'GET /api/knowledge/links': json(200, resolveKnowledgeLink(deps.vault, q.get('ref') ?? '', deps.origin())); break
      case 'GET /api/knowledge/health': json(200, readKnowledgeHealth(deps.healthFile)); break
      case 'GET /api/knowledge/summary': {
        const primary = deps.vault.primary()
        let homeUri: string | null = null
        if (primary) { try { homeUri = deps.vault.homeNote()?.uri ?? null } catch { homeUri = null } }
        json(200, buildKnowledgeSummary({ ...(await deps.summaryInputs()), now: new Date(), origin: deps.origin(), vault: primary ? { name: primary.name, homeUri } : null }))
        break
      }
      case 'POST /api/knowledge/capture': {
        if (!localOnly()) break
        const input = await body()
        if (!input) break
        json(200, deps.vault.capture({ title: input.title as string, body: input.body as string | undefined, folder: input.folder as string | undefined, properties: input.properties as Record<string, unknown> | undefined, vault: input.vault as string | undefined }))
        break
      }
      case 'POST /api/knowledge/update': {
        if (!localOnly()) break
        const input = await body()
        if (!input) break
        json(200, deps.vault.updateNote({ path: input.path as string | undefined, id: input.id as string | undefined, baseRevision: input.baseRevision as string, body: input.body as string | undefined, properties: input.properties as Record<string, unknown> | undefined, vault: input.vault as string | undefined }))
        break
      }
      case 'POST /api/knowledge/migrate/research': {
        if (!localOnly()) break
        const input = await body()
        if (!input) break
        json(200, await deps.migrateResearch(input.dryRun === true))
        break
      }
      default: json(404, { error: 'Knowledge route not found' })
    }
  } catch (error) {
    if (error instanceof VaultError) json(error.status, { error: error.message, ...(error.details ?? {}) })
    else { json(500, { error: 'The knowledge vault request failed' }); console.error('[Cortex] Knowledge request failed:', (error as Error)?.message) }
  }
  return true
}
