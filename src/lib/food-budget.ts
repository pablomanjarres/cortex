// Single source of truth for the food budget: the Market ledger is where grocery spend
// lives; the Finances `Food` expense line is a derived rollup of it. These helpers keep
// them in sync (used by MarketLog live-sync + backfill; the MCP add_bill mirrors the same).

export interface FinanceItemLike {
  id: string
  name: string
  type: string
  category?: string
  months: number[]
  paid?: boolean[]
  paidAmounts?: number[]
}

export interface FinanceDataLike {
  year: number
  items: FinanceItemLike[]
}

const isFood = (it: FinanceItemLike) => it.type === 'Expense' && it.category === 'Food'

const fill12 = <T,>(src: T[] | undefined, empty: T): T[] => Array.from({ length: 12 }, (_, i) => src?.[i] ?? empty)

/** Total planned Food budget for a month (sum of all Food expense lines' months[month]). */
export function foodBudgetForMonth(fin: FinanceDataLike, month: number): number {
  return fin.items.filter(isFood).reduce((s, it) => s + (it.months?.[month] || 0), 0)
}

/** The primary Food line (prefer one literally named "Food", else the first Food expense). */
function primaryFoodIndex(fin: FinanceDataLike): number {
  const named = fin.items.findIndex((it) => isFood(it) && it.name === 'Food')
  return named >= 0 ? named : fin.items.findIndex(isFood)
}

/** The market-derived spend recorded on the primary Food line for a month (for change-guards). */
export function foodSpentPrimary(fin: FinanceDataLike, month: number): number {
  const idx = primaryFoodIndex(fin)
  return idx < 0 ? 0 : fin.items[idx].paidAmounts?.[month] || 0
}

function ensurePrimaryFood(fin: FinanceDataLike): { items: FinanceItemLike[]; idx: number } {
  const idx = primaryFoodIndex(fin)
  if (idx >= 0) return { items: fin.items, idx }
  const item: FinanceItemLike = {
    id: `fin-food-${fin.year}`,
    name: 'Food',
    type: 'Expense',
    category: 'Food',
    months: fill12<number>(undefined, 0),
    paid: fill12<boolean>(undefined, false),
    paidAmounts: fill12<number>(undefined, 0),
  }
  const items = [...fin.items, item]
  return { items, idx: items.length - 1 }
}

/** New FinanceData with the primary Food line's paidAmounts[month] set to `amount` (idempotent). */
export function withFoodSpent(fin: FinanceDataLike, month: number, amount: number): FinanceDataLike {
  const { items, idx } = ensurePrimaryFood(fin)
  const target = items[idx]
  const paidAmounts = fill12<number>(target.paidAmounts, 0)
  paidAmounts[month] = amount
  const months = fill12<number>(target.months, 0)
  const paid = fill12<boolean>(target.paid, false)
  paid[month] = months[month] > 0 && amount >= months[month]
  return { ...fin, items: items.map((it, i) => (i === idx ? { ...it, paidAmounts, paid } : it)) }
}

/** New FinanceData with the primary Food line's months[month] (the budget) set to `amount`. */
export function withFoodBudget(fin: FinanceDataLike, month: number, amount: number): FinanceDataLike {
  const { items, idx } = ensurePrimaryFood(fin)
  const months = fill12<number>(items[idx].months, 0)
  months[month] = amount
  return { ...fin, items: items.map((it, i) => (i === idx ? { ...it, months } : it)) }
}

/** Sum price×quantity across a set of weekly market logs. */
export function sumMarket(weeks: { items?: { price: number; quantity: number }[] }[]): number {
  return weeks.reduce((s, w) => s + (w.items || []).reduce((t, it) => t + it.price * it.quantity, 0), 0)
}
