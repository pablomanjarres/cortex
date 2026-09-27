import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAwsPage, normalizeGcpRows, validateBillingTable } from '../electron/cloud-cost-normalizers.ts'
import { collectAwsCosts } from '../electron/integrations/aws-costs.ts'
import { buildGcpBillingQuery, collectGcpCosts } from '../electron/integrations/gcp-costs.ts'

test('AWS normalization reads the requested USD pass and preserves pagination', () => {
  const page = {
    NextPageToken: 'next',
    ResultsByTime: [{ TimePeriod: { Start: '2026-09-01' }, Groups: [{
      Keys: ['EC2', '111'], Metrics: {
        AmortizedCost: { Amount: '10', Unit: 'USD' },
        UnblendedCost: { Amount: '-10', Unit: 'USD' },
        NetAmortizedCost: { Amount: '0', Unit: 'USD' },
      },
    }] }],
  }
  assert.deepEqual(normalizeAwsPage(page, 'usage'), {
    rows: [{ date: '2026-09-01', service: 'EC2', account: '111', amountUsd: 10 }],
    nextPageToken: 'next',
  })
  assert.equal(normalizeAwsPage(page, 'credit').rows[0]?.amountUsd, -10)
  assert.deepEqual(normalizeAwsPage(page, 'net').rows, [])
})

test('AWS normalization rejects non-USD results in every pass', () => {
  for (const [pass, metric] of [['usage', 'AmortizedCost'], ['credit', 'UnblendedCost'], ['net', 'NetAmortizedCost']] as const) {
    assert.throws(() => normalizeAwsPage({
      ResultsByTime: [{ TimePeriod: { Start: '2026-09-01' }, Groups: [{
        Keys: ['EC2', '111'], Metrics: { [metric]: { Amount: '3', Unit: 'EUR' } },
      }] }],
    }, pass), /requires USD/)
  }
})

test('GCP normalization keeps gross project usage when credits make project net negative', () => {
  const result = normalizeGcpRows([
    { usageDate: '2026-09-04', account: 'BILLING', project: 'construcredit', service: 'Cloud Run', resource: 'worker', usageCost: '48000', otherCost: '0', credits: '-60000', currencyConversionRate: '4000' },
    { usageDate: '2026-09-04', account: 'BILLING', project: 'nella-sync', service: 'Cloud SQL', resource: null, usageCost: '32000', otherCost: '4000', credits: '-20000', currencyConversionRate: '4000' },
  ])
  assert.deepEqual(result.usageItems, [
    { date: '2026-09-04', provider: 'gcp', account: 'BILLING', project: 'construcredit', service: 'Cloud Run', resource: 'worker', amountUsd: 12 },
    { date: '2026-09-04', provider: 'gcp', account: 'BILLING', project: 'nella-sync', service: 'Cloud SQL', resource: null, amountUsd: 8 },
  ])
  assert.deepEqual(result.accountAdjustments, [
    { date: '2026-09-04', provider: 'gcp', account: 'BILLING', kind: 'credit', amountUsd: -15 },
    { date: '2026-09-04', provider: 'gcp', account: 'BILLING', kind: 'other', amountUsd: 1 },
    { date: '2026-09-04', provider: 'gcp', account: 'BILLING', kind: 'credit', amountUsd: -5 },
  ])
})

test('GCP normalization moves negative regular charges to account adjustments', () => {
  assert.deepEqual(normalizeGcpRows([{
    usageDate: '2026-09-01', account: 'BILLING', project: 'project-a', service: 'Cloud Run',
    resource: null, usageCost: '-2', otherCost: '0', credits: '0', currencyConversionRate: '1',
  }]), {
    usageItems: [],
    accountAdjustments: [{ date: '2026-09-01', provider: 'gcp', account: 'BILLING', kind: 'other', amountUsd: -2 }],
  })
})

test('GCP normalization drops malformed, zero, and invalid-rate rows', () => {
  assert.deepEqual(normalizeGcpRows([
    { usageDate: 'bad', usageCost: '10', credits: '0', currencyConversionRate: '1' },
    { usageDate: '2026-09-01', usageCost: '0', credits: '0', currencyConversionRate: '1' },
    { usageDate: '2026-09-02', usageCost: '10', credits: '0', currencyConversionRate: '0' },
  ]), { usageItems: [], accountAdjustments: [] })
})

test('billing table validation rejects SQL fragments', () => {
  assert.equal(validateBillingTable('billing-prod.cost_export.gcp_billing_export_v1_ACCOUNT'), 'billing-prod.cost_export.gcp_billing_export_v1_ACCOUNT')
  assert.throws(() => validateBillingTable('billing.dataset.table` WHERE TRUE; --'), /project\.dataset\.table/)
})

test('AWS collector paginates gross usage and keeps fully offset credits separate', async () => {
  const seen: Array<{ metric: string; filter: unknown; token: string | undefined }> = []
  const client = {
    async send(command: { input: { Metrics: string[]; Filter?: unknown; NextPageToken?: string } }) {
      const metric = command.input.Metrics[0]
      seen.push({ metric, filter: command.input.Filter, token: command.input.NextPageToken })
      if (metric === 'AmortizedCost') {
        const amount = command.input.NextPageToken ? '4' : '6'
        return { NextPageToken: command.input.NextPageToken ? undefined : 'next', ResultsByTime: [{ TimePeriod: { Start: '2026-09-01' }, Groups: [{ Keys: ['EC2', '111'], Metrics: { AmortizedCost: { Amount: amount, Unit: 'USD' } } }] }] }
      }
      const amount = metric === 'UnblendedCost' ? '-10' : '0'
      return { ResultsByTime: [{ TimePeriod: { Start: '2026-09-01' }, Groups: [{ Keys: ['EC2', '111'], Metrics: { [metric]: { Amount: amount, Unit: 'USD' } } }] }] }
    },
  }
  const result = await collectAwsCosts(client, '2026-09-01', '2026-09-03')
  assert.deepEqual(seen.map(({ metric, token }) => [metric, token]), [
    ['AmortizedCost', undefined], ['AmortizedCost', 'next'], ['UnblendedCost', undefined], ['NetAmortizedCost', undefined],
  ])
  assert.deepEqual(seen[0]?.filter, { Dimensions: { Key: 'RECORD_TYPE', Values: ['Usage', 'DiscountedUsage', 'SavingsPlanCoveredUsage'] } })
  assert.deepEqual(seen[2]?.filter, { Dimensions: { Key: 'RECORD_TYPE', Values: ['Credit'] } })
  assert.deepEqual(result.usageItems.map(({ amountUsd, resource }) => [amountUsd, resource]), [[6, null], [4, null]])
  assert.deepEqual(result.accountAdjustments, [{ date: '2026-09-01', provider: 'aws', account: '111', kind: 'credit', amountUsd: -10 }])
})

test('AWS collector reconciles charges outside usage and credits', async () => {
  const client = {
    async send(command: { input: { Metrics: string[] } }) {
      const metric = command.input.Metrics[0]
      const amount = metric === 'AmortizedCost' ? '10' : metric === 'UnblendedCost' ? '-3' : '4'
      return { ResultsByTime: [{ TimePeriod: { Start: '2026-09-01' }, Groups: [{ Keys: ['EC2', '111'], Metrics: { [metric]: { Amount: amount, Unit: 'USD' } } }] }] }
    },
  }
  const result = await collectAwsCosts(client, '2026-09-01', '2026-09-02')
  assert.deepEqual(result.accountAdjustments, [
    { date: '2026-09-01', provider: 'aws', account: '111', kind: 'credit', amountUsd: -3 },
    { date: '2026-09-01', provider: 'aws', account: '111', kind: 'other', amountUsd: -3 },
  ])
})

test('GCP query separates regular charges, credits, and other cost types', () => {
  const query = buildGcpBillingQuery('billing-prod.cost_export.gcp_billing_export_v1_ACCOUNT')
  assert.match(query, /DATE\(usage_start_time\) >= DATE\(@startDate\)/)
  assert.match(query, /cost_type = 'regular'/)
  assert.match(query, /UNNEST\(credits\)/)
  assert.match(query, /currency_conversion_rate/)
  assert.match(query, /NULL AS resource/)
  assert.doesNotMatch(query, /resource\.global_name/)
  assert.match(buildGcpBillingQuery('billing-prod.cost_export.gcp_billing_export_resource_v1_ACCOUNT', true), /resource\.global_name/)
})

test('GCP collector detects Detailed export resources and falls back for Standard exports', async () => {
  for (const detailed of [true, false]) {
    const queries: string[] = []
    const client = {
      async query(options: { query: string }) {
        queries.push(options.query)
        if (options.query.includes('INFORMATION_SCHEMA')) return [detailed ? [{ column_name: 'resource' }] : []]
        return [[{
          usageDate: '2026-09-01', account: 'BILLING', project: 'construcredit', service: 'Cloud Run',
          resource: detailed ? 'projects/construcredit/services/api' : null,
          usageCost: '5', otherCost: '0', credits: '-5', currencyConversionRate: '1',
        }]]
      },
    }
    const result = await collectGcpCosts(client, 'billing-prod.cost_export.gcp_billing_export_v1_ACCOUNT', '2026-09-01', '2026-09-02')
    assert.equal(result.usageItems[0]?.resource, detailed ? 'projects/construcredit/services/api' : null)
    assert.equal(queries.length, 2)
    assert.equal(queries[1]?.includes('resource.global_name'), detailed)
  }
})
