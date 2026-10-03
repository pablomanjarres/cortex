import assert from 'node:assert/strict'
import test from 'node:test'
import { applyCreditCardCommand as apply, creditCardOverview, emptyCreditCardState } from '../electron/credit-card-model.ts'

const now = '2026-10-03T16:00:00Z'
const card = { id: 'card', name: 'Card', limit: 1000000, closingDay: 4, dueDay: 24 }
const purchase = { id: 'purchase', name: 'Purchase', amount: 100000,
  installments: 2, firstDueDate: '2026-11-24', status: 'posted' as const }
const initialized = () => apply(emptyCreditCardState(), { type: 'initialize', requestId: 'setup', card, purchases: [purchase] }, now)
const payment = { id: 'payment', amount: 30000, paidDate: '2026-10-20', status: 'completed' as const,
  allocations: [{ cycleId: '2026-11', amount: 30000, principal: [{ purchaseId: 'purchase', amount: 20000 }] }] }

test('commands are immutable, idempotent, and stable entity IDs prevent duplicate purchases or payments', () => {
  const state = initialized()
  const original = structuredClone(state)
  const command = { type: 'payment.save' as const, requestId: 'pay', payment }
  const once = apply(state, command, now)
  assert.deepEqual(state, original)
  assert.equal(apply(once, command, now), once)
  const repeated = apply(once, { ...command, requestId: 'different-request' }, now)
  assert.equal(repeated.payments.length, 1)
  assert.equal(creditCardOverview(repeated, '2026-10-20').trackedPrincipal, 80000)
  assert.throws(() => apply(once, { type: 'initialize', requestId: 'setup-again', card, purchases: [purchase] }, now), /initialized/i)
})

test('payment corrections and voiding preserve the previous record in the audit', () => {
  const paid = apply(initialized(), { type: 'payment.save', requestId: 'pay', payment }, now)
  const corrected = apply(paid, { type: 'payment.save', requestId: 'correct', payment: { ...payment, amount: 40000 } }, now)
  assert.deepEqual(corrected.audit.at(-1)?.previous, paid.payments[0])
  const voided = apply(corrected, { type: 'payment.void', requestId: 'void', id: 'payment', reason: 'Reversed' }, now)
  assert.deepEqual(voided.audit.at(-1)?.previous, corrected.payments[0])
  assert.equal(creditCardOverview(voided, '2026-10-20').trackedPrincipal, 100000)
})

test('money, allocation totals, principal overpayments, and real cycles reject corruption', () => {
  const state = initialized()
  for (const amount of [-1, 1.5, Number.MAX_SAFE_INTEGER, Number.NaN]) {
    assert.throws(() => apply(state, { type: 'purchase.save', requestId: 'invalid', purchase: { ...purchase, amount } }, now), /amount|money/i)
  }
  assert.throws(() => apply(state, { type: 'payment.save', requestId: 'too-many', payment: {
    ...payment, allocations: [{ cycleId: '2026-11', amount: 30001 }],
  } }, now), /allocation/i)
  assert.throws(() => apply(state, { type: 'payment.save', requestId: 'too-much', payment: {
    ...payment, amount: 110000, allocations: [{ cycleId: '2026-11', amount: 110000,
      principal: [{ purchaseId: 'purchase', amount: 110000 }] }],
  } }, now), /principal|target/i)
  assert.throws(() => apply(state, { type: 'payment.save', requestId: 'unknown', payment: {
    ...payment, allocations: [{ cycleId: '2026-10', amount: 30000 }],
  } }, now), /cycle|target/i)
  assert.throws(() => apply(state, { type: 'payment.save', requestId: 'bad-breakdown', payment: {
    ...payment, allocations: [{ cycleId: '2026-11', amount: 30000,
      principal: [{ purchaseId: 'purchase', amount: 20000 }], feesAmount: 20000 }],
  } }, now), /breakdown|allocation/i)
})

test('schedule-changing edits cannot silently move existing completed allocations', () => {
  const state = apply(initialized(), { type: 'payment.save', requestId: 'pay', payment }, now)
  assert.throws(() => apply(state, { type: 'purchase.save', requestId: 'move', purchase: {
    ...purchase, firstDueDate: '2027-01-24',
  } }, now), /allocation|payment/i)
  assert.throws(() => apply(state, { type: 'configure', requestId: 'day', card: { ...card, dueDay: 5 } }, now), /allocation|payment/i)
  assert.equal(apply(state, { type: 'purchase.save', requestId: 'label', purchase: { ...purchase, name: 'Renamed' } }, now).purchases[0].name, 'Renamed')
})

test('snapshot facts are immutable and bounded commands do not accept oversized input', () => {
  const snapshot = { id: 'observation', observedDate: '2026-10-03', reportedDebt: 0, availableCredit: 900000 }
  const state = apply(initialized(), { type: 'snapshot.save', requestId: 'observation', snapshot }, now)
  assert.throws(() => apply(state, { type: 'snapshot.save', requestId: 'rewrite', snapshot: { ...snapshot, reportedDebt: 123 } }, now), /immutable/i)
  assert.throws(() => apply(state, { type: 'purchase.save', requestId: 'long-label', purchase: { ...purchase, name: 'x'.repeat(501) } }, now), /name|length/i)
  assert.throws(() => apply(state, { type: 'purchase.save', requestId: 'too-many-installments', purchase: { ...purchase, installments: 121 } }, now), /installments/i)
  assert.throws(() => apply(state, { type: 'reserve.set', requestId: '__proto__', cycleId: '__proto__', amount: 1 }, now), /month|cycle/i)
  assert.throws(() => apply(state, { type: 'reminders.save', requestId: 'settings', reminders: {
    ...state.reminders, quietBefore: 20, quietAfter: 10,
  } }, now), /quiet|window/i)
})

test('request IDs and previous-record audit history have fixed retention bounds', () => {
  let state = initialized()
  for (let i = 0; i < 1005; i++) state = apply(state, {
    type: 'reserve.set', requestId: `reserve-${i}`, cycleId: '2026-11', amount: i,
  }, now)
  assert.ok(state.requests.length <= 1000)
  assert.ok(state.audit.length <= 200)
  assert.equal(state.requests.at(-1), 'reserve-1004')
})
