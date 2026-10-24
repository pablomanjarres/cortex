import { sumMarket } from '@/lib/food-budget'

export interface MarketLine {
  price: number
  quantity: number
}

/** Spend for a list of purchases; the Finances food sync uses the same rule. */
export const marketItemsTotal = (items: MarketLine[]) => sumMarket([{ items }])

/** Spend per value of `key` (store, category), largest first. */
export function spendBy<T extends MarketLine>(items: T[], key: (item: T) => string): [string, number][] {
  const map = new Map<string, number>()
  for (const item of items) map.set(key(item), (map.get(key(item)) || 0) + marketItemsTotal([item]))
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
}
