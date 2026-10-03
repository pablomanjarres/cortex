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
  overdue?: { count: number; firstDueDate: string; lastDueDate: string; unconfirmed: number }
}
export function cardReminderActions(ledger: CreditCardState, now: Date): CardReminderAction[] {
  const today = creditCardToday(now)
  const thresholds = [...new Set([0, ...ledger.reminders.leadDays])].sort((a, b) => a - b)
  const actions: CardReminderAction[] = []
  const overdue: CreditCardCycleSummary[] = []
  for (const cycle of creditCardCycles(ledger, today)) {
    if (cycle.remaining <= 0) continue
    const days = creditCardDaysBetween(today, cycle.dueDate)
    if (days < 0) { overdue.push(cycle); continue }
    const threshold = thresholds.find((lead) => days <= lead)?.toString()
    if (threshold !== undefined) {
      const kind = 'payment'
      actions.push({ key: `${kind}:${cycle.id}:${cycle.dueDate}:${threshold}`, cycle, kind, threshold, days })
    }
    if (!cycle.statementConfirmed && cycle.closingDate <= today) {
      const threshold = cycle.closingDate
      actions.push({ key: `statement:${cycle.id}:${cycle.dueDate}:${threshold}`, cycle, kind: 'statement', threshold, days })
    }
  }
  if (overdue.length) actions.push({
    key: `overdue:card:${today}`, kind: 'overdue', threshold: today, days: -1,
    cycle: { ...overdue[0], id: 'overdue', dueDate: today, remaining: overdue.reduce((sum, cycle) => sum + cycle.remaining, 0) },
    overdue: { count: overdue.length, firstDueDate: overdue[0].dueDate, lastDueDate: overdue.at(-1)!.dueDate,
      unconfirmed: overdue.filter((cycle) => !cycle.statementConfirmed).length },
  })
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
    // Today's aggregate retains its channel cap even if the oldest cycle is settled or edited.
    if (occurrence.kind === 'overdue') {
      if (occurrence.threshold !== today) delete state.occurrences[key]
      continue
    }
    const cycle = cycles.get(occurrence.cycleId)
    if (!cycle || cycle.dueDate !== occurrence.dueDate ||
      (occurrence.kind === 'statement' && (cycle.statementConfirmed || occurrence.threshold !== cycle.closingDate || cycle.dueDate < today))) delete state.occurrences[key]
  }
  state.outcomes = state.outcomes.slice(-100)
}

export function cardReminderMessage(action: CardReminderAction, channel: NotificationChannel, url?: string): NotificationMessage {
  const { cycle, days } = action
  const amount = new Intl.NumberFormat('es-CO').format(cycle.remaining)
  const when = days < 0 ? `${-days} days overdue` : days === 0 ? 'due today' : `due in ${days} days`
  return {
    channel, id: `cortex-card:${action.key}:${channel}`, title: action.kind === 'statement' ? 'Credit card statement' : 'Credit card payment',
    message: action.overdue
      ? `COP ${amount} remains overdue across ${action.overdue.count} cycles (${action.overdue.firstDueDate} to ${action.overdue.lastDueDate}). ${action.overdue.unconfirmed} statements need confirmation. Open Finance to record payment.`
      : action.kind === 'statement'
      ? `Confirm the statement for ${cycle.id}. Payment ${cycle.dueDate}; COP ${amount} remains estimated.`
      : `COP ${amount} remains unpaid for ${cycle.id}, ${when} (${cycle.dueDate}). Open Finance to record a payment.`,
    url, category: 'scheduled-alert', priority: days <= 1 ? 1 : 0, sound: days <= 1 ? 'climb' : 'magic',
  }
}
