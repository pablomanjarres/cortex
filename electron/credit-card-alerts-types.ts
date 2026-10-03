import type { CreditCardState } from './credit-card-types.js'
import type { NotificationChannel, NotificationDelivery, NotificationMessage, NotificationReadiness } from './notification-transport.js'

export interface CreditCardAlertOutcome extends NotificationDelivery {
  channel: NotificationChannel
  id: string
  title: string
  at: string
}
export interface CreditCardAlertAttempt {
  attempts: number
  status: 'Pending' | 'Sending' | NotificationDelivery['status']
  nextRetryAt?: string
  error?: string
}
export interface CreditCardAlertOccurrence {
  id: string
  cycleId: string
  dueDate: string
  kind: 'payment' | 'overdue' | 'statement'
  threshold: string
  generation: number
  channels: Partial<Record<NotificationChannel, CreditCardAlertAttempt>>
  failureNoticeAttempted?: boolean
}
export interface CreditCardAlertState {
  version: 1
  lastCheckedAt: string | null
  error?: string
  lastFailureNoticeDay?: string
  occurrences: Record<string, CreditCardAlertOccurrence>
  outcomes: CreditCardAlertOutcome[]
}
export interface CreditCardAlertStatus {
  lastCheckedAt: string | null
  error?: string
  outcomes: CreditCardAlertOutcome[]
  channels: NotificationReadiness
}
export interface CreditCardAlertsDeps {
  readLedger(): Promise<CreditCardState>
  readAlertState(): Promise<CreditCardAlertState | null>
  writeAlertState(state: CreditCardAlertState): Promise<{ ok: boolean }>
  send(message: NotificationMessage): Promise<NotificationDelivery>
  readiness?(): NotificationReadiness
  now?(): Date
  url?: string
  /** False means deferred without a delivery attempt; it does not consume the daily cap. */
  onFailure?(failure: { id: string; message: string; now: Date }): Promise<boolean | void>
}
export const emptyCreditCardAlertState = (): CreditCardAlertState => ({
  version: 1, lastCheckedAt: null, occurrences: {}, outcomes: [],
})
