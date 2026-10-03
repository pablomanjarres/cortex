import type { CreditCardCycleSummary, CreditCardInstallment, CreditCardMonthSummary,
  CreditCardOverview, CreditCardState } from './credit-card-types.js'
import { assertCreditCardDate, creditCardAddMonths, creditCardMonthDate, creditCardMonthNumber } from './credit-card-dates.js'
import { creditCardInteger } from './credit-card-validation.js'

export function creditCardInstallments(state: CreditCardState): Map<string, CreditCardInstallment[]> {
  const result = new Map<string, CreditCardInstallment[]>()
  for (const purchase of state.purchases) {
    if (purchase.status === 'cancelled') continue
    const base = Math.floor(purchase.amount / purchase.installments)
    for (let index = 0; index < purchase.installments; index++) {
      const id = creditCardAddMonths(purchase.firstDueDate.slice(0, 7), index)
      const amount = index === purchase.installments - 1 ? purchase.amount - base * index : base
      const dueDate = index === 0 ? purchase.firstDueDate : creditCardMonthDate(id, state.card?.dueDay ?? Number(purchase.firstDueDate.slice(8)))
      const installments = result.get(id) ?? []
      installments.push({ purchaseId: purchase.id, name: purchase.name, number: index + 1,
        count: purchase.installments, amount, dueDate, pending: purchase.status === 'pending' })
      result.set(id, installments)
    }
  }
  return result
}

function cycleSummary(state: CreditCardState, id: string, asOfDate: string,
  installments: CreditCardInstallment[]): CreditCardCycleSummary {
  const cycle = state.cycles.find(item => item.id === id)
  const dueDate = cycle?.dueDate ?? installments[0]?.dueDate ?? creditCardMonthDate(id, state.card?.dueDay ?? 24)
  const closingDay = state.card?.closingDay ?? 4
  const closingMonth = closingDay > Number(dueDate.slice(8)) ? creditCardAddMonths(id, -1) : id
  const closingDate = creditCardMonthDate(closingMonth, closingDay)
  const principal = installments.reduce((sum, installment) => sum + installment.amount, 0)
  const interest = cycle?.interest ?? 0, fees = cycle?.fees ?? 0
  const target = Math.max(principal + interest + fees, cycle?.confirmedAmount ?? 0, cycle?.minimumAmount ?? 0)
  const paid = state.payments.filter(payment => payment.status === 'completed')
    .reduce((sum, payment) => sum + (payment.allocations.find(item => item.cycleId === id)?.amount ?? 0), 0)
  const remaining = Math.max(0, target - paid)
  const reserved = state.reserves[id] ?? 0
  return { id, dueDate, closingDate, principal, interest, fees, minimum: cycle?.minimumAmount ?? null,
    target, paid, remaining, reserved, fundingGap: Math.max(0, remaining - reserved),
    statementConfirmed: cycle?.statementConfirmed ?? false,
    estimated: !cycle?.statementConfirmed || !cycle?.chargesConfirmed || installments.some(item => item.pending),
    status: remaining === 0 ? 'paid' : dueDate < asOfDate ? 'overdue' : reserved >= remaining ? 'ready' : 'needs-funding',
    installments: installments.map(item => ({ ...item, dueDate })),
  }
}

export function creditCardSchedule(state: CreditCardState, fromMonth: string,
  monthCount: number, asOfDate: string): CreditCardCycleSummary[] {
  creditCardMonthNumber(fromMonth); assertCreditCardDate(asOfDate)
  creditCardInteger(monthCount, 'schedule month count', 1, 600)
  const installments = creditCardInstallments(state)
  return Array.from({ length: monthCount }, (_, index) => {
    const id = creditCardAddMonths(fromMonth, index)
    return cycleSummary(state, id, asOfDate, installments.get(id) ?? [])
  })
}

/** Enumerates actual tracked cycles without replaying empty historical calendar months. */
export function creditCardCycles(state: CreditCardState, asOfDate: string): CreditCardCycleSummary[] {
  assertCreditCardDate(asOfDate)
  const installments = creditCardInstallments(state)
  const ids = new Set([...installments.keys(), ...state.cycles.map(cycle => cycle.id), ...Object.keys(state.reserves)])
  return [...ids].sort().map(id => cycleSummary(state, id, asOfDate, installments.get(id) ?? []))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

export function creditCardMonth(state: CreditCardState, yearMonth: string, asOfDate: string): CreditCardMonthSummary {
  const scheduled = creditCardSchedule(state, yearMonth, 1, asOfDate)
  const cycles = scheduled.filter(cycle => cycle.target > 0 || state.cycles.some(item => item.id === cycle.id))
  const cashPayments = state.payments.filter(payment => payment.status === 'completed' && payment.paidDate.startsWith(`${yearMonth}-`))
  return { yearMonth, planned: cycles.reduce((sum, cycle) => sum + cycle.target, 0),
    remaining: cycles.reduce((sum, cycle) => sum + cycle.remaining, 0),
    cashPaid: cashPayments.reduce((sum, payment) => sum + payment.amount, 0),
    paidCount: cashPayments.length, totalPayable: cycles.length, cycles }
}

export function creditCardOverview(state: CreditCardState, asOfDate: string): CreditCardOverview {
  assertCreditCardDate(asOfDate)
  const paidPrincipal = new Map<string, number>()
  let unclassifiedPaid = 0
  for (const payment of state.payments) {
    if (payment.status !== 'completed') continue
    let classified = 0
    for (const allocation of payment.allocations) {
      classified += allocation.feesAmount ?? 0
      for (const entry of allocation.principal ?? []) {
        paidPrincipal.set(entry.purchaseId, (paidPrincipal.get(entry.purchaseId) ?? 0) + entry.amount)
        classified += entry.amount
      }
    }
    unclassifiedPaid += payment.amount - classified
  }
  let trackedPrincipal = 0, pending = 0
  for (const purchase of state.purchases) {
    if (purchase.status === 'cancelled') continue
    const remaining = purchase.amount - (paidPrincipal.get(purchase.id) ?? 0)
    trackedPrincipal += remaining
    if (purchase.status === 'pending') pending += remaining
  }
  const lastSnapshot = [...state.snapshots].sort((a, b) => b.observedDate.localeCompare(a.observedDate) || (b.recordedAt ?? '').localeCompare(a.recordedAt ?? '') || b.id.localeCompare(a.id))[0] ?? null
  const snapshotStale = !!lastSnapshot && (
    state.purchases.some(purchase => (purchase.purchaseDate ?? purchase.updatedAt?.slice(0, 10) ?? '') > lastSnapshot.observedDate || (!!lastSnapshot.recordedAt && (purchase.updatedAt ?? '') > lastSnapshot.recordedAt)) ||
    state.payments.some(payment => payment.status === 'completed' && (payment.paidDate > lastSnapshot.observedDate || (!!lastSnapshot.recordedAt && (payment.updatedAt ?? '') > lastSnapshot.recordedAt)))
  )
  const limit = state.card?.limit ?? 0
  return { trackedPrincipal, pending, committed: trackedPrincipal,
    estimatedAvailable: Math.max(0, limit - trackedPrincipal), utilization: limit ? trackedPrincipal / limit : 0,
    lastSnapshot, snapshotStale, unclassifiedPaid,
    nextCycle: creditCardCycles(state, asOfDate).find(cycle => cycle.remaining > 0) ?? null }
}
