import assert from 'node:assert/strict'
import test from 'node:test'
import * as finance from '../src/features/finance/finance-model.ts'
import type { FinanceData, FinanceItem } from '../src/features/finance/finance-model.ts'

const expense: FinanceItem = { id: 'rent', name: 'Rent', type: 'Expense', category: 'Home',
  months: Array(12).fill(200000), paid: Array(12).fill(true), paidAmounts: Array(12).fill(180000) }
const data: FinanceData = { year: 2026, items: [expense,
  { id: 'salary', name: 'Salary', type: 'Income', months: Array(12).fill(900000) },
  { id: 'app', name: 'App', type: 'Subscription', months: Array(12).fill(30000) },
] }

test('setting a billing day preserves the budget and paid cash amounts', () => {
  assert.equal(typeof finance.withBillingDay, 'function')
  const updated = finance.withBillingDay(data, 'rent', 31)
  assert.equal(updated.items[0].billingDay, 31)
  assert.equal(updated.items[0].months, expense.months)
  assert.equal(updated.items[0].paid, expense.paid)
  assert.equal(updated.items[0].paidAmounts, expense.paidAmounts)
  assert.equal(updated.items[1], data.items[1])
  assert.equal(expense.billingDay, undefined)
  assert.deepEqual(finance.financeMonth(updated, 9), finance.financeMonth(data, 9))
  assert.equal(finance.withBillingDay(data, 'app', 4).items[2].billingDay, 4)
})

test('billing dates clamp to month end, including leap years', () => {
  assert.equal(typeof finance.billingDateFor, 'function')
  const item = { ...expense, billingDay: 31 }
  for (const [year, month, want] of [
    [2026, 0, '2026-01-31'], [2026, 1, '2026-02-28'],
    [2028, 1, '2028-02-29'], [2026, 3, '2026-04-30'],
  ] as const) assert.equal(finance.billingDateFor(item, year, month), want)
  assert.equal(finance.billingDateFor({ ...item, billingDay: 1 }, 2026, 9), '2026-10-01')
})

test('clearing a billing day removes the optional field without changing the prior item', () => {
  assert.equal(typeof finance.withBillingDay, 'function')
  const scheduled = finance.withBillingDay(data, 'rent', 24)
  const cleared = finance.withBillingDay(scheduled, 'rent', null)
  assert.equal(Object.hasOwn(cleared.items[0], 'billingDay'), false)
  assert.equal(scheduled.items[0].billingDay, 24)
  assert.equal(finance.billingDateFor(cleared.items[0], 2026, 9), null)
  assert.deepEqual(cleared, data)
})

test('income and absent items cannot acquire a billing day', () => {
  assert.equal(typeof finance.withBillingDay, 'function')
  assert.equal(finance.withBillingDay(data, 'salary', 24), data)
  assert.equal(finance.withBillingDay(data, 'missing', 24), data)
  assert.equal(finance.billingDateFor({ ...data.items[1], billingDay: 24 }, 2026, 9), null)
})

test('invalid or missing billing dates are hidden and invalid writes are rejected', () => {
  assert.equal(typeof finance.billingDateFor, 'function')
  assert.equal(finance.billingDateFor(expense, 2026, 9), null)
  for (const day of [0, 32, -1, 1.5, NaN, Infinity]) {
    assert.equal(finance.billingDateFor({ ...expense, billingDay: day }, 2026, 9), null)
    assert.throws(() => finance.withBillingDay(data, 'rent', day), RangeError)
  }
  for (const [year, month] of [[2026, -1], [2026, 12], [2026, 1.5], [NaN, 9], [1899, 0]]) {
    assert.equal(finance.billingDateFor({ ...expense, billingDay: 24 }, year, month), null)
  }
})
