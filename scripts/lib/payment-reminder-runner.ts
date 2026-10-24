import { planPaymentReminders, normalizePaymentReminderConfig, type PaymentReminder } from '../../src/features/finance/accounts/account-reminders.ts'
import type { FinancialAccount } from '../../src/features/finance/accounts/account-model.ts'

export interface ReminderDelivery {
  status: 'sending' | 'sent' | 'uncertain'
  dueDate: string
  updatedAt: string
  reviewReportedAt?: string
}
export interface ReminderDeliveryState {
  version: 1
  deliveries: Record<string, ReminderDelivery>
}
export interface PaymentReminderDeps {
  now(): Date
  readConfig(): Promise<unknown>
  readAccounts(): Promise<FinancialAccount[]>
  readState(): Promise<ReminderDeliveryState>
  writeState(state: ReminderDeliveryState): Promise<void>
  send(reminder: PaymentReminder): Promise<void>
  reportHeld(count: number): Promise<void>
}
export const MAX_REMINDER_SENDS = 10
export const MAX_REMINDER_HISTORY = 2000

export function pruneReminderState(state: ReminderDeliveryState, now: Date): ReminderDeliveryState {
  const cutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10)
  const deliveries = Object.fromEntries(Object.entries(state.deliveries).filter(([, value]) => value.dueDate >= cutoff))
  if (Object.keys(deliveries).length > MAX_REMINDER_HISTORY) throw new Error('Reminder delivery history exceeds its supported limit.')
  return { version: 1, deliveries }
}

export async function runPaymentReminders(deps: PaymentReminderDeps, dryRun = false) {
  const now = deps.now()
  const config = normalizePaymentReminderConfig(await deps.readConfig())
  if (!config.enabled) return { ...planPaymentReminders(await deps.readAccounts(), now, config, new Set()), pushed: 0, held: 0, newlyHeld: 0, dryRun, skipped: 'disabled' }
  let state = pruneReminderState(await deps.readState(), now)
  const delivered = () => new Set(Object.keys(state.deliveries))
  const plan = planPaymentReminders(await deps.readAccounts(), now, config, delivered())
  if (dryRun) return { ...plan, pushed: 0, held: Object.values(state.deliveries).filter((entry) => entry.status !== 'sent').length, newlyHeld: 0, dryRun: true }

  let pushed = 0
  for (const candidate of plan.due.slice(0, MAX_REMINDER_SENDS)) {
    // Re-read the live settings and dates immediately before each delivery.
    const current = planPaymentReminders(await deps.readAccounts(), deps.now(), normalizePaymentReminderConfig(await deps.readConfig()), delivered())
    const reminder = current.due.find((entry) => entry.key === candidate.key)
    if (!reminder) continue
    state = { ...state, deliveries: { ...state.deliveries, [reminder.key]: { status: 'sending', dueDate: reminder.dueDate, updatedAt: deps.now().toISOString() } } }
    await deps.writeState(state)
    try {
      await deps.send(reminder)
    } catch {
      state.deliveries[reminder.key] = { ...state.deliveries[reminder.key], status: 'uncertain' }
      await deps.writeState(state)
      break
    }
    state.deliveries[reminder.key] = { ...state.deliveries[reminder.key], status: 'sent', updatedAt: deps.now().toISOString() }
    await deps.writeState(state)
    pushed++
  }
  await deps.writeState(state)
  const held = Object.entries(state.deliveries).filter(([, entry]) => entry.status !== 'sent' && entry.dueDate >= plan.today)
  const unreported = held.filter(([, entry]) => !entry.reviewReportedAt)
  if (unreported.length) {
    await deps.reportHeld(unreported.length)
    for (const [key, entry] of unreported) state.deliveries[key] = { ...entry, reviewReportedAt: deps.now().toISOString() }
    await deps.writeState(state)
  }
  return { ...plan, pushed, held: held.length, newlyHeld: unreported.length, dryRun: false }
}
