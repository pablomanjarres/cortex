import type { GitHubStats, LemonStats, VercelStats, SupabaseStats } from '@/types/metrics'

export type FounderSource = 'github' | 'lemon' | 'vercel' | 'supabase'

export const FOUNDER_SOURCES: FounderSource[] = ['github', 'lemon', 'vercel', 'supabase']

export const SOURCE_LABELS: Record<FounderSource, string> = {
  github: 'GitHub',
  lemon: 'Lemon Squeezy',
  vercel: 'Vercel',
  supabase: 'Supabase',
}

export interface FounderSourceStatus {
  configured: boolean
  ok: boolean
  fetchedAt: string | null
  consecutiveFailures: number
}

export type FounderStatusMap = Record<FounderSource, FounderSourceStatus>

/**
 * On-disk cache envelope written by the main-process refresher.
 * `fetchedAt`/`ok` are the new fields; `lastUpdated` is the legacy timestamp
 * (still present so older readers keep working).
 */
export interface CacheEnvelope<T> {
  data: T
  lastUpdated?: string
  fetchedAt?: string
  ok?: boolean
}

export type GithubCache = CacheEnvelope<GitHubStats>
export type LemonCache = CacheEnvelope<LemonStats>
export type VercelCache = CacheEnvelope<VercelStats>
export type SupabaseCache = CacheEnvelope<SupabaseStats>

export interface FounderHistoryEntry {
  date: string
  commits: number
  users: number
  deploys: number
  mrr: number
  prsOpen: number
  prsMerged: number
}

interface FounderApi {
  refresh: () => Promise<FounderStatusMap>
  status: () => Promise<FounderStatusMap>
}

/**
 * The preload founder surface. The ambient ElectronAPI declaration predates
 * it, so we cast through a local type (same pattern as src/lib/store.ts).
 * Returns null in web/iPhone builds — those render read-only from the caches.
 */
export function founderApi(): FounderApi | null {
  const api = (window.electronAPI as unknown as { founder?: FounderApi } | undefined)?.founder
  return api ?? null
}
