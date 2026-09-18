import type { CloudCostLineItem } from './cloud-cost-types.js'

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

export interface NormalizedAwsPage {
  items: CloudCostLineItem[]
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

export function normalizeAwsPage(page: AwsCostExplorerPage): NormalizedAwsPage {
  const items: CloudCostLineItem[] = []
  for (const result of page.ResultsByTime ?? []) {
    const date = dateValue(result.TimePeriod?.Start)
    if (!date) continue
    for (const group of result.Groups ?? []) {
      const metric = group.Metrics?.NetUnblendedCost
      const amount = finiteNumber(metric?.Amount)
      if (amount === null || amount === 0) continue
      if (metric?.Unit !== 'USD') {
        throw new Error(`AWS Cost Explorer returned ${metric?.Unit ?? 'an unknown currency'}; Cortex requires USD`)
      }
      const service = text(group.Keys?.[0], 'Unassigned service')
      const account = text(group.Keys?.[1], 'Unassigned account')
      items.push({ date, provider: 'aws', account, project: account, service, amountUsd: amount })
    }
  }
  return { items, nextPageToken: page.NextPageToken }
}

export function normalizeGcpRows(rows: ReadonlyArray<unknown>): CloudCostLineItem[] {
  const items: CloudCostLineItem[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const date = dateValue(row.usageDate)
    const cost = finiteNumber(row.cost)
    const credits = finiteNumber(row.credits) ?? 0
    const rate = finiteNumber(row.currencyConversionRate)
    if (!date || cost === null || rate === null || rate <= 0) continue
    const amountUsd = (cost + credits) / rate
    if (!Number.isFinite(amountUsd) || amountUsd === 0) continue
    items.push({
      date,
      provider: 'gcp',
      account: text(row.account, 'Unassigned billing account'),
      project: text(row.project, 'Unassigned'),
      service: text(row.service, 'Unassigned service'),
      amountUsd,
    })
  }
  return items
}

export function validateBillingTable(value: string): string {
  const table = value.trim()
  if (!BILLING_TABLE.test(table)) {
    throw new Error('GCP billing table must use project.dataset.table format')
  }
  return table
}
