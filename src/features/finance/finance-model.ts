export type ItemType = 'Income' | 'Expense' | 'Subscription'

export interface FinanceItem {
  id: string
  name: string
  type: ItemType
  category?: string
  months: number[]
  paid?: boolean[]
  paidAmounts?: number[]
}

export interface OneTimePayment {
  id: string
  name: string
  amount: number
  date: string
  category: string
  paid: boolean
}

export interface FinanceData {
  year: number
  items: FinanceItem[]
  oneTimePayments?: OneTimePayment[]
}

export const FINANCE_CATEGORIES = ['AI', 'Infrastructure', 'Creative', 'Productivity', 'Apps', 'Food', 'Personal Care', 'Home', 'Debt', 'Health', 'Transport', 'Education', 'Entertainment', 'Other'] as const

export function financeMonth(data: FinanceData, month: number) {
  const prefix = `${data.year}-${String(month + 1).padStart(2, '0')}-`
  const oneTimePayments = (data.oneTimePayments ?? []).filter((payment) => payment.date.startsWith(prefix))
  const income = data.items
    .filter((item) => item.type === 'Income')
    .reduce((total, item) => total + (item.months[month] || 0), 0)
  const payable = data.items.filter((item) => item.type !== 'Income' && item.months[month] > 0)
  const budgetExpenses = payable.reduce((total, item) => total + item.months[month], 0)
  const oneTimeTotal = oneTimePayments.reduce((total, payment) => total + payment.amount, 0)
  const expenses = budgetExpenses + oneTimeTotal
  const paidFor = (item: FinanceItem) => item.paidAmounts?.[month] ?? (item.paid?.[month] ? item.months[month] : 0)
  const paidTotal = payable.reduce((total, item) => total + paidFor(item), 0)
    + oneTimePayments.reduce((total, payment) => total + (payment.paid ? payment.amount : 0), 0)
  const pending = payable.reduce((total, item) => total + Math.max(0, item.months[month] - paidFor(item)), 0)
    + oneTimePayments.reduce((total, payment) => total + (payment.paid ? 0 : payment.amount), 0)
  const categoryTotals = new Map<string, number>()
  for (const item of payable) {
    const category = item.category || 'Other'
    categoryTotals.set(category, (categoryTotals.get(category) || 0) + item.months[month])
  }
  for (const payment of oneTimePayments) {
    const category = payment.category || 'Other'
    categoryTotals.set(category, (categoryTotals.get(category) || 0) + payment.amount)
  }

  return {
    income,
    expenses,
    oneTimeTotal,
    savings: income - expenses,
    balance: income - paidTotal,
    pending,
    paidCount: payable.filter((item) => item.paid?.[month] ?? false).length
      + oneTimePayments.filter((payment) => payment.paid).length,
    totalPayable: payable.length + oneTimePayments.length,
    oneTimePayments,
    categoryBreakdown: Array.from(categoryTotals, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
  }
}
