import assert from 'node:assert/strict'
import test from 'node:test'
import type { AccountFee, FinancialAccount } from '../src/features/finance/accounts/account-model.ts'
import { financeMonth, type FinanceData } from '../src/features/finance/finance-model.ts'
import {
  projectAccountFees,
  withAccountFeePayment,
  type AccountFeePayments,
} from '../src/features/finance/accounts/account-budget.ts'

type BudgetFee = AccountFee & { budgetAmountCOP?: number }
type BudgetAccount = Omit<FinancialAccount, 'fees'> & { fees: BudgetFee[] }

const fee = (overrides: Partial<BudgetFee> = {}): BudgetFee => ({
  id: 'fee-1', name: 'Cuota de manejo', amount: 15_000, cadence: 'monthly', nextChargeDate: '2026-01-10', ...overrides,
})
const account = (overrides: Partial<BudgetAccount> = {}): FinancialAccount => ({
  id: 'bank-1', name: 'Nómina', institution: 'Bancolombia', kind: 'bank', currency: 'COP',
  archived: false, fees: [fee()], ...overrides,
}) as FinancialAccount
const flags = (...indexes: number[]) => Array.from({ length: 12 }, (_, i) => indexes.includes(i))
const amounts = (amount: number, ...indexes: number[]) => Array.from({ length: 12 }, (_, i) => (indexes.includes(i) ? amount : 0))
const project = (fees: BudgetFee[], year = 2026, overrides: Partial<BudgetAccount> = {}) =>
  projectAccountFees([account({ fees, ...overrides })], year)

test('monthly fees charge every month from the anchor month, never before it', () => {
  const [row] = project([fee({ nextChargeDate: '2026-04-30' })])
  assert.deepEqual(row.months, amounts(15_000, 3, 4, 5, 6, 7, 8, 9, 10, 11))
  assert.deepEqual(row.originalMonths, row.months)
  assert.equal(row.missingDate, false)
  assert.equal(row.missingRate, false)

  const [earlier] = project([fee({ nextChargeDate: '2024-11-05' })])
  assert.deepEqual(earlier.months, amounts(15_000, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11), 'anchors in past years recur into this year')
  const [later] = project([fee({ nextChargeDate: '2027-01-01' })])
  assert.deepEqual(later.months, amounts(0), 'anchors after the year produce no charges')
})

test('quarterly fees keep a three-month spacing across year boundaries', () => {
  assert.deepEqual(project([fee({ cadence: 'quarterly', nextChargeDate: '2026-02-15' })])[0].months, amounts(15_000, 1, 4, 7, 10))
  assert.deepEqual(project([fee({ cadence: 'quarterly', nextChargeDate: '2025-12-01' })])[0].months, amounts(15_000, 2, 5, 8, 11))
  assert.deepEqual(project([fee({ cadence: 'quarterly', nextChargeDate: '2026-12-01' })])[0].months, amounts(15_000, 11))
  assert.deepEqual(project([fee({ cadence: 'quarterly', nextChargeDate: '2026-12-01' })], 2027)[0].months, amounts(15_000, 2, 5, 8, 11))
})

test('yearly fees land once per year in the anchor month, including December', () => {
  assert.deepEqual(project([fee({ cadence: 'yearly', nextChargeDate: '2026-12-31' })])[0].months, amounts(15_000, 11))
  assert.deepEqual(project([fee({ cadence: 'yearly', nextChargeDate: '2026-12-31' })], 2028)[0].months, amounts(15_000, 11))
  assert.deepEqual(project([fee({ cadence: 'yearly', nextChargeDate: '2026-12-31' })], 2025)[0].months, amounts(0), 'no backdating')
  assert.deepEqual(project([fee({ cadence: 'yearly', nextChargeDate: '2023-03-01' })])[0].months, amounts(15_000, 2))
})

test('one-time fees appear only in their exact month and year', () => {
  assert.deepEqual(project([fee({ cadence: 'once', nextChargeDate: '2026-12-01' })])[0].months, amounts(15_000, 11))
  assert.deepEqual(project([fee({ cadence: 'once', nextChargeDate: '2026-12-01' })], 2027)[0].months, amounts(0))
  assert.deepEqual(project([fee({ cadence: 'once', nextChargeDate: '2025-06-01' })])[0].months, amounts(0))
})

test('unscheduled fees still produce a visible zero row flagged as missing a date', () => {
  const [row] = project([fee({ nextChargeDate: undefined })])
  assert.deepEqual(row.months, amounts(0))
  assert.deepEqual(row.originalMonths, amounts(0))
  assert.equal(row.missingDate, true)
  assert.equal(row.missingRate, false)
})

test('rows carry budget metadata and only active accounts are projected', () => {
  const rows = projectAccountFees([
    account(),
    account({ id: 'old', archived: true, fees: [fee({ id: 'gone' })] }),
    account({ id: 'card', name: 'Visa', kind: 'credit', fees: [fee({ id: 'a', name: 'Anualidad' }), fee({ id: 'b', name: 'Seguro' })] }),
  ], 2026)
  assert.deepEqual(rows.map((row) => row.id), ['account-fee:bank-1:fee-1', 'account-fee:card:a', 'account-fee:card:b'])
  const [first] = rows
  assert.equal(first.name, 'Nómina · Cuota de manejo')
  assert.equal(first.type, 'Expense')
  assert.equal(first.category, 'Other')
  assert.equal(first.sourceAccountId, 'bank-1')
  assert.equal(first.sourceFeeId, 'fee-1')
  assert.equal(first.originalCurrency, 'COP')
})

test('row ids do not collide when ids contain the separator', () => {
  const rows = projectAccountFees([
    account({ id: 'a:b', fees: [fee({ id: 'c' })] }),
    account({ id: 'a', fees: [fee({ id: 'b:c' })] }),
    account({ id: 'a%3Ab', fees: [fee({ id: 'c' })] }),
  ], 2026)
  const ids = rows.map((row) => row.id)
  assert.equal(new Set(ids).size, 3, ids.join(' | '))
  assert.ok(ids.every((id) => id.startsWith('account-fee:')))
  assert.equal(ids[0], 'account-fee:a%3Ab:c')
})

test('foreign fees without a COP amount budget zero COP but keep their original schedule', () => {
  const [row] = project([fee({ amount: 9.99, nextChargeDate: '2026-10-03' })], 2026, { currency: 'USD' })
  assert.equal(row.missingRate, true)
  assert.equal(row.originalCurrency, 'USD')
  assert.deepEqual(row.months, amounts(0))
  assert.deepEqual(row.originalMonths, amounts(9.99, 9, 10, 11))
  const month = financeMonth({ year: 2026, items: [row] }, 9)
  assert.equal(month.expenses, 0, 'USD never leaks into COP totals')
  assert.equal(month.totalPayable, 0)

  for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY, 2 ** 60]) {
    const [invalid] = project([fee({ amount: 9.99, budgetAmountCOP: bad })], 2026, { currency: 'EUR' })
    assert.equal(invalid.missingRate, true, String(bad))
    assert.deepEqual(invalid.months, amounts(0))
  }
})

test('foreign fees with a COP charge amount budget that whole amount', () => {
  const [row] = project([fee({ amount: 9.99, budgetAmountCOP: 41_250.6, nextChargeDate: '2026-11-03' })], 2026, { currency: 'USD' })
  assert.equal(row.missingRate, false)
  assert.deepEqual(row.months, amounts(41_251, 10, 11))
  assert.deepEqual(row.originalMonths, amounts(9.99, 10, 11))
})

test('COP fee amounts are rounded to whole pesos', () => {
  assert.deepEqual(project([fee({ amount: 15_000.5, cadence: 'once', nextChargeDate: '2026-05-01' })])[0].months, amounts(15_001, 4))
  assert.deepEqual(project([fee({ amount: 15_000.49, cadence: 'once', nextChargeDate: '2026-05-01' })])[0].months, amounts(15_000, 4))
  assert.ok(project([fee({ amount: 0.4 })])[0].months.every((value) => Number.isSafeInteger(value)))
})

test('invalid years, oversized inputs and corrupt amounts are rejected instead of dropped', () => {
  for (const year of [Number.NaN, 2026.5, -1, 0, 10_000, Number.POSITIVE_INFINITY]) {
    assert.throws(() => projectAccountFees([account()], year), RangeError, String(year))
  }
  const many = Array.from({ length: 101 }, (_, i) => account({ id: `a${i}` }))
  assert.throws(() => projectAccountFees(many, 2026), RangeError)
  assert.equal(projectAccountFees(many.slice(0, 100), 2026).length, 100, 'the maximum is accepted in full')
  const fees = Array.from({ length: 21 }, (_, i) => fee({ id: `f${i}` }))
  assert.throws(() => project(fees), RangeError)
  assert.equal(project(fees.slice(0, 20)).length, 20)
  for (const amount of [Number.NaN, -5, Number.POSITIVE_INFINITY, 1e300]) {
    assert.throws(() => project([fee({ amount })]), RangeError, String(amount))
  }
})

test('persisted payments settle the projected row without a duplicate expense', () => {
  const payments: AccountFeePayments = { 'account-fee:bank-1:fee-1': { '2026-10': 5_000, '2026-11': 15_000, '2025-10': 99 } }
  const rows = projectAccountFees([account({ fees: [fee({ nextChargeDate: '2026-10-10' })] })], 2026, payments)
  const [row] = rows
  assert.deepEqual(row.paidAmounts, amounts(0).map((_, i) => (i === 9 ? 5_000 : i === 10 ? 15_000 : 0)))
  assert.deepEqual(row.paid, flags(10))

  const data: FinanceData = { year: 2026, items: [{ id: 'rent', name: 'Rent', type: 'Expense', months: amounts(100_000, 9) }] }
  const october = financeMonth({ ...data, items: [...data.items, ...rows] }, 9)
  assert.equal(october.expenses, 115_000, 'the fee is counted once')
  assert.equal(october.pending, 110_000)
  assert.equal(october.balance, -5_000)
  assert.equal(october.totalPayable, 2)
  const november = financeMonth({ ...data, items: [...data.items, ...rows] }, 10)
  assert.equal(november.pending, 0)
  assert.equal(november.paidCount, 1)
})

test('payments in months without a projected charge are ignored but kept in the store', () => {
  const payments: AccountFeePayments = { 'account-fee:bank-1:fee-1': { '2026-02': 15_000, '2026-03': -4, '2026-04': 1.5 } }
  const snapshot = structuredClone(payments)
  const [row] = projectAccountFees([account({ fees: [fee({ cadence: 'quarterly', nextChargeDate: '2026-03-01' })] })], 2026, payments)
  assert.deepEqual(row.paidAmounts, amounts(0), 'February is not charged; invalid amounts read as unpaid')
  assert.deepEqual(row.paid, flags())
  assert.deepEqual(payments, snapshot)
  assert.equal(financeMonth({ year: 2026, items: [row] }, 1).balance, 0)

  const archived = projectAccountFees([account({ archived: true })], 2026, payments)
  assert.deepEqual(archived, [])
  assert.deepEqual(payments, snapshot)
})

test('withAccountFeePayment records, edits and clears payments immutably', () => {
  const id = 'account-fee:bank-1:fee-1'
  const base = {
    year: 2026,
    items: [{ id: 'rent', name: 'Rent', type: 'Expense' as const, months: amounts(1, 0) }],
    oneTimePayments: [],
    accountFeePayments: { [id]: { '2025-12': 7 }, 'account-fee:other:x': { '2026-01': 3 } },
  }
  const snapshot = structuredClone(base)

  const recorded = withAccountFeePayment(base, id, 9, 5_000)
  assert.deepEqual(base, snapshot, 'input is not mutated')
  assert.deepEqual(recorded.accountFeePayments, { [id]: { '2025-12': 7, '2026-10': 5_000 }, 'account-fee:other:x': { '2026-01': 3 } })
  assert.equal(recorded.items, base.items, 'items are untouched and generated rows are never inserted')
  assert.equal(recorded.oneTimePayments, base.oneTimePayments)
  assert.equal(recorded.accountFeePayments?.['account-fee:other:x'], base.accountFeePayments['account-fee:other:x'])

  const edited = withAccountFeePayment(recorded, id, 9, 15_000)
  assert.equal(edited.accountFeePayments?.[id]['2026-10'], 15_000)
  assert.equal(recorded.accountFeePayments?.[id]['2026-10'], 5_000)
  assert.equal(withAccountFeePayment(edited, id, 9, null).accountFeePayments?.[id]['2026-10'], 0)

  const fresh = withAccountFeePayment({ year: 2026, items: [] }, 'account-fee:new:fee', 0, 1)
  assert.deepEqual(fresh, { year: 2026, items: [], accountFeePayments: { 'account-fee:new:fee': { '2026-01': 1 } } })
})

test('withAccountFeePayment validates month, id and amount', () => {
  const data = { year: 2026, items: [] }
  const id = 'account-fee:bank-1:fee-1'
  for (const month of [-1, 12, 1.5, Number.NaN]) assert.throws(() => withAccountFeePayment(data, id, month, 1), RangeError)
  for (const amount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) {
    assert.throws(() => withAccountFeePayment(data, id, 0, amount), RangeError, String(amount))
  }
  for (const bad of ['rent', '', 'account-fee', '__proto__']) assert.throws(() => withAccountFeePayment(data, bad, 0, 1), RangeError)
  assert.throws(() => withAccountFeePayment({ year: 2026.5, items: [] }, id, 0, 1), RangeError)
})
