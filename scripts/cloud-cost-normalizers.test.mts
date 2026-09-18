import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeAwsPage,
  normalizeGcpRows,
  validateBillingTable,
} from '../electron/cloud-cost-normalizers.ts'
import { collectAwsCosts } from '../electron/integrations/aws-costs.ts'
import { buildGcpBillingQuery } from '../electron/integrations/gcp-costs.ts'

test('normalizeAwsPage maps service/account groups and preserves pagination', () => {
  const normalized = normalizeAwsPage({
    NextPageToken: 'page-2',
    ResultsByTime: [{
      TimePeriod: { Start: '2026-09-01', End: '2026-09-02' },
      Groups: [
        { Keys: ['Amazon Elastic Compute Cloud - Compute', '111111111111'], Metrics: { NetUnblendedCost: { Amount: '12.345', Unit: 'USD' } } },
        { Keys: ['Amazon Simple Storage Service', '111111111111'], Metrics: { NetUnblendedCost: { Amount: '0', Unit: 'USD' } } },
      ],
    }],
  })

  assert.equal(normalized.nextPageToken, 'page-2')
  assert.deepEqual(normalized.items, [{
    date: '2026-09-01',
    provider: 'aws',
    account: '111111111111',
    project: '111111111111',
    service: 'Amazon Elastic Compute Cloud - Compute',
    amountUsd: 12.345,
  }])
})

test('normalizeAwsPage rejects a non-USD Cost Explorer response', () => {
  assert.throws(() => normalizeAwsPage({
    ResultsByTime: [{
      TimePeriod: { Start: '2026-09-01' },
      Groups: [{ Keys: ['EC2', '111'], Metrics: { NetUnblendedCost: { Amount: '3', Unit: 'EUR' } } }],
    }],
  }), /requires USD/)
})

test('normalizeGcpRows applies credits and the exported currency conversion rate', () => {
  assert.deepEqual(normalizeGcpRows([{
    usageDate: { value: '2026-09-04' },
    account: 'ABCDEF-123456-ABCDEF',
    project: null,
    service: 'Cloud Run',
    cost: '120000',
    credits: '-20000',
    currencyConversionRate: '4000',
  }]), [{
    date: '2026-09-04',
    provider: 'gcp',
    account: 'ABCDEF-123456-ABCDEF',
    project: 'Unassigned',
    service: 'Cloud Run',
    amountUsd: 25,
  }])
})

test('normalizeGcpRows drops zero, malformed, and non-finite rows', () => {
  assert.deepEqual(normalizeGcpRows([
    { usageDate: 'bad', cost: '10', credits: '0', currencyConversionRate: '1' },
    { usageDate: '2026-09-01', cost: '0', credits: '0', currencyConversionRate: '1' },
    { usageDate: '2026-09-02', cost: '10', credits: '0', currencyConversionRate: '0' },
  ]), [])
})

test('validateBillingTable accepts one fully qualified table and rejects SQL fragments', () => {
  assert.equal(
    validateBillingTable('billing-prod.cost_export.gcp_billing_export_v1_ABCDEF-123456-ABCDEF'),
    'billing-prod.cost_export.gcp_billing_export_v1_ABCDEF-123456-ABCDEF',
  )
  assert.throws(() => validateBillingTable('billing.dataset.table` WHERE TRUE; --'), /project\.dataset\.table/)
  assert.throws(() => validateBillingTable('dataset.table'), /project\.dataset\.table/)
})

test('collectAwsCosts follows Cost Explorer pagination without losing rows', async () => {
  const seenTokens: Array<string | undefined> = []
  const pages = [
    {
      NextPageToken: 'next',
      ResultsByTime: [{ TimePeriod: { Start: '2026-09-01' }, Groups: [{ Keys: ['EC2', '111'], Metrics: { NetUnblendedCost: { Amount: '3', Unit: 'USD' } } }] }],
    },
    {
      ResultsByTime: [{ TimePeriod: { Start: '2026-09-02' }, Groups: [{ Keys: ['S3', '111'], Metrics: { NetUnblendedCost: { Amount: '2', Unit: 'USD' } } }] }],
    },
  ]
  const client = {
    async send(command: { input: { NextPageToken?: string } }) {
      seenTokens.push(command.input.NextPageToken)
      return pages.shift() ?? {}
    },
  }

  const result = await collectAwsCosts(client, '2026-09-01', '2026-09-03')
  assert.deepEqual(seenTokens, [undefined, 'next'])
  assert.deepEqual(result.map((item) => item.amountUsd), [3, 2])
})

test('buildGcpBillingQuery uses a validated table, date parameters, credits, and conversion rate', () => {
  const query = buildGcpBillingQuery('billing-prod.cost_export.gcp_billing_export_v1_ACCOUNT')
  assert.match(query, /`billing-prod\.cost_export\.gcp_billing_export_v1_ACCOUNT`/)
  assert.match(query, /DATE\(usage_start_time\) >= DATE\(@startDate\)/)
  assert.match(query, /UNNEST\(credits\)/)
  assert.match(query, /currency_conversion_rate/)
})
