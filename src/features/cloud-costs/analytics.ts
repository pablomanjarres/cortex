import type {
  CloudCostLineItem,
  CloudProviderFilter,
} from '../../../electron/cloud-cost-types.ts'

export interface MonthlyCostPoint {
  month: string
  aws: number
  gcp: number
  total: number
}

export interface DailyCostPoint {
  date: string
  aws: number
  gcp: number
  total: number
}

export interface CloudCostSummary {
  currentMonth: number
  previousMonth: number
  changePct: number | null
  projectedMonth: number
  budgetPct: number | null
  total13Months: number
}

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export const monthOf = (date: string) => date.slice(0, 7)
export const includesProvider = (item: CloudCostLineItem, provider: CloudProviderFilter) =>
  provider === 'all' || item.provider === provider

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function previousMonth(month: string): string {
  const [year, value] = month.split('-').map(Number)
  return monthKey(new Date(Date.UTC(year, value - 2, 1)))
}

function retainedMonths(now: Date): string[] {
  return Array.from({ length: 13 }, (_, index) => {
    const offset = 12 - index
    return monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)))
  })
}

function totalForMonth(
  items: ReadonlyArray<CloudCostLineItem>,
  provider: CloudProviderFilter,
  month: string,
): number {
  return items.reduce(
    (sum, item) => sum + (includesProvider(item, provider) && monthOf(item.date) === month ? item.amountUsd : 0),
    0,
  )
}

export function monthlySeries(
  items: ReadonlyArray<CloudCostLineItem>,
  provider: CloudProviderFilter,
  now: Date,
): MonthlyCostPoint[] {
  const byMonth = new Map<string, { aws: number; gcp: number }>()
  for (const item of items) {
    if (!includesProvider(item, provider)) continue
    const month = monthOf(item.date)
    const point = byMonth.get(month) ?? { aws: 0, gcp: 0 }
    point[item.provider] += item.amountUsd
    byMonth.set(month, point)
  }
  return retainedMonths(now).map((month) => {
    const point = byMonth.get(month) ?? { aws: 0, gcp: 0 }
    const aws = roundMoney(point.aws)
    const gcp = roundMoney(point.gcp)
    return { month, aws, gcp, total: roundMoney(aws + gcp) }
  })
}

export function dailyCumulativeSeries(
  items: ReadonlyArray<CloudCostLineItem>,
  provider: CloudProviderFilter,
  month: string,
): DailyCostPoint[] {
  const daily = new Map<string, { aws: number; gcp: number }>()
  for (const item of items) {
    if (!includesProvider(item, provider) || monthOf(item.date) !== month) continue
    const point = daily.get(item.date) ?? { aws: 0, gcp: 0 }
    point[item.provider] += item.amountUsd
    daily.set(item.date, point)
  }
  let aws = 0
  let gcp = 0
  return [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, point]) => {
    aws += point.aws
    gcp += point.gcp
    return { date, aws: roundMoney(aws), gcp: roundMoney(gcp), total: roundMoney(aws + gcp) }
  })
}

export function cloudCostSummary(
  items: ReadonlyArray<CloudCostLineItem>,
  provider: CloudProviderFilter,
  now: Date,
  monthlyBudgetUsd: number,
): CloudCostSummary {
  const currentKey = monthKey(now)
  const previousKey = previousMonth(currentKey)
  const currentMonth = totalForMonth(items, provider, currentKey)
  const previousMonthTotal = totalForMonth(items, provider, previousKey)
  const elapsedDays = now.getUTCDate()
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
  const retained = new Set(retainedMonths(now))
  const total13Months = items.reduce(
    (sum, item) => sum + (includesProvider(item, provider) && retained.has(monthOf(item.date)) ? item.amountUsd : 0),
    0,
  )
  return {
    currentMonth: roundMoney(currentMonth),
    previousMonth: roundMoney(previousMonthTotal),
    changePct: previousMonthTotal === 0 ? null : roundMoney(((currentMonth - previousMonthTotal) / previousMonthTotal) * 100),
    projectedMonth: roundMoney((currentMonth / elapsedDays) * daysInMonth),
    budgetPct: monthlyBudgetUsd > 0 ? roundMoney((currentMonth / monthlyBudgetUsd) * 100) : null,
    total13Months: roundMoney(total13Months),
  }
}
