import assert from 'node:assert/strict'
import test from 'node:test'
import { applyCreditCardCommand, creditCardMonth, emptyCreditCardState,
  type CreditCardState, type CreditCardMonthSummary } from '../electron/credit-card-model.ts'

const now = '2026-10-03T16:00:00.000Z'
const card = { id: 'card', name: 'Card', limit: 2000000, closingDay: 4, dueDay: 31 }
const purchase = { id: 'laptop', name: 'Laptop', amount: 10001,
  installments: 3, firstDueDate: '2026-11-30', status: 'posted' as const }
const initialized = () => applyCreditCardCommand(emptyCreditCardState(), {
  type: 'initialize', requestId: 'setup', card, purchases: [purchase,
    { ...purchase, id: 'cancelled', name: 'Cancelled', amount: 9000, status: 'cancelled' },
  ],
}, now)
const monthsFor = (state: CreditCardState, year = 2026) => Array.from({ length: 12 }, (_, index) =>
  creditCardMonth(state, `${year}-${String(index + 1).padStart(2, '0')}`, '2026-10-03'))
const budgetModel = async () => {
  try { return await import('../src/features/finance/credit-card/budget-model.ts') }
  catch (error) { assert.fail(`Credit card budget breakdown is missing: ${String(error)}`) }
}

test('purchase rows conserve installments across years, with final remainder and due dates', async () => {
  const { creditCardBudgetRows } = await budgetModel()
  const rows = creditCardBudgetRows(monthsFor(initialized()))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].kind, 'purchase')
  assert.equal(rows[0].name, 'Laptop')
  assert.deepEqual(rows[0].months, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3333, 3333])
  assert.deepEqual(rows[0].details[10], [{ dueDate: '2026-11-30', installmentNumber: 1, installmentCount: 3 }])
  assert.deepEqual(rows[0].details[11], [{ dueDate: '2026-12-31', installmentNumber: 2, installmentCount: 3 }])
  assert.deepEqual(rows[0].details[0], [])
  const nextYear = creditCardBudgetRows(monthsFor(initialized(), 2027))
  assert.equal(nextYear[0].id, rows[0].id)
  assert.deepEqual(nextYear[0].months, [3335, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.deepEqual(nextYear[0].details[0], [{ dueDate: '2027-01-31', installmentNumber: 3, installmentCount: 3 }])
})

test('known charges and a larger statement target are separate from purchase principal', async () => {
  const { creditCardBudgetRows } = await budgetModel()
  const state = applyCreditCardCommand(initialized(), { type: 'cycle.save', requestId: 'statement', cycle: {
    id: '2026-11', interest: 100, fees: 200, confirmedAmount: 10000,
    statementConfirmed: true, chargesConfirmed: true,
  } }, now)
  const months = monthsFor(state)
  const rows = creditCardBudgetRows(months)
  assert.deepEqual(rows.map(row => [row.kind, row.months[10]]),
    [['purchase', 3333], ['interest', 100], ['fees', 200], ['statement', 6367]])
  for (const row of rows.filter(row => row.kind !== 'purchase')) {
    assert.deepEqual(row.details[10], [{ dueDate: '2026-11-30' }])
    assert.equal(row.months[11], 0)
  }
  assert.deepEqual(months.map(month => month.planned), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000, 3333])
  months.forEach((month, index) => assert.equal(rows.reduce((sum, row) => sum + row.months[index], 0), month.planned))
})

test('unknown charges do not invent interest or fees and zero rows are absent', async () => {
  const { creditCardBudgetRows } = await budgetModel()
  const months = monthsFor(initialized())
  assert.equal(months[10].cycles[0].estimated, true)
  assert.deepEqual(creditCardBudgetRows(months).map(row => row.kind), ['purchase'])
  assert.deepEqual(creditCardBudgetRows(monthsFor(emptyCreditCardState())), [])
})

test('early partial payments change cash and remaining debt while budget rows stay fixed', async () => {
  const { creditCardBudgetRows } = await budgetModel()
  const before = initialized()
  const paid = applyCreditCardCommand(before, { type: 'payment.save', requestId: 'payment', payment: {
    id: 'payment', paidDate: '2026-10-20', amount: 1000, status: 'completed',
    allocations: [{ cycleId: '2026-11', amount: 1000, principal: [{ purchaseId: 'laptop', amount: 1000 }] }],
  } }, now)
  const months = monthsFor(paid)
  assert.equal(months[9].cashPaid, 1000)
  assert.equal(months[10].remaining, 2333)
  assert.deepEqual(creditCardBudgetRows(months), creditCardBudgetRows(monthsFor(before)))
})

test('multiple cycles in a month retain every installment and charge detail', async () => {
  const { creditCardBudgetRows } = await budgetModel()
  const months = monthsFor(initialized())
  const first = months[10].cycles[0]
  const second = { ...first, id: '2026-12', dueDate: '2026-11-29', principal: 3333,
    interest: 50, fees: 20, target: 3500, installments: [{ ...first.installments[0], number: 2, dueDate: '2026-11-29' }] }
  const combined: CreditCardMonthSummary = { ...months[10], planned: 6833,
    remaining: 6833, totalPayable: 2, cycles: [first, second] }
  months[10] = combined
  months[11] = { ...months[11], planned: 0, remaining: 0, totalPayable: 0, cycles: [] }
  const rows = creditCardBudgetRows(months)
  assert.deepEqual(rows.map(row => [row.kind, row.months[10]]),
    [['purchase', 6666], ['interest', 50], ['fees', 20], ['statement', 97]])
  assert.deepEqual(rows[0].details[10], [
    { dueDate: '2026-11-30', installmentNumber: 1, installmentCount: 3 },
    { dueDate: '2026-11-29', installmentNumber: 2, installmentCount: 3 },
  ])
  months.forEach((month, index) => assert.equal(rows.reduce((sum, row) => sum + row.months[index], 0), month.planned))
})

test('different purchases with the same name remain separate budget rows', async () => {
  const { creditCardBudgetRows } = await budgetModel()
  const state = applyCreditCardCommand(initialized(), { type: 'purchase.save', requestId: 'second',
    purchase: { ...purchase, id: 'second-laptop', amount: 3000, installments: 1 } }, now)
  const rows = creditCardBudgetRows(monthsFor(state))
  assert.equal(rows.length, 2)
  assert.notEqual(rows[0].id, rows[1].id)
  assert.deepEqual(rows.map(row => row.months[10]), [3333, 3000])
})
