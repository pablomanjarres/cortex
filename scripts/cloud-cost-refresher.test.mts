import test from 'node:test'
import assert from 'node:assert/strict'
import {
  billingWindow,
  mergeProviderResults,
  safeCloudCostError,
} from '../electron/cloud-cost-refresh-state.ts'

const previous = {
  version: 1,
  periodStart: '2025-08-01',
  periodEnd: '2026-09-01',
  fetchedAt: '2026-09-01T12:00:00.000Z',
  items: [
    { date: '2026-08-01', provider: 'aws', account: '111', project: '111', service: 'EC2', amountUsd: 10 },
    { date: '2026-08-01', provider: 'gcp', account: 'billing', project: 'alpha', service: 'Run', amountUsd: 20 },
  ],
  sources: {
    aws: { configured: true, ok: true, fetchedAt: '2026-09-01T12:00:00.000Z', error: null },
    gcp: { configured: true, ok: true, fetchedAt: '2026-09-01T12:00:00.000Z', error: null },
  },
} as const

test('billingWindow covers the current and previous 12 calendar months with an exclusive end', () => {
  assert.deepEqual(billingWindow(new Date('2026-09-18T23:30:00Z')), {
    start: '2025-09-01',
    end: '2026-09-19',
  })
})

test('mergeProviderResults replaces a successful slice and retains a failed slice as stale', () => {
  const merged = mergeProviderResults(
    previous,
    { awsProfile: 'default', gcpBillingTable: 'billing.data.table', gcpQueryProject: '', monthlyBudgetUsd: 100 },
    {
      aws: { ok: true, items: [{ date: '2026-09-01', provider: 'aws', account: '111', project: '111', service: 'S3', amountUsd: 4 }] },
      gcp: { ok: false, error: 'Access denied. Grant read-only billing permissions.' },
    },
    { start: '2025-09-01', end: '2026-09-19' },
    '2026-09-18T12:00:00.000Z',
  )

  assert.deepEqual(merged.items, [
    { date: '2026-08-01', provider: 'gcp', account: 'billing', project: 'alpha', service: 'Run', amountUsd: 20 },
    { date: '2026-09-01', provider: 'aws', account: '111', project: '111', service: 'S3', amountUsd: 4 },
  ])
  assert.deepEqual(merged.sources.aws, {
    configured: true, ok: true, fetchedAt: '2026-09-18T12:00:00.000Z', error: null,
  })
  assert.deepEqual(merged.sources.gcp, {
    configured: true, ok: false, fetchedAt: '2026-09-01T12:00:00.000Z', error: 'Access denied. Grant read-only billing permissions.',
  })
})

test('mergeProviderResults removes rows for a provider that is no longer configured', () => {
  const merged = mergeProviderResults(
    previous,
    { awsProfile: '', gcpBillingTable: 'billing.data.table', gcpQueryProject: '', monthlyBudgetUsd: 0 },
    { gcp: { ok: true, items: [] } },
    { start: '2025-09-01', end: '2026-09-19' },
    '2026-09-18T12:00:00.000Z',
  )
  assert.equal(merged.items.some((item) => item.provider === 'aws'), false)
  assert.deepEqual(merged.sources.aws, { configured: false, ok: false, fetchedAt: null, error: null })
})

test('safeCloudCostError never returns credential material', () => {
  const error = Object.assign(new Error('AKIA1234567890ABCDEF secret=very-private AccessDenied'), { name: 'AccessDeniedException' })
  const safe = safeCloudCostError(error)
  assert.equal(safe, 'Access denied. Grant read-only billing permissions.')
  assert.doesNotMatch(safe, /AKIA|very-private/)
})
