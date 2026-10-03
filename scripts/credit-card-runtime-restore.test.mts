import assert from 'node:assert/strict'
import test from 'node:test'
import { createCreditCardRuntime } from '../electron/credit-card-runtime.ts'
import { applyCreditCardCommand, emptyCreditCardState } from '../electron/credit-card-model.ts'
import { emptyCreditCardAlertState, type CreditCardAlertState } from '../electron/credit-card-alerts-types.ts'
import { CREDIT_CARD_KEY as ledgerKey, CREDIT_CARD_ALERTS_KEY as alertsKey, type CreditCardState } from '../electron/credit-card-types.ts'
import type { NotificationDelivery, NotificationMessage } from '../electron/notification-transport.ts'

const actionKey = 'payment:2090-11:2090-11-24:7'
const daytime = new Date('2090-11-17T14:00:00Z')
function initial() {
  const state = applyCreditCardCommand(emptyCreditCardState(), { type: 'initialize', requestId: 'setup',
    card: { id: 'card', name: 'Card', limit: 1000, closingDay: 4, dueDay: 24 },
    purchases: [{ id: 'purchase', name: 'Purchase', amount: 100, installments: 1, firstDueDate: '2090-11-24', status: 'posted' }],
    cycles: [{ id: '2090-11', statementConfirmed: true }] }, '2026-10-03T16:00:00Z')
  state.reminders.channels = ['native']
  return state
}
function bookkeeping(status: 'Sent' | 'Pending' | 'Failed' = 'Sent', attempts = 1) {
  const state = emptyCreditCardAlertState()
  state.occurrences[actionKey] = { id: actionKey, cycleId: '2090-11', dueDate: '2090-11-24',
    kind: 'payment', threshold: '7', generation: 0, channels: { native: { attempts, status } } }
  return state
}
function fixture() {
  let ledger = initial(), alerts = emptyCreditCardAlertState()
  const writes: string[] = [], sent: NotificationMessage[] = []
  let failure: string | undefined, rollbackFailure = false
  let send = async (_message: NotificationMessage): Promise<NotificationDelivery> => ({ status: 'Sent' })
  const runtime = createCreditCardRuntime({
    readLedger: async () => structuredClone(ledger), readAlertState: async () => structuredClone(alerts),
    write: async (key, value) => {
      writes.push(key)
      if (failure === key) { failure = undefined; return { ok: false, error: 'restore write failed' } }
      if (rollbackFailure && key === ledgerKey && writes.filter(item => item === ledgerKey).length > 1) return { ok: false, error: 'rollback failed' }
      if (key === ledgerKey) ledger = structuredClone(value) as CreditCardState
      else alerts = structuredClone(value) as CreditCardAlertState
      return { ok: true }
    },
    transport: { readiness: () => ({ native: { ready: true }, phone: { ready: true } }),
      send: async message => { sent.push(message); return send(message) } },
    getLogin: () => ({ available: true, enabled: false }), setLogin: enabled => ({ available: true, enabled }), url: 'cortex://finance',
  })
  return { runtime, writes, sent, ledger: () => ledger, alerts: () => alerts,
    seedAlerts: (value: CreditCardAlertState) => { alerts = value },
    fail: (key: string, alsoRollback = false) => { failure = key; rollbackFailure = alsoRollback },
    sender: (value: typeof send) => { send = value } }
}

test('bundle validation rejects shape, corrupt ledger, invalid allocations, and corrupt caps before any write', () => {
  const f = fixture()
  const invalid = initial()
  invalid.payments.push({ id: 'bad', amount: 101, paidDate: '2090-11-17', status: 'completed', allocations: [{ cycleId: '2090-11', amount: 101 }] })
  for (const bundle of [null, [], { [ledgerKey]: null }, { [ledgerKey]: invalid },
    { [alertsKey]: { ...emptyCreditCardAlertState(), occurrences: { broken: {} } } }]) {
    assert.throws(() => f.runtime.validateImport(bundle as unknown as Record<string, unknown>), /bundle|record|state|target/i)
  }
  assert.deepEqual(f.writes, [])
})

test('managed restore returns exact key count, preserves imported caps, and leaves absent keys unchanged', async () => {
  const f = fixture(), imported = { ...initial(), reserves: { '2090-11': 50 } }
  assert.equal(await f.runtime.restore({ _meta: {} }), 0)
  assert.deepEqual(f.writes, [])
  assert.equal(await f.runtime.restore({ [ledgerKey]: imported, [alertsKey]: bookkeeping('Sent', 3) }), 2)
  assert.deepEqual(f.ledger().reserves, { '2090-11': 50 })
  assert.equal(f.alerts().occurrences[actionKey].channels.native?.status, 'Sent')
  assert.equal(f.alerts().occurrences[actionKey].channels.native?.attempts, 3)
  assert.equal(await f.runtime.restore({ [alertsKey]: bookkeeping() }), 1)
  assert.deepEqual(f.ledger().reserves, { '2090-11': 50 })
  assert.equal(f.alerts().occurrences[actionKey].channels.native?.attempts, 3)
})

test('failed second managed write rolls both keys back; rollback failure remains visible', async () => {
  const f = fixture(), oldLedger = initial(), oldAlerts = bookkeeping('Failed', 2)
  f.seedAlerts(oldAlerts); f.fail(alertsKey)
  await assert.rejects(f.runtime.restore({ [ledgerKey]: { ...initial(), reserves: { '2090-11': 50 } }, [alertsKey]: bookkeeping() }), /persist|write/i)
  assert.deepEqual(f.ledger(), oldLedger)
  assert.deepEqual(f.alerts(), oldAlerts)
  const broken = fixture(); broken.fail(alertsKey, true)
  await assert.rejects(broken.runtime.restore({ [ledgerKey]: initial(), [alertsKey]: bookkeeping() }), /rollback/i)
})

test('restore waits for active checker delivery and older backup cannot reset accepted channel caps', async () => {
  const f = fixture()
  let release!: () => void, started!: () => void
  const entered = new Promise<void>(resolve => { started = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  f.sender(async () => { started(); await gate; return { status: 'Sent' } })
  const check = f.runtime.alerts.check(daytime)
  await entered
  const restoring = f.runtime.restore({ [ledgerKey]: { ...initial(), reserves: { '2090-11': 50 } }, [alertsKey]: bookkeeping('Pending', 0) })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.writes.filter(key => key === ledgerKey).length, 0)
  release(); await check
  assert.equal(await restoring, 2)
  await f.runtime.alerts.check(daytime)
  assert.equal(f.sent.length, 1)
  assert.equal(f.alerts().occurrences[actionKey].channels.native?.status, 'Sent')
})
