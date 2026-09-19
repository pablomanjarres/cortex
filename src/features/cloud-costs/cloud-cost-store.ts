import type { CloudCostCache, CloudCostSettings } from '../../../electron/cloud-cost-types.ts'

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
