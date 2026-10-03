import assert from 'node:assert/strict'
import test from 'node:test'
import { applyCreditCardCommand as apply, creditCardCycles, creditCardMonth, creditCardOverview,
  creditCardSchedule, emptyCreditCardState } from '../electron/credit-card-model.ts'

const now = '2026-10-03T16:00:00Z'
const card = { id: 'card', name: 'Card', limit: 1000000, closingDay: 4, dueDay: 24 }
const purchase = { id: 'purchase', name: 'Purchase', amount: 100000, installments: 2,
  firstDueDate: '2026-11-24', status: 'posted' as const }
const initialized = () => apply(emptyCreditCardState(), { type: 'initialize', requestId: 'setup', card, purchases: [purchase] }, now)

test('partial cash entries are not counted as settled cycles and early settlement belongs to due month', () => {
  let state = initialized()
  for (const id of ['one', 'two']) state = apply(state, { type: 'payment.save', requestId: id, payment: {
    id, amount: 25000, paidDate: '2026-10-20', status: 'completed',
    allocations: [{ cycleId: '2026-11', amount: 25000 }],
  } }, now)
  const october = creditCardMonth(state, '2026-10', '2026-10-20')
  const november = creditCardMonth(state, '2026-11', '2026-10-20')
  assert.equal(october.cashPaid, 50000)
  assert.equal(october.paidCount, 0)
  assert.equal(november.paidCount, 1)
  assert.equal(november.totalPayable, 1)
  assert.equal(november.cashPaid, 0)
})

test('atomic purchase and first-cycle known charges persist together or fail together', () => {
  const empty = apply(emptyCreditCardState(), { type: 'initialize', requestId: 'setup', card, purchases: [] }, now)
  const state = apply(empty, { type: 'purchase.save', requestId: 'atomic', purchase,
    cycle: { id: '2026-11', interest: 1000, fees: 500, chargesConfirmed: true } }, now)
  assert.equal(creditCardSchedule(state, '2026-11', 1, '2026-10-03')[0].target, 51500)
  assert.throws(() => apply(empty, { type: 'purchase.save', requestId: 'wrong-cycle', purchase,
    cycle: { id: '2026-12', fees: 500 } }, now), /first cycle/i)
  assert.deepEqual(empty.purchases, [])
  assert.deepEqual(empty.cycles, [])
})

test('completed principal cannot exceed original purchase across distinct cycles', () => {
  let state = apply(initialized(), { type: 'cycle.save', requestId: 'higher-target',
    cycle: { id: '2026-11', confirmedAmount: 100000 } }, now)
  state = apply(state, { type: 'payment.save', requestId: 'full-principal', payment: {
    id: 'one', amount: 100000, paidDate: '2026-10-20', status: 'completed',
    allocations: [{ cycleId: '2026-11', amount: 100000, principal: [{ purchaseId: 'purchase', amount: 100000 }] }],
  } }, now)
  assert.throws(() => apply(state, { type: 'payment.save', requestId: 'overpay-principal', payment: {
    id: 'two', amount: 1000, paidDate: '2026-11-20', status: 'completed',
    allocations: [{ cycleId: '2026-12', amount: 1000, principal: [{ purchaseId: 'purchase', amount: 1000 }] }],
  } }, now), /principal/i)
  assert.throws(() => apply(state, { type: 'cycle.save', requestId: 'shrink-target',
    cycle: { id: '2026-11', confirmedAmount: 50000 } }, now), /target/i)
})

test('confirming the existing due date after a payment is allowed without moving the allocation', () => {
  const paid = apply(initialized(), { type: 'payment.save', requestId: 'pay', payment: {
    id: 'payment', amount: 20000, paidDate: '2026-10-20', status: 'completed',
    allocations: [{ cycleId: '2026-11', amount: 20000 }],
  } }, now)
  const confirmed = apply(paid, { type: 'cycle.save', requestId: 'statement', cycle: {
    id: '2026-11', dueDate: '2026-11-24', minimumAmount: 10000,
    statementConfirmed: true, chargesConfirmed: true, interest: 0, fees: 0,
  } }, now)
  assert.equal(creditCardSchedule(confirmed, '2026-11', 1, '2026-10-20')[0].remaining, 30000)
})

test('all actual cycles include historical unpaid balances beyond a fixed schedule window', () => {
  const state = apply(emptyCreditCardState(), { type: 'initialize', requestId: 'setup', card,
    purchases: [{ ...purchase, firstDueDate: '1960-11-24' }, { ...purchase, id: 'future', firstDueDate: '2027-01-24' }] }, now)
  assert.deepEqual(creditCardCycles(state, '2026-10-03').map(cycle => cycle.id), ['1960-11', '1960-12', '2027-01', '2027-02'])
  assert.equal(creditCardOverview(state, '2026-10-03').nextCycle?.id, '1960-11')
})

test('atomic known-charge edit cannot move a paid cycle date through the purchase command', () => {
  const paid = apply(initialized(), { type: 'payment.save', requestId: 'pay', payment: {
    id: 'payment', amount: 20000, paidDate: '2026-10-20', status: 'completed',
    allocations: [{ cycleId: '2026-11', amount: 20000 }],
  } }, now)
  assert.throws(() => apply(paid, { type: 'purchase.save', requestId: 'move-via-purchase', purchase,
    cycle: { id: '2026-11', dueDate: '2026-11-25', fees: 500 } }, now), /allocation|payment/i)
})
