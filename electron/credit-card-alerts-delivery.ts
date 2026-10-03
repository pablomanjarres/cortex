import { cardReminderActions, cardReminderAllowed, cardReminderMessage } from './credit-card-alerts-model.js'
import type { CardReminderAction } from './credit-card-alerts-model.js'
import type { CreditCardAlertOccurrence, CreditCardAlertState, CreditCardAlertsDeps } from './credit-card-alerts-types.js'
import type { NotificationChannel, NotificationDelivery, NotificationMessage } from './notification-transport.js'

export async function persistCardAlertState(deps: CreditCardAlertsDeps, state: CreditCardAlertState): Promise<void> {
  state.outcomes = state.outcomes.slice(-100)
  if (!(await deps.writeAlertState(structuredClone(state))).ok) throw new Error('Could not persist credit card reminder state')
}
export async function sendCardNotification(deps: CreditCardAlertsDeps, message: NotificationMessage): Promise<NotificationDelivery> {
  try { return await deps.send(message) }
  catch { return { status: 'Failed', error: `${message.channel === 'phone' ? 'Phone' : 'Native'} delivery failed` } }
}
async function currentAction(deps: CreditCardAlertsDeps, key: string, channel: NotificationChannel, now: Date) {
  const ledger = await deps.readLedger()
  const current = deps.now?.() || now
  if (!cardReminderAllowed(ledger, channel, current)) return undefined
  return cardReminderActions(ledger, current).find((action) => action.key === key)
}
function occurrenceFor(action: CardReminderAction): CreditCardAlertOccurrence {
  return { id: action.key, cycleId: action.cycle.id, dueDate: action.cycle.dueDate,
    kind: action.kind, threshold: action.threshold, generation: 0, channels: {} }
}

export async function deliverCardReminder(deps: CreditCardAlertsDeps, state: CreditCardAlertState,
  action: CardReminderAction, now: Date, force = false): Promise<void> {
  for (const channel of ['native', 'phone'] as const) {
    const fresh = await currentAction(deps, action.key, channel, now)
    if (!fresh) continue
    const occurrence = state.occurrences[action.key] ||= occurrenceFor(fresh)
    const previous = occurrence.channels[channel]
    if (previous?.status === 'Sent' || (previous?.attempts ?? 0) >= 3) continue
    if (!force && previous?.nextRetryAt && previous.nextRetryAt > now.toISOString()) continue
    const attempts = (previous?.attempts ?? 0) + 1
    occurrence.channels[channel] = { attempts, status: 'Sending', nextRetryAt: new Date(now.getTime() + (attempts === 1 ? 15 : 60) * 60_000).toISOString() }
    // Attempts and identity survive acceptance followed by a failed bookkeeping write.
    await persistCardAlertState(deps, state)
    // A payment/settings write can happen during persistence; validate again before delivery.
    const latest = await currentAction(deps, action.key, channel, now)
    if (!latest) {
      if (previous) occurrence.channels[channel] = previous
      else delete occurrence.channels[channel]
      await persistCardAlertState(deps, state)
      continue
    }
    const message = cardReminderMessage(latest, channel, deps.url)
    const result = await sendCardNotification(deps, message)
    occurrence.channels[channel] = { ...occurrence.channels[channel]!, ...result }
    if (result.status === 'Sent') delete occurrence.channels[channel]!.nextRetryAt
    state.outcomes.push({ channel, id: message.id, title: message.title, at: now.toISOString(), ...result })
    await persistCardAlertState(deps, state)
  }
  await sendFailureNotice(deps, state, action, now)
}

async function sendFailureNotice(deps: CreditCardAlertsDeps, state: CreditCardAlertState, action: CardReminderAction, now: Date) {
  const occurrence = state.occurrences[action.key]
  if (!occurrence || occurrence.failureNoticeAttempted) return
  const channels = Object.entries(occurrence.channels) as [NotificationChannel, NonNullable<CreditCardAlertOccurrence['channels'][NotificationChannel]>][]
  if (!channels.some(([, value]) => value.status === 'Failed')) return
  const channel = channels.find(([, value]) => value.status === 'Sent')?.[0]
  if (!channel || !(await currentAction(deps, action.key, channel, now))) return
  occurrence.failureNoticeAttempted = true
  await persistCardAlertState(deps, state)
  if (!(await currentAction(deps, action.key, channel, now))) return
  const message: NotificationMessage = { channel, id: `cortex-card:${action.key}:${channel}:failure`,
    title: 'Credit card reminders need attention', message: 'One reminder channel failed. Open Finance to check delivery and retry the current reminder.', url: deps.url, category: 'scheduled-alert' }
  const result = await sendCardNotification(deps, message)
  state.outcomes.push({ channel, id: message.id, title: message.title, at: now.toISOString(), ...result })
  await persistCardAlertState(deps, state)
}
