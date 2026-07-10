// Founder metrics refresher — the SINGLE owner of founder data.
//
// Background-refreshes the four sources (GitHub, Lemon, Vercel, Supabase)
// every 30 minutes (jittered), on power resume, and on demand via IPC
// 'founder:refresh'. Each cycle fetches sources IN PARALLEL, each isolated:
// unconfigured sources are skipped cleanly, failing sources keep their last
// cache untouched and back off after 3 consecutive failures. The renderer
// only ever reads the cache keys (instant paint via useStore + data:changed).
//
// Cache keys (cortex-cache-github/-lemon/-vercel/-supabase) keep the legacy
// top-level shape { data, lastUpdated } — extended with { fetchedAt, ok } —
// and are written via the direct encrypt path (no versioned backups: 30-min
// churn would thrash iCloud) + a manual data:changed broadcast.
// cortex-founder-history is upserted through the FULL backed-up write path.

import fs from 'fs'
import path from 'path'
import { ipcMain, powerMonitor } from 'electron'
import { getKey } from './keychain.js'
import { encryptAndWriteAsync } from './crypto.js'
import { getGitHubStats } from './integrations/github.js'
import { getLemonStats } from './integrations/lemon.js'
import { getVercelStats } from './integrations/vercel.js'
import { getSupabaseStats } from './integrations/supabase.js'

export type FounderSource = 'github' | 'lemon' | 'vercel' | 'supabase'

export const FOUNDER_SOURCES: FounderSource[] = ['github', 'lemon', 'vercel', 'supabase']

const CACHE_KEYS: Record<FounderSource, string> = {
  github: 'cortex-cache-github',
  lemon: 'cortex-cache-lemon',
  vercel: 'cortex-cache-vercel',
  supabase: 'cortex-cache-supabase',
}

const HISTORY_KEY = 'cortex-founder-history'
const HISTORY_RETENTION_DAYS = 365
const REFRESH_INTERVAL_MS = 30 * 60 * 1000
const JITTER_MS = 2 * 60 * 1000
const BACKOFF_AFTER_FAILURES = 3
const BACKOFF_INTERVALS = 4
const RESUME_MIN_AGE_MS = 5 * 60 * 1000
const ENDPOINT_FRESH_MS = 10 * 60 * 1000

interface CacheEnvelope {
  data: unknown
  lastUpdated: string
  fetchedAt: string
  ok: true
}

export interface FounderSourceStatus {
  configured: boolean
  ok: boolean
  fetchedAt: string | null
  consecutiveFailures: number
}

export type FounderStatusMap = Record<FounderSource, FounderSourceStatus>

interface FounderHistoryEntry {
  date: string
  commits: number
  users: number
  deploys: number
  mrr: number
  prsOpen: number
  prsMerged: number
}

interface GithubResult { commitsToday: number; prsOpen: number; prsMergedWeek: number }
interface LemonResult { mrr: number }
interface VercelResult { deploymentsToday: number }
interface SupabaseResult { totalUsers: number }

export interface FounderRefresherDeps {
  dataDir: string
  readDataKeyParsed<T>(key: string, fallback: T): Promise<T>
  writeDataKey(key: string, data: unknown, opts: { source: 'main' }): Promise<{ ok: boolean }>
  broadcastDataChanged(key: string, source: 'main', rev: string | null): void
}

function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Module state ───────────────────────────────────────────

interface SourceState {
  ok: boolean
  fetchedAt: string | null       // last SUCCESSFUL fetch (ISO)
  consecutiveFailures: number
  backoffUntil: number           // epoch ms; 0 = no backoff
  lastError: string | null
  lastData: unknown              // last good stats (memory mirror of the cache's .data)
  inflight: Promise<unknown | null> | null
}

function emptySourceState(): SourceState {
  return { ok: false, fetchedAt: null, consecutiveFailures: 0, backoffUntil: 0, lastError: null, lastData: null, inflight: null }
}

let deps: FounderRefresherDeps | null = null
const state: Record<FounderSource, SourceState> = {
  github: emptySourceState(),
  lemon: emptySourceState(),
  vercel: emptySourceState(),
  supabase: emptySourceState(),
}
let cycleInflight: Promise<void> | null = null
let cycleTimer: ReturnType<typeof setTimeout> | null = null

// ─── Credentials (keychain) ─────────────────────────────────

function isConfigured(source: FounderSource): boolean {
  switch (source) {
    case 'github': return !!getKey('github-token')
    case 'lemon': return !!getKey('lemon-api-key') && !!getKey('lemon-store-id')
    case 'vercel': return !!getKey('vercel-token')
    case 'supabase': return !!getKey('supabase-url') && !!getKey('supabase-service-key')
  }
}

async function fetchSource(source: FounderSource): Promise<unknown> {
  switch (source) {
    case 'github': return getGitHubStats(getKey('github-token')!)
    case 'lemon': return getLemonStats(getKey('lemon-api-key')!, getKey('lemon-store-id')!)
    case 'vercel': return getVercelStats(getKey('vercel-token')!)
    case 'supabase': return getSupabaseStats(getKey('supabase-url')!, getKey('supabase-service-key')!)
  }
}

// ─── Cache writes (direct encrypt path — no versioned backups) ─

async function writeCache(source: FounderSource, stats: unknown): Promise<void> {
  if (!deps) return
  const key = CACHE_KEYS[source]
  const iso = new Date().toISOString()
  const envelope: CacheEnvelope = { data: stats, lastUpdated: iso, fetchedAt: iso, ok: true }
  const file = path.join(deps.dataDir, `${key}.json`)
  await encryptAndWriteAsync(file, JSON.stringify(envelope))
  let rev: string | null = null
  try { rev = String((await fs.promises.stat(file)).mtimeMs) } catch { rev = String(Date.now()) }
  deps.broadcastDataChanged(key, 'main', rev)
}

// ─── Per-source refresh (isolated; never throws) ────────────

/** Refresh one source. Resolves the fresh stats, or null on skip/failure. */
function refreshSource(source: FounderSource, opts: { force?: boolean; minAgeMs?: number } = {}): Promise<unknown | null> {
  const s = state[source]
  if (s.inflight) return s.inflight

  if (!isConfigured(source)) return Promise.resolve(null) // skip cleanly — CONNECT state

  const now = Date.now()
  if (!opts.force && s.backoffUntil > now) return Promise.resolve(null)
  if (opts.minAgeMs && s.fetchedAt && now - new Date(s.fetchedAt).getTime() < opts.minAgeMs) {
    return Promise.resolve(null) // fresh enough for this trigger
  }

  s.inflight = (async (): Promise<unknown | null> => {
    try {
      const stats = await fetchSource(source)
      s.ok = true
      s.consecutiveFailures = 0
      s.backoffUntil = 0
      s.lastError = null
      s.fetchedAt = new Date().toISOString()
      s.lastData = stats
      try { await writeCache(source, stats) } catch (e) {
        console.error(`[Founder] cache write failed for ${source}:`, e)
      }
      return stats
    } catch (e) {
      // Keep the last cache untouched — a failure never poisons good data.
      s.ok = false
      s.consecutiveFailures++
      s.lastError = String((e as Error)?.message ?? e)
      if (s.consecutiveFailures >= BACKOFF_AFTER_FAILURES) {
        s.backoffUntil = Date.now() + BACKOFF_INTERVALS * REFRESH_INTERVAL_MS
      }
      console.error(`[Founder] ${source} refresh failed (${s.consecutiveFailures} consecutive):`, s.lastError)
      return null
    } finally {
      s.inflight = null
    }
  })()
  return s.inflight
}

// ─── History upsert (single writer; full backed-up write path) ─

interface CycleResults {
  github?: GithubResult | null
  lemon?: LemonResult | null
  vercel?: VercelResult | null
  supabase?: SupabaseResult | null
}

// Serialize upserts: a scheduled cycle and an endpoint-triggered refresh must
// never interleave the read-modify-write (this module is the single writer).
let historyChain: Promise<void> = Promise.resolve()

function upsertHistory(results: CycleResults): Promise<void> {
  historyChain = historyChain.then(() => upsertHistoryNow(results)).catch(() => undefined)
  return historyChain
}

async function upsertHistoryNow(results: CycleResults): Promise<void> {
  if (!deps) return
  const { github, lemon, vercel, supabase } = results
  if (!github && !lemon && !vercel && !supabase) return // nothing succeeded — write nothing

  const today = localDate()
  const raw = await deps.readDataKeyParsed<FounderHistoryEntry[]>(HISTORY_KEY, [])
  const history = Array.isArray(raw) ? raw.filter((h) => h && typeof h.date === 'string') : []
  const before = JSON.stringify(history)

  let entry = history.find((h) => h.date === today)
  if (!entry) {
    entry = { date: today, commits: 0, users: 0, deploys: 0, mrr: 0, prsOpen: 0, prsMerged: 0 }
    history.push(entry)
  }

  // Per-field semantics — a field is ONLY written when its source succeeded,
  // and a successful reading is authoritative even when it is zero (a real
  // "0 PRs open" / "0 commits" must be recordable; failed sources are already
  // excluded by the null guards above).
  if (github) {
    // Authoritative full-day commit count from GitHub.
    entry.commits = github.commitsToday
    entry.prsOpen = github.prsOpen
    // Merged-THIS-WEEK count — the field finally matches its "(week)" label.
    entry.prsMerged = github.prsMergedWeek
  }
  if (supabase) entry.users = supabase.totalUsers
  if (lemon) entry.mrr = lemon.mrr
  if (vercel) entry.deploys = Math.max(entry.deploys ?? 0, vercel.deploymentsToday)

  // Retention: 365 days, ascending by date.
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - (HISTORY_RETENTION_DAYS - 1))
  const cutoff = localDate(cutoffDate)
  const next = history.filter((h) => h.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date))

  if (JSON.stringify(next) === before) return // unchanged — skip backup churn
  try {
    await deps.writeDataKey(HISTORY_KEY, next, { source: 'main' })
  } catch (e) {
    console.error('[Founder] history write failed:', e)
  }
}

// ─── Full cycle ─────────────────────────────────────────────

function runCycle(opts: { force?: boolean; minAgeMs?: number } = {}): Promise<void> {
  if (cycleInflight) return cycleInflight
  cycleInflight = (async () => {
    const [github, lemon, vercel, supabase] = await Promise.all([
      refreshSource('github', opts),
      refreshSource('lemon', opts),
      refreshSource('vercel', opts),
      refreshSource('supabase', opts),
    ])
    await upsertHistory({
      github: github as GithubResult | null,
      lemon: lemon as LemonResult | null,
      vercel: vercel as VercelResult | null,
      supabase: supabase as SupabaseResult | null,
    })
  })().finally(() => { cycleInflight = null })
  return cycleInflight
}

function scheduleNextCycle() {
  if (cycleTimer) clearTimeout(cycleTimer)
  const jitter = (Math.random() * 2 - 1) * JITTER_MS // ±2min
  cycleTimer = setTimeout(() => {
    void runCycle().finally(scheduleNextCycle)
  }, REFRESH_INTERVAL_MS + jitter)
}

// ─── Status ─────────────────────────────────────────────────

export function founderStatus(): FounderStatusMap {
  const out = {} as FounderStatusMap
  for (const source of FOUNDER_SOURCES) {
    const s = state[source]
    out[source] = {
      configured: isConfigured(source),
      ok: s.ok,
      fetchedAt: s.fetchedAt,
      consecutiveFailures: s.consecutiveFailures,
    }
  }
  return out
}

// ─── HTTP-endpoint accessor (used by /api/integrations/*) ───

export type EndpointResult =
  | { kind: 'ok'; data: unknown }
  | { kind: 'unconfigured' }
  | { kind: 'error'; error: string }

/**
 * Serve the cached stats when fresh (<10min), else run a live refresh of
 * just that source. On refresh failure, fall back to the last good data so
 * MCP clients degrade to stale-but-real numbers instead of errors.
 */
export async function getStatsForEndpoint(source: FounderSource): Promise<EndpointResult> {
  const s = state[source]
  if (!isConfigured(source)) return { kind: 'unconfigured' }

  const ageMs = s.fetchedAt ? Date.now() - new Date(s.fetchedAt).getTime() : Infinity
  if (s.lastData !== null && ageMs < ENDPOINT_FRESH_MS) return { kind: 'ok', data: s.lastData }

  const stats = await refreshSource(source, { force: true })
  if (stats !== null) {
    // Keep history honest for endpoint-triggered refreshes too.
    void upsertHistory({ [source]: stats } as CycleResults)
    return { kind: 'ok', data: stats }
  }
  if (s.lastData !== null) return { kind: 'ok', data: s.lastData } // stale but real
  return { kind: 'error', error: s.lastError ?? `${source} fetch failed` }
}

// ─── Startup ────────────────────────────────────────────────

/** Seed in-memory state from the on-disk caches so first paint + status are honest. */
async function seedFromDisk(): Promise<void> {
  if (!deps) return
  await Promise.all(FOUNDER_SOURCES.map(async (source) => {
    const cached = await deps!.readDataKeyParsed<Partial<CacheEnvelope> | null>(CACHE_KEYS[source], null)
    if (!cached || typeof cached !== 'object' || cached.data == null) return
    const s = state[source]
    s.lastData = cached.data
    s.fetchedAt = cached.fetchedAt ?? cached.lastUpdated ?? null
    s.ok = true // last persisted fetch succeeded (caches are only written on success)
  }))
}

export function startFounderRefresher(dependencies: FounderRefresherDeps): void {
  deps = dependencies

  ipcMain.handle('founder:refresh', async () => {
    await runCycle({ force: true })
    return founderStatus()
  })
  ipcMain.handle('founder:status', () => founderStatus())

  powerMonitor.on('resume', () => {
    void runCycle({ minAgeMs: RESUME_MIN_AGE_MS })
  })

  void (async () => {
    await seedFromDisk()
    const freshestMs = FOUNDER_SOURCES
      .map((src) => state[src].fetchedAt)
      .filter((t): t is string => t !== null)
      .map((t) => new Date(t).getTime())
      .reduce((max, t) => Math.max(max, t), 0)
    if (Date.now() - freshestMs > REFRESH_INTERVAL_MS) {
      void runCycle()
    }
    scheduleNextCycle()
  })()
}
