import type { CreditCardCommand, CreditCardState } from './credit-card-types.js'
import { creditCardToday } from './credit-card-dates.js'
import { guardCycleDateEdit, guardPurchaseAllocationEdit, validateCreditCardAllocations } from './credit-card-payment-validation.js'
import { CREDIT_CARD_MAX_AUDIT, CREDIT_CARD_MAX_REQUESTS, creditCardMoney, creditCardObject,
  creditCardText, validateCreditCardState, validateCycle, validatePurchase } from './credit-card-validation.js'
import { creditCardMonthNumber } from './credit-card-dates.js'
import { validateCreditCardCommand } from './credit-card-command-validation.js'

export function emptyCreditCardState(): CreditCardState {
  return { version: 1, card: null, purchases: [], cycles: [], payments: [], snapshots: [], reserves: {},
    reminders: { enabled: true, channels: ['native', 'phone'], leadDays: [7, 3, 1], quietBefore: 8, quietAfter: 20 },
    requests: [], audit: [] }
}
function replace<T extends { id: string }>(items: T[], entry: T): T | undefined {
  const index = items.findIndex(item => item.id === entry.id)
  const previous = items[index]
  if (index < 0) items.push(entry)
  else items[index] = entry
  return previous
}

export function applyCreditCardCommand(state: CreditCardState, command: CreditCardCommand,
  now = new Date().toISOString()): CreditCardState {
  validateCreditCardState(state); creditCardObject(command); creditCardText(command.requestId, 'request id')
  if (state.requests.includes(command.requestId)) return state
  validateCreditCardCommand(command)
  if (typeof now !== 'string' || now.length > 40 || !Number.isFinite(Date.parse(now))) throw new Error('Invalid command timestamp')
  const at = new Date(now).toISOString(), today = creditCardToday(new Date(at))
  const next = structuredClone(state)
  const input = structuredClone(command)
  let previous: unknown, entityId: string | undefined
  if (input.type !== 'initialize' && !next.card && input.type !== 'reminders.save') throw new Error('Set up a card first')
  switch (input.type) {
    case 'initialize': {
      if (next.card) throw new Error('Card is already initialized')
      next.card = input.card; next.purchases = input.purchases
      next.cycles = input.cycles ?? []
      for (const purchase of next.purchases) purchase.updatedAt = at
      if (input.snapshot) next.snapshots = [{ ...input.snapshot, recordedAt: at }]
      entityId = input.card.id
      break
    }
    case 'configure': {
      previous = next.card; entityId = input.card.id
      if (next.card && (next.card.dueDay !== input.card.dueDay || next.card.closingDay !== input.card.closingDay) &&
        next.payments.some(payment => payment.status === 'completed' && payment.allocations.length)) {
        throw new Error('Correct payment allocations before changing card cycle days')
      }
      next.card = input.card
      break
    }
    case 'purchase.save': {
      validatePurchase(input.purchase)
      previous = next.purchases.find(purchase => purchase.id === input.purchase.id)
      if (previous) guardPurchaseAllocationEdit(next, previous as typeof input.purchase, input.purchase)
      if (input.cycle) {
        validateCycle(input.cycle)
        if (input.cycle.id !== input.purchase.firstDueDate.slice(0, 7)) throw new Error('Purchase charges must belong to its first cycle')
        const oldCycle = replace(next.cycles, input.cycle)
        guardCycleDateEdit(state, next, input.cycle.id, today)
        previous = { purchase: previous, cycle: oldCycle }
      }
      replace(next.purchases, { ...input.purchase, updatedAt: at }); entityId = input.purchase.id
      break
    }
    case 'purchase.cancel': {
      creditCardText(input.id, 'purchase id')
      const purchase = next.purchases.find(item => item.id === input.id)
      if (!purchase) throw new Error('Purchase not found')
      previous = structuredClone(purchase); entityId = purchase.id
      guardPurchaseAllocationEdit(next, purchase, { ...purchase, status: 'cancelled' })
      purchase.status = 'cancelled'; purchase.updatedAt = at
      break
    }
    case 'cycle.save': {
      validateCycle(input.cycle)
      previous = replace(next.cycles, input.cycle)
      guardCycleDateEdit(state, next, input.cycle.id, today)
      entityId = input.cycle.id
      break
    }
    case 'payment.save':
      previous = replace(next.payments, { ...input.payment, updatedAt: at }); entityId = input.payment.id
      break
    case 'payment.void': {
      creditCardText(input.id, 'payment id'); creditCardText(input.reason, 'void reason', 2000)
      const payment = next.payments.find(item => item.id === input.id)
      if (!payment) throw new Error('Payment not found')
      previous = structuredClone(payment); entityId = payment.id
      payment.status = 'voided'; payment.updatedAt = at; payment.note = input.reason
      break
    }
    case 'snapshot.save': {
      const old = next.snapshots.find(snapshot => snapshot.id === input.snapshot.id)
      if (old) {
        if (old.observedDate !== input.snapshot.observedDate || old.reportedDebt !== input.snapshot.reportedDebt || old.availableCredit !== input.snapshot.availableCredit) throw new Error('Bank snapshot is immutable; record a new observation')
      } else next.snapshots.push({ ...input.snapshot, recordedAt: at })
      entityId = input.snapshot.id
      break
    }
    case 'reserve.set':
      creditCardMonthNumber(input.cycleId); creditCardMoney(input.amount, 'reserve amount')
      previous = next.reserves[input.cycleId]; entityId = input.cycleId
      next.reserves[input.cycleId] = input.amount
      break
    case 'reminders.save': previous = next.reminders; next.reminders = input.reminders; break
    default: throw new Error('Unknown credit card command')
  }
  next.requests = [...next.requests, input.requestId].slice(-CREDIT_CARD_MAX_REQUESTS)
  next.audit = [...next.audit, { at, requestId: input.requestId, type: input.type, entityId, ...(previous === undefined ? {} : { previous }) }].slice(-CREDIT_CARD_MAX_AUDIT)
  validateCreditCardState(next)
  validateCreditCardAllocations(next, today)
  return next
}
