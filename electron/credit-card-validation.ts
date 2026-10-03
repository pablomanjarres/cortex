import type { CreditCardCycle, CreditCardPayment, CreditCardProfile,
  CreditCardPurchase, CreditCardReminderSettings, CreditCardSnapshot, CreditCardState } from './credit-card-types.js'
import { assertCreditCardDate, creditCardAddMonths, creditCardMonthNumber } from './credit-card-dates.js'

export const CREDIT_CARD_MAX_MONEY = 1_000_000_000_000
export const CREDIT_CARD_MAX_REQUESTS = 1000
export const CREDIT_CARD_MAX_AUDIT = 200

export function creditCardText(value: unknown, label: string, limit = 200): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`Invalid ${label} length`)
}
export function creditCardMoney(value: unknown, label = 'amount', positive = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0) || value > CREDIT_CARD_MAX_MONEY) {
    throw new Error(`Invalid ${label}: money must be bounded whole COP`)
  }
}
export function creditCardInteger(value: unknown, label: string, min: number, max: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${label}`)
}
export function creditCardObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a card record')
}
function optionalMoney(value: unknown, label: string) { if (value !== undefined) creditCardMoney(value, label) }
function optionalBoolean(value: unknown) {
  if (value !== undefined && typeof value !== 'boolean') throw new Error('Expected a boolean flag')
}
function fields(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unknown card record field')
}
export function validateCard(card: CreditCardProfile): void {
  creditCardObject(card)
  fields(card, ['id', 'name', 'limit', 'closingDay', 'dueDay'])
  creditCardText(card.id, 'card id'); creditCardText(card.name, 'card name', 500)
  creditCardMoney(card.limit, 'credit limit', true)
  creditCardInteger(card.closingDay, 'closing day', 1, 31)
  creditCardInteger(card.dueDay, 'due day', 1, 31)
}
export function validatePurchase(purchase: CreditCardPurchase): void {
  creditCardObject(purchase)
  fields(purchase, ['id', 'name', 'amount', 'purchaseDate', 'status', 'installments', 'firstDueDate', 'updatedAt'])
  creditCardText(purchase.id, 'purchase id'); creditCardText(purchase.name, 'purchase name', 500)
  creditCardMoney(purchase.amount, 'purchase amount', true)
  creditCardInteger(purchase.installments, 'installments', 1, 120)
  assertCreditCardDate(purchase.firstDueDate)
  creditCardAddMonths(purchase.firstDueDate.slice(0, 7), purchase.installments - 1)
  if (purchase.purchaseDate !== undefined) assertCreditCardDate(purchase.purchaseDate)
  if (!['pending', 'posted', 'cancelled'].includes(purchase.status)) throw new Error('Invalid purchase status')
}
export function validateCycle(cycle: CreditCardCycle): void {
  creditCardObject(cycle); creditCardMonthNumber(cycle.id)
  fields(cycle, ['id', 'dueDate', 'confirmedAmount', 'minimumAmount', 'minimumEstimated', 'interest', 'fees', 'chargesConfirmed', 'statementConfirmed'])
  if (cycle.dueDate !== undefined) {
    assertCreditCardDate(cycle.dueDate)
    if (!cycle.dueDate.startsWith(`${cycle.id}-`)) throw new Error('Due date must belong to cycle month')
  }
  for (const key of ['confirmedAmount', 'minimumAmount', 'interest', 'fees'] as const) optionalMoney(cycle[key], key)
  for (const key of ['minimumEstimated', 'chargesConfirmed', 'statementConfirmed'] as const) optionalBoolean(cycle[key])
  if (cycle.confirmedAmount !== undefined && cycle.minimumAmount !== undefined && cycle.confirmedAmount < cycle.minimumAmount) {
    throw new Error('Chosen target must cover the confirmed minimum')
  }
}
export function validateSnapshot(snapshot: CreditCardSnapshot): void {
  creditCardObject(snapshot); creditCardText(snapshot.id, 'snapshot id'); assertCreditCardDate(snapshot.observedDate)
  fields(snapshot, ['id', 'observedDate', 'reportedDebt', 'availableCredit', 'recordedAt'])
  creditCardMoney(snapshot.reportedDebt, 'reported debt'); creditCardMoney(snapshot.availableCredit, 'available credit')
}
export function validatePayment(payment: CreditCardPayment): void {
  creditCardObject(payment); creditCardText(payment.id, 'payment id')
  fields(payment, ['id', 'amount', 'paidDate', 'status', 'allocations', 'note', 'updatedAt'])
  creditCardMoney(payment.amount, 'payment amount', true); assertCreditCardDate(payment.paidDate)
  if (!['pending', 'completed', 'voided'].includes(payment.status)) throw new Error('Invalid payment status')
  if (payment.note !== undefined) creditCardText(payment.note, 'payment note', 2000)
  if (!Array.isArray(payment.allocations) || payment.allocations.length > 600) throw new Error('Invalid allocations')
  const cycles = new Set<string>()
  let total = 0
  for (const allocation of payment.allocations) {
    creditCardObject(allocation); creditCardMonthNumber(allocation.cycleId)
    fields(allocation, ['cycleId', 'amount', 'principal', 'feesAmount'])
    if (cycles.has(allocation.cycleId)) throw new Error('Duplicate cycle allocation')
    cycles.add(allocation.cycleId)
    creditCardMoney(allocation.amount, 'allocation amount', true)
    optionalMoney(allocation.feesAmount, 'fees breakdown')
    if (allocation.principal !== undefined && (!Array.isArray(allocation.principal) || allocation.principal.length > 1000)) throw new Error('Invalid principal breakdown')
    const purchases = new Set<string>()
    let classified = allocation.feesAmount ?? 0
    for (const principal of allocation.principal ?? []) {
      creditCardObject(principal); creditCardText(principal.purchaseId, 'purchase id')
      fields(principal, ['purchaseId', 'amount'])
      creditCardMoney(principal.amount, 'principal amount', true)
      if (purchases.has(principal.purchaseId)) throw new Error('Duplicate principal allocation')
      purchases.add(principal.purchaseId); classified += principal.amount
    }
    if (classified > allocation.amount) throw new Error('Known breakdown exceeds allocation amount')
    total += allocation.amount
  }
  if (total > payment.amount) throw new Error('Cycle allocations exceed payment amount')
}
export function validateReminders(reminders: CreditCardReminderSettings): void {
  creditCardObject(reminders)
  fields(reminders, ['enabled', 'channels', 'leadDays', 'quietBefore', 'quietAfter'])
  if (typeof reminders.enabled !== 'boolean') throw new Error('Invalid enabled flag')
  if (!Array.isArray(reminders.channels) || reminders.channels.length > 2 || new Set(reminders.channels).size !== reminders.channels.length || reminders.channels.some(c => !['native', 'phone'].includes(c))) throw new Error('Invalid reminder channels')
  if (!Array.isArray(reminders.leadDays) || reminders.leadDays.length > 10 || new Set(reminders.leadDays).size !== reminders.leadDays.length) throw new Error('Invalid lead days')
  reminders.leadDays.forEach(day => creditCardInteger(day, 'lead days', 1, 60))
  creditCardInteger(reminders.quietBefore, 'quiet window start', 0, 23)
  creditCardInteger(reminders.quietAfter, 'quiet window end', 1, 24)
  if (reminders.quietBefore >= reminders.quietAfter) throw new Error('Quiet window start must precede its end')
}
function records<T extends { id: string }>(items: T[], limit: number, validate: (item: T) => void): void {
  if (!Array.isArray(items) || items.length > limit) throw new Error('Too many card records')
  const ids = new Set<string>()
  for (const item of items) {
    validate(item)
    if (ids.has(item.id)) throw new Error('Duplicate card record id')
    ids.add(item.id)
  }
}
export function validateCreditCardState(state: CreditCardState): void {
  creditCardObject(state)
  if (state.version !== 1) throw new Error('Unsupported card ledger version')
  if (state.card !== null) validateCard(state.card)
  records(state.purchases, 1000, validatePurchase); records(state.cycles, 2400, validateCycle)
  records(state.payments, 2000, validatePayment); records(state.snapshots, 500, validateSnapshot)
  validateReminders(state.reminders); creditCardObject(state.reserves)
  if (Object.keys(state.reserves).length > 2400) throw new Error('Too many reserves')
  for (const [cycle, amount] of Object.entries(state.reserves)) { creditCardMonthNumber(cycle); creditCardMoney(amount, 'reserve amount') }
  if (!Array.isArray(state.requests) || state.requests.length > CREDIT_CARD_MAX_REQUESTS || state.requests.some(id => typeof id !== 'string' || id.length > 200)) throw new Error('Invalid request history')
  if (!Array.isArray(state.audit) || state.audit.length > CREDIT_CARD_MAX_AUDIT) throw new Error('Invalid audit history')
  if (!state.card && (state.purchases.length || state.payments.length || state.cycles.length || state.snapshots.length || Object.keys(state.reserves).length)) throw new Error('Set up a card first')
}
