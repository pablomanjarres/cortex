import { test, expect } from './fixtures'

test('manual cloud refresh displays the returned snapshot without remounting the page', async ({ page }) => {
  const settings = {
    awsProfile: '',
    gcpBillingTable: 'nella-sync.billing_export.gcp_billing_export_resource_v1_account',
    gcpQueryProject: 'nella-sync',
    monthlyBudgetUsd: 0,
  }
  const stale = {
    version: 2,
    periodStart: '2025-09-01',
    periodEnd: '2026-10-01',
    fetchedAt: '2026-09-20T12:00:00.000Z',
    usageItems: [],
    accountAdjustments: [],
    sources: {
      aws: { configured: false, ok: false, sourceId: null, fetchedAt: null, attemptedAt: null, error: null },
      gcp: {
        configured: true,
        ok: false,
        sourceId: settings.gcpBillingTable,
        fetchedAt: '2026-09-20T12:00:00.000Z',
        attemptedAt: '2026-09-27T12:00:00.000Z',
        error: 'Access denied. Grant read-only billing permissions.',
      },
    },
  }
  const fresh = {
    ...stale,
    fetchedAt: '2026-09-27T18:51:45.123Z',
    usageItems: [{
      provider: 'gcp',
      date: '2026-09-27',
      account: 'billing-account',
      project: 'construcredit',
      service: 'Cloud Run',
      resource: 'worker',
      amountUsd: 0.17,
    }],
    sources: {
      ...stale.sources,
      gcp: {
        configured: true,
        ok: true,
        sourceId: settings.gcpBillingTable,
        fetchedAt: '2026-09-27T18:51:45.123Z',
        attemptedAt: '2026-09-27T18:51:45.123Z',
        error: null,
      },
    },
  }

  await page.addInitScript(({ initialCache, initialSettings, refreshedCache }) => {
    const values: Record<string, unknown> = {
      'cortex-cloud-costs': initialCache,
      'cortex-cloud-cost-settings': initialSettings,
    }
    Object.defineProperty(window, 'electronAPI', {
      value: {
        data: {
          read: async (key: string) => values[key] ?? null,
          readWithRev: async (key: string) => ({ data: values[key] ?? null, rev: '1' }),
          write: async () => ({ ok: true, rev: '2' }),
          onDataChanged: () => () => undefined,
        },
        cloudCosts: {
          refresh: async () => refreshedCache,
          status: async () => refreshedCache.sources,
          gcpCredentialStatus: async () => ({ configured: true, email: 'cortex-billing-reader@nella-sync.iam.gserviceaccount.com' }),
        },
      },
    })
  }, { initialCache: stale, initialSettings: settings, refreshedCache: fresh })

  await page.goto('/#/cloud-costs')
  await expect(page.getByText('GCP · Needs refresh', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Refresh', exact: true }).click()

  await expect(page.getByText('GCP · Live', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('$0.17', { exact: true }).first()).toBeVisible()
})
