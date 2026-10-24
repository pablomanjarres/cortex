import test from 'node:test'
import assert from 'node:assert/strict'
import { budgetItemMatchesMonth } from '../src/features/finance/budget-view.ts'

test('month focus includes planned, received, paid and unconverted fees only in the relevant month', () => {
  const item = { id: 'a', name: 'Item', type: 'Expense' as const, months: Array(12).fill(0) }
  assert.equal(budgetItemMatchesMonth(item, 9), false)
  assert.equal(budgetItemMatchesMonth({ ...item, months: item.months.map((_, index) => index === 9 ? 100 : 0) }, 9), true)
  assert.equal(budgetItemMatchesMonth({ ...item, paidAmounts: item.months.map((_, index) => index === 9 ? 50 : 0) }, 9), true)
  assert.equal(budgetItemMatchesMonth({ ...item, type: 'Income', receivedAmounts: item.months.map((_, index) => index === 9 ? 0 : null) }, 9), true)
  assert.equal(budgetItemMatchesMonth({ ...item, originalMonths: item.months.map((_, index) => index === 9 ? 20 : 0) }, 9), true)
  assert.equal(budgetItemMatchesMonth({ ...item, originalMonths: item.months.map((_, index) => index === 9 ? 20 : 0) }, 8), false)
})
