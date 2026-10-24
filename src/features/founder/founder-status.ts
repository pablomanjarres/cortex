import type { FounderSourceStatus } from './founder-api'

export type FounderSourceHealth = 'unconfigured' | 'live' | 'failing' | 'waiting'

/** Configured sources fail only after a refresh attempt; until then they wait. */
export function founderSourceHealth(status: FounderSourceStatus): FounderSourceHealth {
  if (!status.configured) return 'unconfigured'
  if (status.ok) return 'live'
  return status.consecutiveFailures > 0 ? 'failing' : 'waiting'
}

export const FOUNDER_HEALTH_LABELS: Record<FounderSourceHealth, string> = {
  unconfigured: 'Not connected',
  live: 'Live',
  failing: 'Refresh failed',
  waiting: 'Waiting for refresh',
}
