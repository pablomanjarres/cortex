import type {
  CloudCostLineItem,
  CloudProvider,
  CloudProviderFilter,
} from '../../../electron/cloud-cost-types.ts'
import { includesProvider, monthOf, roundMoney } from './analytics.ts'

export interface RankedCost {
  name: string
  amount: number
  share: number
}

export interface ProjectCost extends RankedCost {
  provider: CloudProvider
}

export interface SpendDriver {
  name: string
  current: number
  previous: number
  delta: number
}

export function topServices(
  items: ReadonlyArray<CloudCostLineItem>,
  provider: CloudProviderFilter,
  month: string,
): RankedCost[] {
  const totals = new Map<string, number>()
  for (const item of items) {
    if (!includesProvider(item, provider) || monthOf(item.date) !== month) continue
    totals.set(item.service, (totals.get(item.service) ?? 0) + item.amountUsd)
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const total = sorted.reduce((sum, [, amount]) => sum + amount, 0)
  const visible = sorted.slice(0, 5)
  const remaining = sorted.slice(5).reduce((sum, [, amount]) => sum + amount, 0)
  if (sorted.length > 5) visible.push(['Other', remaining])
  return visible.map(([name, amount]) => ({
    name,
    amount: roundMoney(amount),
    share: total === 0 ? 0 : roundMoney((amount / total) * 100),
  }))
}

export function projectRanking(
  items: ReadonlyArray<CloudCostLineItem>,
  provider: CloudProviderFilter,
  month: string,
): ProjectCost[] {
  const totals = new Map<string, { name: string; provider: CloudProvider; amount: number }>()
  for (const item of items) {
    if (!includesProvider(item, provider) || monthOf(item.date) !== month) continue
    const key = `${item.provider}:${item.project}`
    const current = totals.get(key) ?? { name: item.project, provider: item.provider, amount: 0 }
    current.amount += item.amountUsd
    totals.set(key, current)
  }
  const sorted = [...totals.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
  const total = sorted.reduce((sum, item) => sum + item.amount, 0)
  return sorted.map((item) => ({
    ...item,
    amount: roundMoney(item.amount),
    share: total === 0 ? 0 : roundMoney((item.amount / total) * 100),
  }))
}

export function spendDrivers(
  items: ReadonlyArray<CloudCostLineItem>,
  provider: CloudProviderFilter,
  currentMonth: string,
  previousMonthKey: string,
): SpendDriver[] {
  const totals = new Map<string, { current: number; previous: number }>()
  for (const item of items) {
    if (!includesProvider(item, provider)) continue
    const month = monthOf(item.date)
    if (month !== currentMonth && month !== previousMonthKey) continue
    const entry = totals.get(item.service) ?? { current: 0, previous: 0 }
    if (month === currentMonth) entry.current += item.amountUsd
    else entry.previous += item.amountUsd
    totals.set(item.service, entry)
  }
  return [...totals.entries()]
    .map(([name, values]) => ({
      name,
      current: roundMoney(values.current),
      previous: roundMoney(values.previous),
      delta: roundMoney(values.current - values.previous),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name))
    .slice(0, 5)
}
