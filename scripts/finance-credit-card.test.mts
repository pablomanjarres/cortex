import assert from 'node:assert/strict'
import { test } from 'node:test'
import { financeMonth, type FinanceData } from '../src/features/finance/finance-model.ts'
import type { CreditCardMonthSummary } from '../electron/credit-card-types.ts'

const data: FinanceData = { year: 2026, items: [
  { id: 'salary', name: 'Salary', type: 'Income', months: Array(12).fill(900000) },
  { id: 'rent', name: 'Rent', type: 'Expense', category: 'Home', months: Array(12).fill(200000) },
] }
const card = (yearMonth: string, planned = 0, remaining = planned, cashPaid = 0): CreditCardMonthSummary => ({
  yearMonth, planned, remaining, cashPaid, paidCount: remaining === 0 && planned > 0 ? 1 : 0,
  totalPayable: planned > 0 ? 1 : 0, cycles: [],
})

test('due installments extend monthly totals and category exactly once', () => {
  const base = financeMonth(data, 10)
  const projection = card('2026-11', 40000)
  const month = financeMonth(data, 10, projection)
  assert.equal(month.expenses, base.expenses + projection.planned)
  assert.equal(month.savings, base.savings - projection.planned)
  assert.equal(month.pending, base.pending + projection.remaining)
  assert.deepEqual(month.categoryBreakdown.find((row) => row.name === 'Credit card'), { name: 'Credit card', value: 40000 })
  assert.equal(month.totalPayable, base.totalPayable + 1)
})

test('an early payment debits its actual cash month while settling its due month', () => {
  const october = financeMonth(data, 9, card('2026-10', 0, 0, 40000))
  const november = financeMonth(data, 10, card('2026-11', 40000, 0, 0))
  assert.equal(october.balance, 860000)
  assert.equal(october.expenses, 200000)
  assert.equal(november.balance, 900000)
  assert.equal(november.pending, 200000)
  assert.equal(november.paidCount, 1)
})

test('empty card projection preserves every legacy Finance result', () => {
  assert.deepEqual(financeMonth(data, 9, card('2026-10')), financeMonth(data, 9))
})

test('a cross-year projection cannot leak into the annual budget', () => {
  assert.deepEqual(financeMonth(data, 0, card('2027-01', 40000, 40000, 40000)), financeMonth(data, 0))
})
