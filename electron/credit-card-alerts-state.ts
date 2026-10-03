import { emptyCreditCardAlertState } from './credit-card-alerts-types.js'
import type { CreditCardAlertState } from './credit-card-alerts-types.js'

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const text = (value: unknown, max = 300) => typeof value === 'string' && value.length <= max
const channel = (value: unknown) => value === 'native' || value === 'phone'
const delivery = (value: unknown) => value === 'Sent' || value === 'Muted' || value === 'Failed'

/** Corrupt persisted attempts fail closed: resetting them would violate retry caps. */
export function readCreditCardAlertState(raw: unknown): CreditCardAlertState {
  if (raw === null || raw === undefined) return emptyCreditCardAlertState()
  const invalid = () => { throw new Error('Invalid credit card reminder state') }
  if (!record(raw) || raw.version !== 1 || (raw.lastCheckedAt !== null && !timestamp(raw.lastCheckedAt)) ||
    !record(raw.occurrences) || !Array.isArray(raw.outcomes) || (raw.error !== undefined && !text(raw.error)) ||
    (raw.lastFailureNoticeDay !== undefined && !date(raw.lastFailureNoticeDay))) return invalid()
  if (Object.keys(raw.occurrences).length > 40_000 || raw.outcomes.length > 1_000) return invalid()
  for (const [key, item] of Object.entries(raw.occurrences)) {
    if (!record(item) || item.id !== key || !text(item.id) || !text(item.cycleId, 7) || !date(item.dueDate) ||
      !['payment', 'overdue', 'statement'].includes(String(item.kind)) || !text(item.threshold, 10) ||
      !Number.isInteger(item.generation) || Number(item.generation) < 0 || !record(item.channels) ||
      (item.failureNoticeAttempted !== undefined && typeof item.failureNoticeAttempted !== 'boolean')) return invalid()
    for (const [name, attempt] of Object.entries(item.channels)) {
      if (!channel(name) || !record(attempt) || !Number.isInteger(attempt.attempts) || Number(attempt.attempts) < 0 || Number(attempt.attempts) > 3 ||
        !(delivery(attempt.status) || attempt.status === 'Pending' || attempt.status === 'Sending') ||
        (attempt.nextRetryAt !== undefined && !timestamp(attempt.nextRetryAt)) ||
        (attempt.error !== undefined && !text(attempt.error))) return invalid()
    }
  }
  for (const item of raw.outcomes) {
    if (!record(item) || !channel(item.channel) || !text(item.id) || !text(item.title, 120) || !delivery(item.status) ||
      !timestamp(item.at) || (item.error !== undefined && !text(item.error))) return invalid()
  }
  const state = structuredClone(raw) as unknown as CreditCardAlertState
  state.outcomes = state.outcomes.slice(-100)
  return state
}

export function incompleteCardAlert(state: CreditCardAlertState): boolean {
  return Object.values(state.occurrences).some((item) => Object.values(item.channels).some((attempt) => attempt.status === 'Sending'))
}
