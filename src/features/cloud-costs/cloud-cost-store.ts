import type { CloudCostCache, CloudCostSettings } from '../../../electron/cloud-cost-types.ts'

export const DEFAULT_CLOUD_COST_SETTINGS: CloudCostSettings = {
  awsProfile: '',
  gcpBillingTable: '',
  gcpQueryProject: '',
  monthlyBudgetUsd: 0,
}

export const EMPTY_CLOUD_COST_CACHE: CloudCostCache = {
  version: 1,
  periodStart: '',
  periodEnd: '',
  fetchedAt: '',
  items: [],
  sources: {
    aws: { configured: false, ok: false, fetchedAt: null, error: null },
    gcp: { configured: false, ok: false, fetchedAt: null, error: null },
  },
}
