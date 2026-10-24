import type {
  CloudCostCache,
  CloudCostSettings,
  CloudCostSourceStatus,
  CloudProvider,
  CloudProviderFilter,
} from '../../../electron/cloud-cost-types.ts'
import { includesProvider, monthOf } from './analytics.ts'

export const DEFAULT_CLOUD_COST_SETTINGS: CloudCostSettings = {
  awsProfile: '',
  gcpBillingTable: '',
  gcpQueryProject: '',
  monthlyBudgetUsd: 0,
}

export const EMPTY_CLOUD_COST_CACHE: CloudCostCache = {
  version: 2,
  periodStart: '',
  periodEnd: '',
  fetchedAt: '',
  usageItems: [],
  accountAdjustments: [],
  sources: {
    aws: { configured: false, ok: false, sourceId: null, fetchedAt: null, attemptedAt: null, error: null },
    gcp: { configured: false, ok: false, sourceId: null, fetchedAt: null, attemptedAt: null, error: null },
  },
}

export function cloudUsageEmptyMessage(hasLiveSource: boolean, hasFailedSource: boolean): string {
  if (hasLiveSource) return 'No usage in the retained period.'
  if (hasFailedSource) return 'Usage unavailable. Refresh the configured sources.'
  return 'Waiting for the first billing snapshot.'
}

export const CLOUD_SOURCE_LABELS: Record<CloudProvider, string> = {
  aws: 'AWS Cost Explorer',
  gcp: 'GCP Billing Export',
}

/** The setting that identifies each provider's billing source, trimmed. */
export function cloudSourceId(settings: CloudCostSettings, provider: CloudProvider): string {
  return (provider === 'aws' ? settings.awsProfile : settings.gcpBillingTable).trim()
}

export type CloudSourceState = 'live' | 'stale' | 'off'

/** Live only when the last successful snapshot came from the configured source. */
export function cloudSourceState(sourceId: string, status: CloudCostSourceStatus): CloudSourceState {
  if (!sourceId) return 'off'
  return status.ok && status.sourceId === sourceId ? 'live' : 'stale'
}

export function cloudCostViewState(cache: CloudCostCache, provider: CloudProviderFilter, month: string) {
  const showUsageAnalytics = cache.usageItems.some((row) => includesProvider(row, provider))
  const hasCurrentAdjustments = cache.accountAdjustments.some(
    (row) => includesProvider(row, provider) && monthOf(row.date) === month,
  )
  return { showUsageAnalytics, showAccountEstimate: showUsageAnalytics || hasCurrentAdjustments }
}
