import type { CreditCardPurchase, CreditCardState } from './credit-card-types.js'
import { creditCardAddMonths } from './credit-card-dates.js'
import { creditCardCycles, creditCardSchedule } from './credit-card-projections.js'

export function guardCycleDateEdit(previous: CreditCardState, next: CreditCardState, cycleId: string, asOfDate: string): void {
  if (!previous.payments.some(payment => payment.status === 'completed' && payment.allocations.some(allocation => allocation.cycleId === cycleId))) return
  if (creditCardSchedule(previous, cycleId, 1, asOfDate)[0].dueDate !== creditCardSchedule(next, cycleId, 1, asOfDate)[0].dueDate) {
    throw new Error('Correct payment allocations before changing this cycle due date')
  }
}

export function purchaseCycleIds(purchase: CreditCardPurchase): Set<string> {
  return new Set(Array.from({ length: purchase.installments }, (_, index) => creditCardAddMonths(purchase.firstDueDate.slice(0, 7), index)))
}

/** A schedule with recorded cash cannot be rewritten by an unrelated purchase edit. */
export function guardPurchaseAllocationEdit(state: CreditCardState, previous: CreditCardPurchase, next: CreditCardPurchase): void {
  if (previous.amount === next.amount && previous.installments === next.installments && previous.firstDueDate === next.firstDueDate && (previous.status === 'cancelled') === (next.status === 'cancelled')) return
  const oldCycles = purchaseCycleIds(previous)
  if (state.payments.some(payment => payment.status === 'completed' && payment.allocations.some(allocation =>
    oldCycles.has(allocation.cycleId) || allocation.principal?.some(principal => principal.purchaseId === previous.id)))) {
    throw new Error('Correct or void existing payment allocations before changing this purchase schedule')
  }
}

export function validateCreditCardAllocations(state: CreditCardState, asOfDate: string): void {
  const targets = new Map(creditCardCycles(state, asOfDate).map(cycle => [cycle.id, cycle.target]))
  const paidByCycle = new Map<string, number>(), paidByPurchase = new Map<string, number>()
  const purchases = new Map(state.purchases.map(purchase => [purchase.id, purchase]))
  for (const payment of state.payments) {
    if (payment.status === 'voided') continue
    for (const allocation of payment.allocations) {
      if (!targets.has(allocation.cycleId) || allocation.amount > (targets.get(allocation.cycleId) ?? 0)) throw new Error('Allocation exceeds known cycle target')
      if (payment.status === 'completed') paidByCycle.set(allocation.cycleId, (paidByCycle.get(allocation.cycleId) ?? 0) + allocation.amount)
      for (const principal of allocation.principal ?? []) {
        const purchase = purchases.get(principal.purchaseId)
        if (!purchase || purchase.status === 'cancelled') throw new Error('Principal allocation requires an active purchase')
        if (payment.status === 'completed') paidByPurchase.set(principal.purchaseId, (paidByPurchase.get(principal.purchaseId) ?? 0) + principal.amount)
        if (principal.amount > purchase.amount) throw new Error('Principal allocation overpays purchase')
      }
    }
  }
  for (const [cycleId, paid] of paidByCycle) if (paid > (targets.get(cycleId) ?? 0)) throw new Error('Completed allocations exceed cycle target')
  for (const [purchaseId, paid] of paidByPurchase) if (paid > purchases.get(purchaseId)!.amount) throw new Error('Principal allocations overpay purchase')
}
