import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_ACCOUNTS, type FinancialAccount } from '../src/features/finance/accounts/account-model.ts'
import {
  PAYMENT_REMINDERS_KEY,
  normalizePaymentReminderConfig,
  planPaymentReminders,
  type PaymentReminderConfig,
} from '../src/features/finance/accounts/account-reminders.ts'

const card = (overrides: Partial<FinancialAccount> = {}): FinancialAccount => ({
  id: 'card-a', name: 'Sample Card A', institution: 'Example Bank', kind: 'credit', currency: 'COP',
  dueDay: 15, archived: false, fees: [], ...overrides,
})
const config = (overrides: Partial<PaymentReminderConfig> = {}): PaymentReminderConfig => ({
  ...normalizePaymentReminderConfig({}), enabled: true, ...overrides,
})
/** Bogotá wall-clock time (UTC-5, no DST) as an instant. */
const bogota = (local: string) => new Date(`${local}-05:00`)
const none = new Set<string>()
const plan = (accounts: FinancialAccount[], local: string, overrides: Partial<PaymentReminderConfig> = {}, delivered = none) =>
  planPaymentReminders(accounts, bogota(local), config(overrides), delivered)

test('config key and defaults are disabled, three days before at 09:00 Bogotá', () => {
  assert.equal(PAYMENT_REMINDERS_KEY, 'cortex-card-payment-reminders')
  const defaults = { enabled: false, daysBefore: 3, hour: 9, timeZone: 'America/Bogota', excludedAccountIds: [] }
  for (const value of [undefined, null, 'on', 42, [], {}, { enabled: 'true' }]) {
    assert.deepEqual(normalizePaymentReminderConfig(value), defaults)
  }
})

test('config normalization bounds numbers, timezone and exclusions', () => {
  assert.deepEqual(normalizePaymentReminderConfig({
    enabled: true, daysBefore: 99, hour: -4, timeZone: 'Europe/Madrid',
    excludedAccountIds: [' card-a ', 'card-a', '', 7, null, 'x'.repeat(101), 'card-b'],
  }), { enabled: true, daysBefore: 14, hour: 0, timeZone: 'America/Bogota', excludedAccountIds: ['card-a', 'card-b'] })
  assert.equal(normalizePaymentReminderConfig({ daysBefore: -1, hour: 30 }).daysBefore, 0)
  assert.equal(normalizePaymentReminderConfig({ hour: 30 }).hour, 23)
  assert.equal(normalizePaymentReminderConfig({ daysBefore: 2.7, hour: 8.9 }).daysBefore, 2)
  assert.equal(normalizePaymentReminderConfig({ daysBefore: Number.NaN, hour: '9' }).daysBefore, 3)
  assert.equal(normalizePaymentReminderConfig({ hour: Infinity }).hour, 9)
  const many = Array.from({ length: 150 }, (_, i) => `card-${i}`)
  const excluded = normalizePaymentReminderConfig({ excludedAccountIds: many }).excludedAccountIds
  assert.equal(excluded.length, 100)
  assert.deepEqual(excluded, many.slice(0, 100))
})

test('disabled config plans upcoming dates but never marks reminders due', () => {
  const result = plan([card()], '2026-11-12T10:00:00', { enabled: false })
  assert.deepEqual(result.due, [])
  assert.equal(result.upcoming.length, 1)
})

test('reminder fires three days before at 09:00 Bogotá, not at 08:59', () => {
  assert.deepEqual(plan([card()], '2026-11-12T08:59:59').due, [])
  const result = plan([card()], '2026-11-12T09:00:00')
  assert.equal(result.today, '2026-11-12')
  assert.deepEqual(result.due, [{
    key: 'payment:card-a:2026-11-15', accountId: 'card-a', accountName: 'Sample Card A',
    dueDate: '2026-11-15', remindOn: '2026-11-12', daysLeft: 3,
  }])
  assert.deepEqual(result.upcoming, result.due)
})

test('custom hour and days-before settings are honored', () => {
  assert.deepEqual(plan([card()], '2026-11-14T17:59:00', { daysBefore: 1, hour: 18 }).due, [])
  assert.equal(plan([card()], '2026-11-14T18:00:00', { daysBefore: 1, hour: 18 }).due.length, 1)
  assert.deepEqual(plan([card()], '2026-11-14T23:00:00', { daysBefore: 0 }).due, [])
  assert.equal(plan([card()], '2026-11-15T09:00:00', { daysBefore: 0 }).due[0].daysLeft, 0)
})

test('local date comes from Bogotá, not UTC or the host zone', () => {
  // 2026-11-13T03:30Z is still 22:30 on 2026-11-12 in Bogotá.
  const evening = planPaymentReminders([card()], new Date('2026-11-13T03:30:00Z'), config(), none)
  assert.equal(evening.today, '2026-11-12')
  assert.equal(evening.due.length, 1)
  assert.equal(evening.due[0].daysLeft, 3)
  // 2026-11-12T13:59Z is 08:59 Bogotá even though UTC is past 09:00.
  assert.equal(planPaymentReminders([card()], new Date('2026-11-12T13:59:00Z'), config(), none).due.length, 0)
  assert.equal(planPaymentReminders([card()], new Date('2026-11-12T14:00:00Z'), config(), none).due.length, 1)
  // Before the threshold day in Bogotá even though UTC already rolled over to it.
  const early = planPaymentReminders([card()], new Date('2026-11-12T04:00:00Z'), config({ hour: 0 }), none)
  assert.equal(early.today, '2026-11-11')
  assert.deepEqual(early.due, [])
})

test('reminders more than daysBefore away stay upcoming only', () => {
  const result = plan([card()], '2026-11-11T12:00:00')
  assert.deepEqual(result.due, [])
  assert.deepEqual(result.upcoming.map((r) => [r.dueDate, r.remindOn, r.daysLeft]), [['2026-11-15', '2026-11-12', 4]])
})

test('late catch-up yields one reminder per cycle and delivered keys suppress it', () => {
  const keys = ['2026-11-13', '2026-11-14', '2026-11-15'].map((day) => {
    const result = plan([card()], `${day}T20:00:00`)
    assert.equal(result.due.length, 1)
    return result.due[0].key
  })
  assert.deepEqual(new Set(keys), new Set(['payment:card-a:2026-11-15']))
  const delivered = new Set(keys)
  for (const day of ['2026-11-12', '2026-11-14', '2026-11-15']) {
    assert.deepEqual(plan([card()], `${day}T20:00:00`, {}, delivered).due, [])
  }
})

test('after the due date the previous cycle never leaks into the plan', () => {
  const result = plan([card()], '2026-11-16T10:00:00')
  assert.deepEqual(result.due, [])
  assert.deepEqual(result.upcoming.map((r) => [r.dueDate, r.daysLeft]), [['2026-12-15', 29]])
  assert.equal(plan([card()], '2026-12-12T09:00:00').due[0].key, 'payment:card-a:2026-12-15')
})

test('a future first payment month is honored', () => {
  const later = card({ dueStartMonth: '2027-01' })
  assert.deepEqual(plan([later], '2026-11-12T10:00:00').due, [])
  assert.deepEqual(plan([later], '2026-12-12T10:00:00').due, [])
  assert.equal(plan([later], '2026-12-12T10:00:00').upcoming[0].dueDate, '2027-01-15')
  assert.equal(plan([later], '2027-01-12T10:00:00').due[0].dueDate, '2027-01-15')
})

test('cross-month, cross-year and month-end clamping use the account model dates', () => {
  const first = card({ dueDay: 1 })
  assert.deepEqual(plan([first], '2026-10-29T09:00:00').due.map((r) => [r.dueDate, r.remindOn]), [['2026-11-01', '2026-10-29']])
  assert.deepEqual(plan([first], '2026-10-28T23:00:00').due, [])
  const second = card({ dueDay: 2 })
  assert.deepEqual(plan([second], '2026-12-30T09:00:00').due.map((r) => [r.dueDate, r.daysLeft]), [['2027-01-02', 3]])
  const last = card({ dueDay: 31 })
  assert.deepEqual(plan([last], '2027-02-25T09:00:00').due.map((r) => [r.dueDate, r.remindOn]), [['2027-02-28', '2027-02-25']])
  assert.deepEqual(plan([last], '2028-02-26T09:00:00').due.map((r) => r.dueDate), ['2028-02-29'])
  assert.deepEqual(plan([last], '2026-04-27T09:00:00').due.map((r) => r.dueDate), ['2026-04-30'])
  assert.deepEqual(plan([card({ dueDay: 1, dueStartMonth: '2027-01' })], '2026-12-29T09:00:00').due.map((r) => r.dueDate), ['2027-01-01'])
})

test('excluded cards never remind even with a valid schedule', () => {
  const accounts = [card(), card({ id: 'card-b', name: 'Sample Card B' })]
  const result = plan(accounts, '2026-11-12T10:00:00', { excludedAccountIds: ['card-a'] })
  assert.deepEqual(result.due.map((r) => r.accountId), ['card-b'])
  assert.deepEqual(result.upcoming.map((r) => r.accountId), ['card-b'])
  // Excluded before a schedule existed; still excluded once one is set.
  const unscheduled = card({ dueDay: undefined })
  assert.deepEqual(plan([unscheduled], '2026-11-12T10:00:00', { excludedAccountIds: ['card-a'] }).upcoming, [])
  assert.deepEqual(plan([card()], '2026-11-12T10:00:00', { excludedAccountIds: ['card-a'] }).upcoming, [])
})

test('archived, bank, debit and unscheduled or malformed cards are ignored', () => {
  const accounts: FinancialAccount[] = [
    card({ id: 'archived', archived: true }),
    { id: 'bank', name: 'Sample Bank', institution: 'Example Bank', kind: 'bank', currency: 'COP', archived: false, fees: [] },
    { id: 'debit', name: 'Sample Debit', institution: 'Example Bank', kind: 'debit', currency: 'COP', archived: false, fees: [], dueDay: 15 } as FinancialAccount,
    card({ id: 'no-day', dueDay: undefined }),
    card({ id: 'bad-day', dueDay: 32 }),
    card({ id: 'bad-month', dueStartMonth: '2026-13' }),
    card({ id: '   ' }),
    null as unknown as FinancialAccount,
  ]
  const result = plan(accounts, '2026-11-12T10:00:00')
  assert.deepEqual(result.due, [])
  assert.deepEqual(result.upcoming, [])
})

test('keys encode the account id and results sort chronologically', () => {
  const accounts = [
    card({ id: 'z/1', name: 'Sample Card Z', dueDay: 16 }),
    card({ id: 'b', name: 'Sample Card B', dueDay: 14 }),
    card({ id: 'a', name: 'Sample Card A', dueDay: 15 }),
  ]
  const result = plan(accounts, '2026-11-13T10:00:00')
  assert.deepEqual(result.due.map((r) => r.key), ['payment:b:2026-11-14', 'payment:a:2026-11-15', 'payment:z%2F1:2026-11-16'])
  for (const reminder of result.due) assert.doesNotMatch(reminder.key, /[/\\]|Sample/)
})

test('output is bounded by the account limit', () => {
  const accounts = Array.from({ length: MAX_ACCOUNTS + 50 }, (_, i) => card({ id: `card-${i}`, name: `Sample ${i}` }))
  const result = plan(accounts, '2026-11-12T10:00:00')
  assert.equal(result.upcoming.length, MAX_ACCOUNTS)
  assert.equal(result.due.length, MAX_ACCOUNTS)
})

test('invalid instants and unsupported time zones are rejected', () => {
  assert.throws(() => planPaymentReminders([card()], new Date('invalid'), config(), none), /valid date/)
  assert.throws(() => planPaymentReminders([card()], '2026-11-12' as unknown as Date, config(), none), /valid date/)
  assert.throws(
    () => planPaymentReminders([card()], bogota('2026-11-12T10:00:00'), { ...config(), timeZone: 'UTC' as 'America/Bogota' }, none),
    /time zone/,
  )
})
