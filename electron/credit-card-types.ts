/** Public browser-safe card contracts. Money is whole COP; dates are YYYY-MM-DD. */
export const CREDIT_CARD_KEY = 'cortex-credit-card'
export const CREDIT_CARD_ALERTS_KEY = 'cortex-credit-card-alerts'

export interface CreditCardProfile {
  id: string
  name: string
  limit: number
  closingDay: number
  dueDay: number
}
export interface CreditCardSnapshot {
  id: string
  observedDate: string
  reportedDebt: number
  availableCredit: number
  recordedAt?: string
}
export interface CreditCardPurchase {
  id: string
  name: string
  amount: number
  purchaseDate?: string
  status: 'pending' | 'posted' | 'cancelled'
  installments: number
  firstDueDate: string
  updatedAt?: string
}
export interface CreditCardCycle {
  id: string
  dueDate?: string
  confirmedAmount?: number
  minimumAmount?: number
  minimumEstimated?: boolean
  interest?: number
  fees?: number
  chargesConfirmed?: boolean
  statementConfirmed?: boolean
}
export interface CreditCardAllocation {
  cycleId: string
  amount: number
  principal?: { purchaseId: string; amount: number }[]
  feesAmount?: number
}
export interface CreditCardPayment {
  id: string
  amount: number
  paidDate: string
  status: 'pending' | 'completed' | 'voided'
  allocations: CreditCardAllocation[]
  note?: string
  updatedAt?: string
}
export interface CreditCardReminderSettings {
  enabled: boolean
  channels: ('native' | 'phone')[]
  leadDays: number[]
  quietBefore: number
  quietAfter: number
}
export interface CreditCardAuditEntry {
  at: string
  requestId: string
  type: string
  entityId?: string
  previous?: unknown
}
export interface CreditCardState {
  version: 1
  card: CreditCardProfile | null
  purchases: CreditCardPurchase[]
  cycles: CreditCardCycle[]
  payments: CreditCardPayment[]
  snapshots: CreditCardSnapshot[]
  reserves: Record<string, number>
  reminders: CreditCardReminderSettings
  requests: string[]
  audit: CreditCardAuditEntry[]
}
export interface CreditCardInstallment {
  purchaseId: string
  name: string
  number: number
  count: number
  amount: number
  dueDate: string
  pending: boolean
}
export interface CreditCardCycleSummary {
  id: string
  dueDate: string
  closingDate: string
  principal: number
  interest: number
  fees: number
  minimum: number | null
  target: number
  paid: number
  remaining: number
  reserved: number
  fundingGap: number
  statementConfirmed: boolean
  estimated: boolean
  status: 'paid' | 'overdue' | 'ready' | 'needs-funding'
  installments: CreditCardInstallment[]
}
export interface CreditCardMonthSummary {
  yearMonth: string
  planned: number
  remaining: number
  cashPaid: number
  paidCount: number
  totalPayable: number
  cycles: CreditCardCycleSummary[]
}
export interface CreditCardOverview {
  trackedPrincipal: number
  pending: number
  committed: number
  estimatedAvailable: number
  utilization: number
  lastSnapshot: CreditCardSnapshot | null
  snapshotStale: boolean
  unclassifiedPaid: number
  nextCycle: CreditCardCycleSummary | null
}
type Request = { requestId: string }
export type CreditCardCommand = Request & (
  | { type: 'initialize'; card: CreditCardProfile; purchases: CreditCardPurchase[];
      cycles?: CreditCardCycle[]; snapshot?: CreditCardSnapshot }
  | { type: 'configure'; card: CreditCardProfile }
  | { type: 'purchase.save'; purchase: CreditCardPurchase; cycle?: CreditCardCycle }
  | { type: 'purchase.cancel'; id: string }
  | { type: 'cycle.save'; cycle: CreditCardCycle }
  | { type: 'payment.save'; payment: CreditCardPayment }
  | { type: 'payment.void'; id: string; reason: string }
  | { type: 'snapshot.save'; snapshot: CreditCardSnapshot }
  | { type: 'reserve.set'; cycleId: string; amount: number }
  | { type: 'reminders.save'; reminders: CreditCardReminderSettings }
)
export type CreditCardCommandResult =
  | { ok: true; state: CreditCardState }
  | { ok: false; error: string }
