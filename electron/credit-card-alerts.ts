import { emptyCreditCardAlertState } from './credit-card-alerts-types.js'
import { cardReminderActions, pruneCardAlertState } from './credit-card-alerts-model.js'
import { creditCardToday } from './credit-card-model.js'
import { deliverCardReminder, persistCardAlertState, sendCardNotification } from './credit-card-alerts-delivery.js'
import { incompleteCardAlert, readCreditCardAlertState } from './credit-card-alerts-state.js'
import type { CreditCardAlertOutcome, CreditCardAlertState, CreditCardAlertStatus, CreditCardAlertsDeps } from './credit-card-alerts-types.js'
import type { NotificationChannel, NotificationReadiness } from './notification-transport.js'
export type { CreditCardAlertState, CreditCardAlertStatus, CreditCardAlertOutcome } from './credit-card-alerts-types.js'

/** One serialized delivery owner; hourly timers belong only to the main process. */
export function createCreditCardAlerts(deps: CreditCardAlertsDeps) {
  let active: Promise<CreditCardAlertStatus> | undefined
  let queue: Promise<unknown> = Promise.resolve()
  let error: string | undefined
  let remembered = emptyCreditCardAlertState()
  let interval: ReturnType<typeof setInterval> | undefined
  let failureNoticeDay: string | undefined
  const readiness = (): NotificationReadiness => deps.readiness?.() || { native: { ready: true }, phone: { ready: true } }
  const read = async () => {
    const state = readCreditCardAlertState(await deps.readAlertState())
    remembered = state
    return state
  }
  const view = (state: CreditCardAlertState): CreditCardAlertStatus => ({
    lastCheckedAt: state.lastCheckedAt, outcomes: state.outcomes.slice(-100), channels: readiness(),
    ...(error || state.error || incompleteCardAlert(state)
      ? { error: error || state.error || 'Reminder delivery is incomplete. Retry uses the same notification ID.' } : {}),
  })
  const serialized = <T>(work: () => Promise<T>): Promise<T> => {
    const operation = queue.then(work)
    queue = operation.catch(() => {})
    return operation
  }
  const notifyFailure = async (now: Date, message: string) => {
    const day = creditCardToday(now)
    if (!deps.onFailure || failureNoticeDay === day) return
    failureNoticeDay = day
    try {
      const saved = readCreditCardAlertState(await deps.readAlertState())
      if (saved.lastFailureNoticeDay === day) return
      saved.lastFailureNoticeDay = day
      saved.error = message
      await deps.writeAlertState(saved)
    } catch { /* Storage failure cannot silence its own actionable notification. */ }
    try { await deps.onFailure({ id: `cortex-card:checker-failure:${day}`, message }) }
    catch { /* The retained visible failure remains even if its reporter also fails. */ }
  }
  const run = async (now: Date, force: boolean, retry: boolean, liveDeps: CreditCardAlertsDeps) => {
    try {
      const state = await read()
      const ledger = await deps.readLedger()
      error = undefined; delete state.error
      state.lastCheckedAt = now.toISOString()
      pruneCardAlertState(state, ledger, now)
      const actions = cardReminderActions(ledger, now)
      if (retry) for (const action of actions) {
        const occurrence = state.occurrences[action.key]
        if (!occurrence) continue
        const failed = Object.values(occurrence.channels).filter((channel) => channel.status === 'Failed' || channel.status === 'Muted' || channel.status === 'Sending')
        if (failed.length) occurrence.generation++
        for (const channel of failed) Object.assign(channel, { attempts: 0, status: 'Pending', nextRetryAt: undefined, error: undefined })
      }
      await persistCardAlertState(deps, state)
      // Bound expensive rereads and provider calls when many cycles require attention.
      const pending = actions.filter((action) => ledger.reminders.channels.some((channel) => {
        const attempt = state.occurrences[action.key]?.channels[channel]
        return attempt?.status !== 'Sent' && (attempt?.attempts ?? 0) < 3 &&
          (force || !attempt?.nextRetryAt || attempt.nextRetryAt <= now.toISOString())
      })).slice(0, 100)
      for (const action of pending) await deliverCardReminder(liveDeps, state, action, now, force)
      pruneCardAlertState(state, await deps.readLedger(), now)
      await persistCardAlertState(deps, state)
      return view(state)
    } catch (cause) {
      error = cause instanceof Error && /persist/i.test(cause.message)
        ? 'Could not persist credit card reminder state. Check storage before retrying.'
        : 'Credit card reminder check failed. Open Finance to retry.'
      await notifyFailure(now, error)
      return view(remembered)
    }
  }
  const check = (now?: Date, force = false): Promise<CreditCardAlertStatus> => {
    if (active) return active
    const clock = deps.now || (() => new Date())
    const operation = serialized(() => run(now || clock(), force, false, now ? deps : { ...deps, now: clock }))
    active = operation
    void operation.finally(() => { if (active === operation) active = undefined })
    return operation
  }
  const retry = (now?: Date) => serialized(() => {
    const clock = deps.now || (() => new Date())
    return run(now || clock(), true, true, now ? deps : { ...deps, now: clock })
  })
  const status = async () => {
    try { return view(await read()) }
    catch { error = 'Could not read credit card reminder state'; return view(remembered) }
  }
  const test = (channel: NotificationChannel, now = deps.now?.() || new Date()): Promise<CreditCardAlertOutcome> => serialized(async () => {
    const message = { channel, id: `cortex-card:test:${channel}:${now.getTime()}`, title: 'Credit card reminder test',
      message: `Test from Cortex (${now.toISOString()}). Phone acceptance confirms the provider received this request.`, url: deps.url, category: 'scheduled-alert' }
    const outcome = { channel, id: message.id, title: message.title, at: now.toISOString(), ...await sendCardNotification(deps, message) }
    try {
      const state = await read(); state.outcomes.push(outcome)
      await persistCardAlertState(deps, state)
    } catch { error = 'Could not persist credit card reminder test outcome' }
    return outcome
  })
  const stop = () => { if (interval) clearInterval(interval); interval = undefined }
  const start = () => {
    if (interval) return
    void check()
    interval = setInterval(() => { void check() }, 60 * 60_000)
  }
  return { check, start, stop, status, test, retry }
}
