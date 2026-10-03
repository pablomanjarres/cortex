import { creditCardCycles, creditCardToday, creditCardDaysBetween } from './credit-card-model.js'
import type { CreditCardState, CreditCardCycleSummary } from './credit-card-types.js'
import type { CreditCardAlertOccurrence, CreditCardAlertState } from './credit-card-alerts-types.js'
import type { NotificationChannel, NotificationMessage } from './notification-transport.js'

export interface CardReminderAction {
  key: string
  cycle: CreditCardCycleSummary
  kind: CreditCardAlertOccurrence['kind']
  threshold: string
  days: number
}
export function cardReminderActions(ledger: CreditCardState, now: Date): CardReminderAction[] {
  const today = creditCardToday(now)
  const thresholds = [...new Set([0, ...ledger.reminders.leadDays])].sort((a, b) => a - b)
  const actions: CardReminderAction[] = []
  for (const cycle of creditCardCycles(ledger, today)) {
    if (cycle.remaining <= 0) continue
    const days = creditCardDaysBetween(today, cycle.dueDate)
    const threshold = days < 0 ? today : thresholds.find((lead) => days <= lead)?.toString()
    if (threshold !== undefined) {
      const kind = days < 0 ? 'overdue' : 'payment'
      actions.push({ key: `${kind}:${cycle.id}:${cycle.dueDate}:${threshold}`, cycle, kind, threshold, days })
    }
    if (!cycle.statementConfirmed && cycle.closingDate <= today) {
      const threshold = cycle.closingDate
      actions.push({ key: `statement:${cycle.id}:${cycle.dueDate}:${threshold}`, cycle, kind: 'statement', threshold, days })
    }
  }
  return actions.sort((a, b) => a.cycle.dueDate.localeCompare(b.cycle.dueDate) || a.kind.localeCompare(b.kind))
}

export function cardReminderAllowed(ledger: CreditCardState, channel: NotificationChannel, now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Bogota', hour: 'numeric', hourCycle: 'h23' }).format(now))
  const settings = ledger.reminders
  return settings.enabled && settings.channels.includes(channel) && hour >= settings.quietBefore && hour < settings.quietAfter
}

export function pruneCardAlertState(state: CreditCardAlertState, ledger: CreditCardState, now: Date): void {
  const today = creditCardToday(now)
  const cycles = new Map(creditCardCycles(ledger, today).filter((cycle) => cycle.remaining > 0).map((cycle) => [cycle.id, cycle]))
  for (const [key, occurrence] of Object.entries(state.occurrences)) {
    const cycle = cycles.get(occurrence.cycleId)
    if (!cycle || cycle.dueDate !== occurrence.dueDate ||
      (occurrence.kind === 'statement' && (cycle.statementConfirmed || occurrence.threshold !== cycle.closingDate)) ||
      (occurrence.kind === 'overdue' && occurrence.threshold !== today)) delete state.occurrences[key]
  }
  state.outcomes = state.outcomes.slice(-100)
}

export function cardReminderMessage(action: CardReminderAction, channel: NotificationChannel, url?: string): NotificationMessage {
  const { cycle, days } = action
  const amount = new Intl.NumberFormat('es-CO').format(cycle.remaining)
  const when = days < 0 ? `${-days} days overdue` : days === 0 ? 'due today' : `due in ${days} days`
  return {
    channel, id: `cortex-card:${action.key}:${channel}`, title: action.kind === 'statement' ? 'Credit card statement' : 'Credit card payment',
    message: action.kind === 'statement'
      ? `Confirm the statement for ${cycle.id}. Payment ${cycle.dueDate}; COP ${amount} remains estimated.`
      : `COP ${amount} remains unpaid for ${cycle.id}, ${when} (${cycle.dueDate}). Open Finance to record a payment.`,
    url, category: 'scheduled-alert', priority: days <= 1 ? 1 : 0, sound: days <= 1 ? 'climb' : 'magic',
  }
}
