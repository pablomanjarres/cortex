import assert from 'node:assert/strict'
import test from 'node:test'
import { applyCreditCardCommand as apply, creditCardMonthDate, creditCardSchedule,
  emptyCreditCardState, type CreditCardCommand } from '../electron/credit-card-model.ts'

const now = '2026-10-03T16:00:00Z'
const card = { id: 'card', name: 'Card', limit: 1000000, closingDay: 4, dueDay: 24 }
const setup = { type: 'initialize' as const, requestId: 'setup', card, purchases: [] }

test('runtime command validation rejects malformed records and oversized setup before transition', () => {
  for (const command of [
    { ...setup, card: null },
    { ...setup, purchases: null },
    { ...setup, purchases: new Array(1001).fill({ id: 'purchase', amount: 1 }) },
    { type: 'not-a-command', requestId: 'unknown' },
  ]) assert.throws(() => apply(emptyCreditCardState(), command as unknown as CreditCardCommand, now), /card|record|purchase|command/i)
  const state = apply(emptyCreditCardState(), setup, now)
  assert.throws(() => apply(state, { type: 'snapshot.save', requestId: 'null-snapshot', snapshot: null } as unknown as CreditCardCommand, now), /record/i)
  assert.throws(() => apply(state, { type: 'purchase.save', requestId: 'extra-fields', purchase: {
    id: 'purchase', name: 'Purchase', amount: 1, installments: 1, firstDueDate: '2026-11-24', status: 'pending',
    unsupported: { huge: true },
  } } as unknown as CreditCardCommand, now), /unknown|unsupported|field/i)
})

test('short month leap year and schedule bounds stay deterministic', () => {
  const state = apply(emptyCreditCardState(), setup, now)
  assert.equal(creditCardMonthDate('2028-02', 31), '2028-02-29')
  assert.equal(creditCardMonthDate('2027-02', 31), '2027-02-28')
  for (const count of [0, 601, 1.5, Number.NaN]) assert.throws(() => creditCardSchedule(state, '2026-10', count, '2026-10-03'), /month count/i)
})
