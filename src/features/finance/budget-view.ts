import type { FinanceItem } from './finance-model'

export function budgetItemMatchesMonth(item: FinanceItem & { originalMonths?: number[] }, month: number): boolean {
  return Boolean(item.months[month] || item.originalMonths?.[month] || item.paidAmounts?.[month])
    || (item.type === 'Income' && item.receivedAmounts?.[month] != null)
}
