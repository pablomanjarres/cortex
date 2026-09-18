import type {
  CloudCostCache,
  CloudCostLineItem,
  CloudCostSettings,
  CloudCostSourceStatus,
  CloudProvider,
} from './cloud-cost-types.js'

export interface BillingWindow {
  start: string
  end: string
}

export type ProviderFetchResult =
  | { ok: true; items: CloudCostLineItem[] }
  | { ok: false; error: string }

export type ProviderResults = Partial<Record<CloudProvider, ProviderFetchResult>>

const PROVIDERS: CloudProvider[] = ['aws', 'gcp']
export const AUTOMATIC_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000
const dateOnly = (date: Date) => date.toISOString().slice(0, 10)

export function billingWindow(now: Date = new Date()): BillingWindow {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return { start: dateOnly(start), end: dateOnly(end) }
}

export function isProviderConfigured(provider: CloudProvider, settings: CloudCostSettings): boolean {
  return provider === 'aws'
    ? settings.awsProfile.trim().length > 0
    : settings.gcpBillingTable.trim().length > 0
}

export function providerSourceId(provider: CloudProvider, settings: CloudCostSettings): string | null {
  const sourceId = provider === 'aws' ? settings.awsProfile : settings.gcpBillingTable
  return sourceId.trim() || null
}

export function automaticRefreshDelayMs(
  previous: CloudCostCache | null,
  settings: CloudCostSettings,
  nowMs: number = Date.now(),
  intervalMs: number = AUTOMATIC_REFRESH_INTERVAL_MS,
): number {
  let earliest = intervalMs
  let hasConfiguredProvider = false

  for (const provider of PROVIDERS) {
    if (!isProviderConfigured(provider, settings)) continue
    hasConfiguredProvider = true
    const status = previous?.sources?.[provider]
    if (!status || status.sourceId !== providerSourceId(provider, settings)) return 0
    const lastAttempt = status.attemptedAt ?? status.fetchedAt
    const attemptedAtMs = lastAttempt ? new Date(lastAttempt).getTime() : NaN
    if (!Number.isFinite(attemptedAtMs)) return 0
    earliest = Math.min(earliest, Math.max(0, attemptedAtMs + intervalMs - nowMs))
  }

  return hasConfiguredProvider ? earliest : intervalMs
}

export function safeCloudCostError(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (/accessdenied|permissiondenied/i.test(name) || message.includes('access denied') || message.includes('permission denied')) {
    return 'Access denied. Grant read-only billing permissions.'
  }
  if (/credentials|unauthenticated/i.test(name) || message.includes('credential') || message.includes('could not load the default credentials')) {
    return 'Credentials unavailable. Check the local cloud profile.'
  }
  if (/notfound/i.test(name) || message.includes('not found')) {
    return 'Billing export table was not found.'
  }
  if (message.includes('project.dataset.table')) {
    return 'GCP billing table must use project.dataset.table format.'
  }
  return 'Refresh failed. Check local credentials and billing access.'
}

function blankStatus(configured: boolean): CloudCostSourceStatus {
  return { configured, ok: false, sourceId: null, fetchedAt: null, attemptedAt: null, error: null }
}

function sourceStatus(
  configured: boolean,
  previous: CloudCostSourceStatus | undefined,
  result: ProviderFetchResult | undefined,
  nowIso: string,
  sourceId: string | null,
): CloudCostSourceStatus {
  if (!configured) return blankStatus(false)
  if (result?.ok) {
    return { configured: true, ok: true, sourceId, fetchedAt: nowIso, attemptedAt: nowIso, error: null }
  }
  const sameSource = previous?.sourceId === sourceId
  return {
    configured: true,
    ok: false,
    sourceId,
    fetchedAt: sameSource ? previous?.fetchedAt ?? null : null,
    attemptedAt: result ? nowIso : sameSource ? previous?.attemptedAt ?? previous?.fetchedAt ?? null : null,
    error: result?.error ?? 'Refresh did not run.',
  }
}

export function mergeProviderResults(
  previous: CloudCostCache | null,
  settings: CloudCostSettings,
  results: ProviderResults,
  window: BillingWindow,
  nowIso: string,
): CloudCostCache {
  let items = (previous?.items ?? []).filter((item) => item.date >= window.start && item.date < window.end)
  const sources = {} as Record<CloudProvider, CloudCostSourceStatus>
  let anySuccess = false

  for (const provider of PROVIDERS) {
    const configured = isProviderConfigured(provider, settings)
    const result = results[provider]
    const sourceId = providerSourceId(provider, settings)
    const sourceChanged = previous?.sources?.[provider]?.sourceId !== sourceId
    if (!configured) {
      items = items.filter((item) => item.provider !== provider)
    } else if (result?.ok) {
      items = items.filter((item) => item.provider !== provider).concat(result.items)
      anySuccess = true
    } else if (sourceChanged) {
      items = items.filter((item) => item.provider !== provider)
    }
    sources[provider] = sourceStatus(configured, previous?.sources?.[provider], result, nowIso, sourceId)
  }

  items.sort((a, b) =>
    a.date.localeCompare(b.date)
      || a.provider.localeCompare(b.provider)
      || a.service.localeCompare(b.service)
      || a.project.localeCompare(b.project))

  return {
    version: 1,
    periodStart: window.start,
    periodEnd: window.end,
    fetchedAt: anySuccess ? nowIso : previous?.fetchedAt ?? nowIso,
    items,
    sources,
  }
}
