// Credit card payment reminder planning. Pure functions only: the caller passes the
// current instant and the keys it has already delivered; no storage, no clock.

import { MAX_ACCOUNTS, nextAccountCycleDate, parseAccountDate, type FinancialAccount } from './account-model.ts'

export const PAYMENT_REMINDERS_KEY = 'cortex-card-payment-reminders'

export type PaymentReminderTimeZone = 'America/Bogota'

export interface PaymentReminderConfig {
  enabled: boolean
  daysBefore: number
  hour: number
  timeZone: PaymentReminderTimeZone
  excludedAccountIds: string[]
}

export interface PaymentReminder {
  key: string
  accountId: string
  accountName: string
  dueDate: string
  remindOn: string
  daysLeft: number
}

export interface PaymentReminderPlan {
  today: string
  due: PaymentReminder[]
  upcoming: PaymentReminder[]
}

export const DEFAULT_PAYMENT_REMINDER_CONFIG: Readonly<PaymentReminderConfig> = Object.freeze({
  enabled: false,
  daysBefore: 3,
  hour: 9,
  timeZone: 'America/Bogota',
  excludedAccountIds: [],
})

export const MAX_REMINDER_DAYS_BEFORE = 14
export const MAX_EXCLUDED_ACCOUNTS = 100
const MAX_ID_LENGTH = 100
const SUPPORTED_TIME_ZONES: readonly string[] = ['America/Bogota']

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.floor(value), min), max)
}

/** Accepts any stored value; unknown or malformed fields fall back to the defaults. */
export function normalizePaymentReminderConfig(value: unknown): PaymentReminderConfig {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const defaults = DEFAULT_PAYMENT_REMINDER_CONFIG
  const excluded = new Set<string>()
  if (Array.isArray(raw.excludedAccountIds)) {
    for (const id of raw.excludedAccountIds) {
      if (excluded.size >= MAX_EXCLUDED_ACCOUNTS) break
      if (typeof id !== 'string') continue
      const trimmed = id.trim()
      if (trimmed && trimmed.length <= MAX_ID_LENGTH) excluded.add(trimmed)
    }
  }
  return {
    enabled: raw.enabled === true,
    daysBefore: boundedInteger(raw.daysBefore, 0, MAX_REMINDER_DAYS_BEFORE, defaults.daysBefore),
    hour: boundedInteger(raw.hour, 0, 23, defaults.hour),
    timeZone: defaults.timeZone,
    excludedAccountIds: [...excluded],
  }
}

/** Local calendar date and hour of `now` in `timeZone`, independent of the host zone. */
function localDateHour(now: Date, timeZone: string): { today: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  const today = `${part('year')}-${part('month')}-${part('day')}`
  const hour = Number(part('hour'))
  if (!parseAccountDate(today) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('Could not resolve the local date for reminders.')
  }
  return { today, hour }
}

const dayNumber = (date: string) => {
  const ymd = parseAccountDate(date)
  if (!ymd) throw new Error('Date must be a valid date (YYYY-MM-DD).')
  return Date.UTC(ymd.y, ymd.m - 1, ymd.d) / 86_400_000
}
const fromDayNumber = (days: number) => new Date(days * 86_400_000).toISOString().slice(0, 10)

export const paymentReminderKey = (accountId: string, dueDate: string) =>
  `payment:${encodeURIComponent(accountId)}:${dueDate}`

/**
 * Plans the next payment reminder for each active credit card with a valid schedule.
 * `upcoming` previews the next cycle per card; `due` holds only reminders to send now.
 */
export function planPaymentReminders(
  accounts: readonly FinancialAccount[],
  now: Date,
  config: PaymentReminderConfig,
  deliveredKeys: ReadonlySet<string>,
): PaymentReminderPlan {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Current time must be a valid date.')
  if (!config || !SUPPORTED_TIME_ZONES.includes(config.timeZone)) throw new Error('Reminder time zone is not supported.')
  const settings = normalizePaymentReminderConfig(config)
  const { today, hour } = localDateHour(now, config.timeZone)
  const todayNumber = dayNumber(today)
  const excluded = new Set(settings.excludedAccountIds)

  const upcoming: PaymentReminder[] = []
  for (const account of Array.isArray(accounts) ? accounts.slice(0, MAX_ACCOUNTS) : []) {
    if (!account || typeof account !== 'object' || account.archived !== false || account.kind !== 'credit') continue
    const accountId = typeof account.id === 'string' ? account.id.trim() : ''
    if (!accountId || excluded.has(accountId)) continue
    const dueDate = nextAccountCycleDate(account, 'payment', today)
    if (!dueDate) continue
    const dueNumber = dayNumber(dueDate)
    upcoming.push({
      key: paymentReminderKey(accountId, dueDate),
      accountId,
      accountName: typeof account.name === 'string' ? account.name.trim() : '',
      dueDate,
      remindOn: fromDayNumber(dueNumber - settings.daysBefore),
      daysLeft: dueNumber - todayNumber,
    })
  }

  upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate)
    || a.accountName.localeCompare(b.accountName)
    || a.key.localeCompare(b.key))
  const bounded = upcoming.slice(0, MAX_ACCOUNTS)
  const due = settings.enabled && hour >= settings.hour
    ? bounded.filter((reminder) => reminder.remindOn <= today && reminder.dueDate >= today && !deliveredKeys.has(reminder.key))
    : []
  return { today, due, upcoming: bounded }
}
