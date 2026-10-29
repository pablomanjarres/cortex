import test from 'node:test'
import assert from 'node:assert/strict'
import { BUDGET_GROUPS, budgetItemGroup, budgetItemMatchesMonth } from '../src/features/finance/budget-view.ts'

test('card fees have their own Credit group after Income without changing their expense accounting', () => {
  assert.deepEqual(BUDGET_GROUPS, ['Income', 'Credit', 'Expense', 'Subscription'])
  const item = { id: 'fee', name: 'Example management fee', type: 'Expense' as const, months: Array(12).fill(12000) }
  const fees = new Map([['fee', item]])
  assert.equal(budgetItemGroup(item, fees), 'Credit')
  assert.equal(budgetItemGroup({ ...item, id: 'rent' }, fees), 'Expense')
  assert.equal(budgetItemGroup({ ...item, id: 'salary', type: 'Income' }, fees), 'Income')
  assert.equal(item.type, 'Expense')
})

test('month focus includes planned, received, paid and unconverted fees only in the relevant month', () => {
  const item = { id: 'a', name: 'Item', type: 'Expense' as const, months: Array(12).fill(0) }
  assert.equal(budgetItemMatchesMonth(item, 9), false)
  assert.equal(budgetItemMatchesMonth({ ...item, months: item.months.map((_, index) => index === 9 ? 100 : 0) }, 9), true)
  assert.equal(budgetItemMatchesMonth({ ...item, paidAmounts: item.months.map((_, index) => index === 9 ? 50 : 0) }, 9), true)
  assert.equal(budgetItemMatchesMonth({ ...item, type: 'Income', receivedAmounts: item.months.map((_, index) => index === 9 ? 0 : null) }, 9), true)
  assert.equal(budgetItemMatchesMonth({ ...item, originalMonths: item.months.map((_, index) => index === 9 ? 20 : 0) }, 9), true)
  assert.equal(budgetItemMatchesMonth({ ...item, originalMonths: item.months.map((_, index) => index === 9 ? 20 : 0) }, 8), false)
})
