import type { ProviderCosts } from './cloud-cost-types.js'

interface AwsMetricValue {
  Amount?: string
  Unit?: string
}

interface AwsGroup {
  Keys?: string[]
  Metrics?: Record<string, AwsMetricValue | undefined>
}

interface AwsTimeResult {
  TimePeriod?: { Start?: string; End?: string }
  Groups?: AwsGroup[]
}

export interface AwsCostExplorerPage {
  NextPageToken?: string
  ResultsByTime?: AwsTimeResult[]
}

export type AwsCostPass = 'usage' | 'credit' | 'net'

export interface AwsCostRow {
  date: string
  account: string
  service: string
  amountUsd: number
}

export interface NormalizedAwsPage {
  rows: AwsCostRow[]
  nextPageToken?: string
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const BILLING_TABLE = /^[a-z][a-z0-9-]{4,61}[a-z0-9]\.[A-Za-z_][A-Za-z0-9_]{0,1023}\.[A-Za-z0-9_-]+$/

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function dateValue(value: unknown): string | null {
  if (typeof value === 'string') return DATE_ONLY.test(value) ? value : null
  if (value && typeof value === 'object' && 'value' in value) {
    const nested = (value as { value?: unknown }).value
    return typeof nested === 'string' && DATE_ONLY.test(nested) ? nested : null
  }
  return null
}

export function normalizeAwsPage(page: AwsCostExplorerPage, pass: AwsCostPass): NormalizedAwsPage {
  const metricName = { usage: 'AmortizedCost', credit: 'UnblendedCost', net: 'NetAmortizedCost' }[pass]
  const rows: AwsCostRow[] = []
  for (const result of page.ResultsByTime ?? []) {
    const date = dateValue(result.TimePeriod?.Start)
    if (!date) continue
    for (const group of result.Groups ?? []) {
      const metric = group.Metrics?.[metricName]
      const amount = finiteNumber(metric?.Amount)
      if (amount === null || amount === 0) continue
      if (metric?.Unit !== 'USD') {
        throw new Error(`AWS Cost Explorer returned ${metric?.Unit ?? 'an unknown currency'}; Cortex requires USD`)
      }
      const service = text(group.Keys?.[0], 'Unassigned service')
      const account = text(group.Keys?.[1], 'Unassigned account')
      rows.push({ date, account, service, amountUsd: amount })
    }
  }
  return { rows, nextPageToken: page.NextPageToken }
}

export function normalizeGcpRows(rows: ReadonlyArray<unknown>): ProviderCosts {
  const result: ProviderCosts = { usageItems: [], accountAdjustments: [] }
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const date = dateValue(row.usageDate)
    const usageCost = finiteNumber(row.usageCost)
    const otherCost = finiteNumber(row.otherCost) ?? 0
    const credits = finiteNumber(row.credits) ?? 0
    const rate = finiteNumber(row.currencyConversionRate)
    if (!date || usageCost === null || rate === null || rate <= 0) continue
    const account = text(row.account, 'Unassigned billing account')
    const amountUsd = usageCost / rate
    if (amountUsd > 0) {
      result.usageItems.push({
        date,
        provider: 'gcp',
        account,
        project: text(row.project, 'Unassigned'),
        service: text(row.service, 'Unassigned service'),
        resource: typeof row.resource === 'string' && row.resource.trim() ? row.resource.trim() : null,
        amountUsd,
      })
    }
    const otherUsd = (otherCost + Math.min(0, usageCost)) / rate
    if (otherUsd !== 0) {
      result.accountAdjustments.push({ date, provider: 'gcp', account, kind: 'other', amountUsd: otherUsd })
    }
    if (credits !== 0) {
      result.accountAdjustments.push({ date, provider: 'gcp', account, kind: 'credit', amountUsd: credits / rate })
    }
  }
  return result
}

export function validateBillingTable(value: string): string {
  const table = value.trim()
  if (!BILLING_TABLE.test(table)) {
    throw new Error('GCP billing table must use project.dataset.table format')
  }
  return table
}
