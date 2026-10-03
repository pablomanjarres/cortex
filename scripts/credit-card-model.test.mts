import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyCreditCardCommand as apply, creditCardMonth, creditCardOverview,
  creditCardSchedule, creditCardToday, emptyCreditCardState,
  type CreditCardCommand, type CreditCardState,
} from '../electron/credit-card-model.ts'

const now = '2026-10-03T16:00:00.000Z'
const card = { id: 'card', name: 'My card', limit: 2_000_000, closingDay: 4, dueDay: 24 }
const purchase = { id: 'purchase', name: 'Purchase', amount: 249991,
  installments: 3, firstDueDate: '2026-11-24', status: 'pending' as const }
const initialized = () => apply(emptyCreditCardState(), {
  type: 'initialize', requestId: 'setup', card, purchases: [purchase],
  snapshot: { id: 'snapshot', observedDate: '2026-10-03', reportedDebt: 0, availableCredit: 1750009 },
}, now)
const change = (state: CreditCardState, command: CreditCardCommand) => apply(state, command, now)

test('pending installments conserve principal with the remainder in the final month across years', () => {
  const state = initialized()
  const schedule = creditCardSchedule(state, '2026-11', 3, '2026-10-03')
  assert.equal(schedule.reduce((s, c) => s + c.principal, 0), 249991)
  assert.deepEqual(schedule.map(c => c.principal), [83330, 83330, 83331])
  assert.deepEqual(schedule.map(c => c.dueDate), ['2026-11-24', '2026-12-24', '2027-01-24'])
  assert.ok(schedule.every(c => c.estimated && c.installments[0].pending))
  assert.equal(creditCardOverview(state, '2026-10-03').lastSnapshot?.reportedDebt, 0)
  assert.equal(creditCardMonth(state, '2027-01', '2026-10-03').planned, 83331)
})

test('date-only validation, short months, leap years, and Bogota today do not depend on local timezone', () => {
  const state = change(initialized(), { type: 'configure', requestId: 'config', card: { ...card, dueDay: 31 } })
  const result = change(state, { type: 'purchase.save', requestId: 'purchase-date', purchase: {
    ...purchase, firstDueDate: '2027-01-31', installments: 3,
  } })
  assert.deepEqual(creditCardSchedule(result, '2027-01', 3, '2026-10-03').map(c => c.dueDate),
    ['2027-01-31', '2027-02-28', '2027-03-31'])
  assert.equal(creditCardToday(new Date('2026-10-04T02:00:00Z')), '2026-10-03')
  assert.throws(() => change(state, { type: 'purchase.save', requestId: 'invalid',
    purchase: { ...purchase, firstDueDate: '2026-02-29' } }), /date/i)
  assert.throws(() => creditCardSchedule(state, '2026-13', 2, '2026-10-03'), /month/i)
})

test('minimum, explicit target, known charges, and preparation remain distinct', () => {
  let state = change(initialized(), { type: 'cycle.save', requestId: 'statement', cycle: {
    id: '2026-11', minimumAmount: 30000, confirmedAmount: 90000,
    interest: 1000, fees: 500, statementConfirmed: true, chargesConfirmed: true,
  } })
  state = change(state, { type: 'reserve.set', requestId: 'reserve', cycleId: '2026-11', amount: 90000 })
  const cycle = creditCardSchedule(state, '2026-11', 1, '2026-11-01')[0]
  assert.equal(cycle.minimum, 30000)
  assert.equal(cycle.target, 90000)
  assert.equal(cycle.principal, 83330)
  assert.equal(cycle.paid, 0)
  assert.equal(cycle.status, 'ready')
  assert.equal(creditCardMonth(state, '2026-11', '2026-11-01').cashPaid, 0)
  assert.throws(() => change(state, { type: 'cycle.save', requestId: 'bad-target', cycle: {
    id: '2026-11', confirmedAmount: 20000, minimumAmount: 30000,
  } }), /minimum/i)
  const smaller = change(initialized(), { type: 'cycle.save', requestId: 'min-only',
    cycle: { id: '2026-11', minimumAmount: 30000 } })
  assert.equal(creditCardSchedule(smaller, '2026-11', 1, '2026-11-01')[0].target, 83330)
})

test('early and partial payment cash lands once in actual month and allocations settle the due cycle', () => {
  const state = change(initialized(), { type: 'payment.save', requestId: 'pay', payment: {
    id: 'payment', amount: 40000, paidDate: '2026-10-20', status: 'completed',
    allocations: [{ cycleId: '2026-11', amount: 35000, principal: [{ purchaseId: 'purchase', amount: 20000 }], feesAmount: 5000 }],
  } })
  assert.equal(creditCardMonth(state, '2026-10', '2026-10-20').cashPaid, 40000)
  assert.equal(creditCardMonth(state, '2026-11', '2026-10-20').cashPaid, 0)
  assert.equal(creditCardMonth(state, '2026-11', '2026-10-20').remaining, 48330)
  const overview = creditCardOverview(state, '2026-10-20')
  assert.equal(overview.trackedPrincipal, 229991)
  assert.equal(overview.unclassifiedPaid, 15000)
  assert.equal(overview.snapshotStale, true)
  assert.equal(overview.lastSnapshot?.reportedDebt, 0)
})

test('pending payments do not settle debt; posted, cancellation, and voiding use validated transitions', () => {
  let state = change(initialized(), { type: 'purchase.save', requestId: 'posted', purchase: { ...purchase, status: 'posted' } })
  assert.equal(creditCardOverview(state, '2026-10-03').pending, 0)
  state = change(state, { type: 'payment.save', requestId: 'pending-pay', payment: {
    id: 'payment', amount: 83330, paidDate: '2026-10-20', status: 'pending',
    allocations: [{ cycleId: '2026-11', amount: 83330 }],
  } })
  assert.equal(creditCardMonth(state, '2026-10', '2026-10-20').cashPaid, 0)
  state = change(state, { type: 'payment.save', requestId: 'completed', payment: { ...state.payments[0], status: 'completed' } })
  assert.equal(creditCardSchedule(state, '2026-11', 1, '2026-11-25')[0].status, 'paid')
  assert.throws(() => change(state, { type: 'purchase.cancel', requestId: 'cancel', id: 'purchase' }), /allocation|payment/i)
  state = change(state, { type: 'payment.void', requestId: 'void', id: 'payment', reason: 'Bank reversed payment' })
  state = change(state, { type: 'purchase.cancel', requestId: 'cancel-after-void', id: 'purchase' })
  assert.equal(creditCardMonth(state, '2026-11', '2026-11-25').planned, 0)
  assert.equal(creditCardMonth(state, '2026-10', '2026-11-25').cashPaid, 0)
})
