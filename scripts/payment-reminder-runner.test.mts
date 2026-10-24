import test from 'node:test'
import assert from 'node:assert/strict'
import { runPaymentReminders, pruneReminderState, type PaymentReminderDeps, type ReminderDeliveryState } from './lib/payment-reminder-runner.ts'
import type { FinancialAccount } from '../src/features/finance/accounts/account-model.ts'

const card: FinancialAccount = { id: 'example', name: 'Example credit', institution: 'Test bank', kind: 'credit', currency: 'COP', dueDay: 24, dueStartMonth: '2026-11', archived: false, fees: [] }
const config = { enabled: true, daysBefore: 3, hour: 9, timeZone: 'America/Bogota', excludedAccountIds: [] }
function fixture() {
  let state: ReminderDeliveryState = { version: 1, deliveries: {} }
  const events: string[] = []
  const deps: PaymentReminderDeps = {
    now: () => new Date('2026-11-21T14:00:00Z'),
    readConfig: async () => config, readAccounts: async () => [card],
    readState: async () => structuredClone(state),
    writeState: async (next) => { events.push(`write:${Object.values(next.deliveries).at(-1)?.status}`); state = structuredClone(next) },
    send: async () => { events.push('push') },
    reportHeld: async (count) => { events.push(`review:${count}`) },
  }
  return { deps, events, state: () => state }
}

test('a delivery is claimed before sending, saved only after acceptance, and never repeated', async () => {
  const f = fixture()
  assert.equal((await runPaymentReminders(f.deps)).pushed, 1)
  assert.deepEqual(f.events.slice(0, 3), ['write:sending', 'push', 'write:sent'])
  assert.equal((await runPaymentReminders(f.deps)).pushed, 0)
  assert.equal(f.events.filter((event) => event === 'push').length, 1)
})

test('dry run previews the reminder without sending or consuming it', async () => {
  const f = fixture()
  assert.equal((await runPaymentReminders(f.deps, true)).due.length, 1)
  assert.deepEqual(f.events, [])
  assert.deepEqual(f.state().deliveries, {})
})

test('a timeout holds an uncertain delivery for review rather than replaying it', async () => {
  const f = fixture()
  f.deps.send = async () => { f.events.push('push'); throw Error('timeout') }
  assert.equal((await runPaymentReminders(f.deps)).newlyHeld, 1)
  assert.equal(Object.values(f.state().deliveries)[0].status, 'uncertain')
  assert.equal((await runPaymentReminders(f.deps)).newlyHeld, 0)
  assert.equal(f.events.filter((event) => event === 'push').length, 1)
  assert.equal(f.events.filter((event) => event === 'review:1').length, 1)
})

test('a crash after Pushcut acceptance but before settlement leaves a durable sending claim', async () => {
  const f = fixture(), write = f.deps.writeState
  f.deps.writeState = async (state) => {
    if (Object.values(state.deliveries).some((entry) => entry.status === 'sent')) throw Error('disk full')
    await write(state)
  }
  await assert.rejects(runPaymentReminders(f.deps), /disk full/)
  assert.equal(Object.values(f.state().deliveries)[0].status, 'sending')
  assert.equal((await runPaymentReminders(f.deps)).held, 1)
  assert.equal(f.events.filter((event) => event === 'push').length, 1)
})

test('held review is acknowledged only after the report succeeds', async () => {
  const f = fixture()
  f.deps.send = async () => { throw Error('timeout') }
  f.deps.reportHeld = async () => { throw Error('report unavailable') }
  await assert.rejects(runPaymentReminders(f.deps), /report unavailable/)
  assert.equal(Object.values(f.state().deliveries)[0].reviewReportedAt, undefined)
  f.deps.reportHeld = async () => { f.events.push('review') }
  assert.equal((await runPaymentReminders(f.deps)).newlyHeld, 1)
  assert.equal((await runPaymentReminders(f.deps)).newlyHeld, 0)
  assert.equal(f.events.filter((event) => event === 'review').length, 1)
})

test('exclusions and changed dates are reread at the point of delivery', async () => {
  for (const change of ['exclusion', 'date']) {
    const f = fixture()
    let reads = 0
    if (change === 'exclusion') f.deps.readConfig = async () => ++reads > 1 ? { ...config, excludedAccountIds: [card.id] } : config
    else f.deps.readAccounts = async () => ++reads > 1 ? [{ ...card, dueDay: 28 }] : [card]
    assert.equal((await runPaymentReminders(f.deps)).pushed, 0)
    assert.equal(f.events.includes('push'), false)
  }
})

test('disabling reminders stops all delivery and state writes, including held reminders', async () => {
  const f = fixture()
  f.deps.readConfig = async () => ({ ...config, enabled: false })
  f.deps.readState = async () => { throw Error('must not read delivery state') }
  assert.equal((await runPaymentReminders(f.deps)).pushed, 0)
  assert.deepEqual(f.events, [])
})

test('each run is bounded and stale history is pruned without losing current holds', async () => {
  const f = fixture()
  f.deps.readAccounts = async () => Array.from({ length: 20 }, (_, i) => ({ ...card, id: `example-${i}` }))
  assert.equal((await runPaymentReminders(f.deps)).pushed, 10)
  assert.equal((await runPaymentReminders(f.deps)).pushed, 10)
  const entry = { status: 'uncertain' as const, dueDate: '2026-11-24', updatedAt: '2026-11-21T14:00:00Z' }
  const pruned = pruneReminderState({ version: 1, deliveries: { old: { ...entry, dueDate: '2026-01-01' }, current: entry } }, f.deps.now())
  assert.deepEqual(Object.keys(pruned.deliveries), ['current'])
})
