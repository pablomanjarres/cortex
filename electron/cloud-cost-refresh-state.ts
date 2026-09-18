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
  return { configured, ok: false, fetchedAt: null, error: null }
}

function sourceStatus(
  configured: boolean,
  previous: CloudCostSourceStatus | undefined,
  result: ProviderFetchResult | undefined,
  nowIso: string,
): CloudCostSourceStatus {
  if (!configured) return blankStatus(false)
  if (result?.ok) return { configured: true, ok: true, fetchedAt: nowIso, error: null }
  return {
    configured: true,
    ok: false,
    fetchedAt: previous?.fetchedAt ?? null,
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
    if (!configured) {
      items = items.filter((item) => item.provider !== provider)
    } else if (result?.ok) {
      items = items.filter((item) => item.provider !== provider).concat(result.items)
      anySuccess = true
    }
    sources[provider] = sourceStatus(configured, previous?.sources[provider], result, nowIso)
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
