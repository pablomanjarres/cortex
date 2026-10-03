import type { CreditCardMonthSummary } from '../../../electron/credit-card-types'
import { creditCardMonthDate } from '../../../electron/credit-card-dates'

export type ItemType = 'Income' | 'Expense' | 'Subscription'

export interface FinanceItem {
  id: string
  name: string
  type: ItemType
  category?: string
  billingDay?: number
  months: number[]
  paid?: boolean[]
  paidAmounts?: number[]
  receivedAmounts?: (number | null)[]
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

function validBillingDay(day: unknown): day is number {
  return typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31
}

export function billingDateFor(item: FinanceItem, year: number, monthIndex: number): string | null {
  if (item.type === 'Income' || !validBillingDay(item.billingDay) || !Number.isInteger(year)
    || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null
  try {
    return creditCardMonthDate(`${year}-${String(monthIndex + 1).padStart(2, '0')}`, item.billingDay)
  } catch {
    return null
  }
}

export function withBillingDay(data: FinanceData, id: string, day: number | null): FinanceData {
  if (day !== null && !validBillingDay(day)) throw new RangeError('Billing day must be null or a whole day from 1 to 31')
  let changed = false
  const items = data.items.map((item) => {
    if (item.id !== id || item.type === 'Income') return item
    changed = true
    const updated = { ...item }
    if (day === null) delete updated.billingDay
    else updated.billingDay = day
    return updated
  })
  return changed ? { ...data, items } : data
}

export function receivedAmountFor(item: FinanceItem, month: number): number | null {
  if (item.type !== 'Income') return null
  const amount = item.receivedAmounts?.[month]
  return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 ? amount : null
}

export function withReceivedAmount(data: FinanceData, id: string, month: number, amount: number | null): FinanceData {
  if (!Number.isInteger(month) || month < 0 || month > 11 || (amount !== null && (!Number.isSafeInteger(amount) || amount < 0))) {
    throw new RangeError('Received income must be null or a non-negative whole amount in a valid month')
  }
  let changed = false
  const items = data.items.map((item) => {
    if (item.id !== id || item.type !== 'Income') return item
    changed = true
    const receivedAmounts = Array.from({ length: 12 }, (_, index) => item.receivedAmounts?.[index] ?? null)
    receivedAmounts[month] = amount
    return { ...item, receivedAmounts }
  })
  return changed ? { ...data, items } : data
}

export function financeMonth(data: FinanceData, month: number, cardMonth?: CreditCardMonthSummary) {
  const prefix = `${data.year}-${String(month + 1).padStart(2, '0')}-`
  const card = cardMonth?.yearMonth === prefix.slice(0, 7) ? cardMonth : undefined
  const oneTimePayments = (data.oneTimePayments ?? []).filter((payment) => payment.date.startsWith(prefix))
  const incomeItems = data.items.filter((item) => item.type === 'Income')
  const income = incomeItems.reduce((total, item) => total + (item.months[month] || 0), 0)
  const receivedIncome = incomeItems.reduce((total, item) => total + (receivedAmountFor(item, month) ?? 0), 0)
  const isTrackingReceivedIncome = incomeItems.some((item) => receivedAmountFor(item, month) !== null)
  const balanceIncome = isTrackingReceivedIncome ? receivedIncome : income
  const payable = data.items.filter((item) => item.type !== 'Income' && item.months[month] > 0)
  const budgetExpenses = payable.reduce((total, item) => total + item.months[month], 0)
  const oneTimeTotal = oneTimePayments.reduce((total, payment) => total + payment.amount, 0)
  const expenses = budgetExpenses + oneTimeTotal + (card?.planned ?? 0)
  const paidFor = (item: FinanceItem) => item.paidAmounts?.[month] ?? (item.paid?.[month] ? item.months[month] : 0)
  const paidTotal = payable.reduce((total, item) => total + paidFor(item), 0)
    + oneTimePayments.reduce((total, payment) => total + (payment.paid ? payment.amount : 0), 0)
    + (card?.cashPaid ?? 0)
  const pending = payable.reduce((total, item) => total + Math.max(0, item.months[month] - paidFor(item)), 0)
    + oneTimePayments.reduce((total, payment) => total + (payment.paid ? 0 : payment.amount), 0)
    + (card?.remaining ?? 0)
  const categoryTotals = new Map<string, number>()
  for (const item of payable) {
    const category = item.category || 'Other'
    categoryTotals.set(category, (categoryTotals.get(category) || 0) + item.months[month])
  }
  for (const payment of oneTimePayments) {
    const category = payment.category || 'Other'
    categoryTotals.set(category, (categoryTotals.get(category) || 0) + payment.amount)
  }
  if (card && card.planned > 0) categoryTotals.set('Credit card', (categoryTotals.get('Credit card') ?? 0) + card.planned)

  return {
    income,
    receivedIncome,
    expenses,
    oneTimeTotal,
    savings: income - expenses,
    balance: balanceIncome - paidTotal,
    pending,
    paidCount: payable.filter((item) => item.paid?.[month] ?? false).length
      + oneTimePayments.filter((payment) => payment.paid).length + (card?.paidCount ?? 0),
    totalPayable: payable.length + oneTimePayments.length + (card?.totalPayable ?? 0),
    oneTimePayments,
    categoryBreakdown: Array.from(categoryTotals, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
  }
}
