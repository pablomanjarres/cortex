import type { FinanceItem, ItemType } from './finance-model'

export const ACCOUNT_FEE_GROUP = 'Credit'
export type BudgetGroup = ItemType | typeof ACCOUNT_FEE_GROUP
export const BUDGET_GROUPS: readonly BudgetGroup[] = ['Income', ACCOUNT_FEE_GROUP, 'Expense', 'Subscription']

export function budgetItemGroup(item: FinanceItem, accountFees: ReadonlyMap<string, unknown>): BudgetGroup {
  return accountFees.has(item.id) ? ACCOUNT_FEE_GROUP : item.type
}

export function budgetItemMatchesMonth(item: FinanceItem & { originalMonths?: number[] }, month: number): boolean {
  return Boolean(item.months[month] || item.originalMonths?.[month] || item.paidAmounts?.[month])
    || (item.type === 'Income' && item.receivedAmounts?.[month] != null)
}
