import assert from 'node:assert/strict'
import test from 'node:test'
import type { CloudCostCache } from '../electron/cloud-cost-types.ts'
import * as cloudCostStore from '../src/features/cloud-costs/cloud-cost-store.ts'

const creditOnly: CloudCostCache = {
  version: 2,
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  fetchedAt: '2026-09-19T12:00:00Z',
  usageItems: [],
  accountAdjustments: [{ date: '2026-09-19', provider: 'gcp', account: 'BILLING', kind: 'credit', amountUsd: -2 }],
  sources: {
    aws: { configured: false, ok: false, sourceId: null, fetchedAt: null, attemptedAt: null, error: null },
    gcp: { configured: true, ok: true, sourceId: 'billing.table', fetchedAt: '2026-09-19T12:00:00Z', attemptedAt: '2026-09-19T12:00:00Z', error: null },
  },
}

test('credit-only snapshots keep the account estimate without zero-usage charts', () => {
  const view = (cloudCostStore as typeof cloudCostStore & {
    cloudCostViewState?: (cache: CloudCostCache, provider: 'all' | 'aws' | 'gcp', month: string) => unknown
  }).cloudCostViewState
  assert.deepEqual(view?.(creditOnly, 'gcp', '2026-09'), {
    showUsageAnalytics: false,
    showAccountEstimate: true,
  })
  assert.deepEqual(view?.(creditOnly, 'aws', '2026-09'), {
    showUsageAnalytics: false,
    showAccountEstimate: false,
  })
})
