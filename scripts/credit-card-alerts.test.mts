import test from 'node:test'
import assert from 'node:assert/strict'
import { createCreditCardAlerts } from '../electron/credit-card-alerts.ts'
import { emptyCreditCardAlertState } from '../electron/credit-card-alerts-types.ts'
import type { CreditCardAlertState } from '../electron/credit-card-alerts-types.ts'
import type { CreditCardState } from '../electron/credit-card-types.ts'
import type { NotificationDelivery, NotificationMessage } from '../electron/notification-transport.ts'

const daytime = (day: number, hour = 14) => new Date(`2026-11-${String(day).padStart(2, '0')}T${hour}:00:00Z`)
function fixture() {
  let ledger: CreditCardState = {
    version: 1, card: { id: 'card', name: 'Card', limit: 1000, closingDay: 4, dueDay: 24 },
    purchases: [{ id: 'purchase', name: 'Purchase', amount: 100, status: 'pending', installments: 1, firstDueDate: '2026-11-24' }],
    cycles: [{ id: '2026-11', statementConfirmed: true }], payments: [], snapshots: [], reserves: {}, requests: [], audit: [],
    reminders: { enabled: true, channels: ['native', 'phone'], leadDays: [7, 3, 1], quietBefore: 8, quietAfter: 23 },
  }
  let state = emptyCreditCardAlertState()
  let writes = 0
  let failWrite = 0
  const sent: NotificationMessage[] = []
  let deliver = async (_message: NotificationMessage): Promise<NotificationDelivery> => ({ status: 'Sent' })
  const deps = {
    readLedger: async () => structuredClone(ledger), readAlertState: async () => structuredClone(state),
    writeAlertState: async (next: CreditCardAlertState) => {
      writes++
      if (writes === failWrite) return { ok: false }
      state = structuredClone(next); return { ok: true }
    },
    send: async (message: NotificationMessage) => { sent.push(message); return deliver(message) },
    readiness: () => ({ native: { ready: true }, phone: { ready: true } }),
  }
  return {
    deps, sent, checker: createCreditCardAlerts(deps), state: () => state,
    edit: (change: (value: CreditCardState) => void) => change(ledger),
    sender: (next: typeof deliver) => { deliver = next }, failWrite: (at: number) => { failWrite = at },
    seed: (next: CreditCardAlertState) => { state = next },
  }
}

test('threshold catchup sends the current action once and preserves channel success after restart', async () => {
  const f = fixture()
  await f.checker.check(daytime(22))
  assert.equal(f.sent.length, 2)
  assert.match(f.sent[0].message, /100/)
  await createCreditCardAlerts(f.deps).check(daytime(22, 16))
  assert.equal(f.sent.length, 2)
  await f.checker.check(daytime(23))
  assert.equal(f.sent.length, 4)
})

test('partial payments show only unpaid remainder; preparation does not suppress and full payment does', async () => {
  const f = fixture()
  f.edit((s) => {
    s.reserves['2026-11'] = 100
    s.payments.push({ id: 'pay', amount: 40, paidDate: '2026-11-10', status: 'completed', allocations: [{ cycleId: '2026-11', amount: 40 }] })
  })
  await f.checker.check(daytime(17))
  assert.match(f.sent[0].message, /60/)
  f.edit((s) => { s.payments[0].amount = 100; s.payments[0].allocations[0].amount = 100 })
  await f.checker.check(daytime(24))
  assert.equal(f.sent.length, 2)
  assert.equal(Object.keys(f.state().occurrences).length, 0)
})

test('Bogota quiet hours defer without consuming thresholds; due and overdue send at most once each day', async () => {
  const f = fixture()
  await f.checker.check(daytime(24, 12)) // 07:00 Bogota
  assert.equal(f.sent.length, 0)
  await f.checker.check(daytime(24, 13))
  assert.equal(f.sent.length, 2)
  await f.checker.check(daytime(25)); await f.checker.check(daytime(25, 16))
  assert.equal(f.sent.length, 4)
  await f.checker.check(daytime(26))
  assert.equal(f.sent.length, 6)
})

test('statement checkpoint persists until confirmed and disabled settings send nothing', async () => {
  const f = fixture()
  f.edit((s) => { s.cycles[0].statementConfirmed = false })
  await f.checker.check(daytime(4))
  assert.equal(f.sent.length, 2)
  assert.match(f.sent[0].message, /statement/i)
  f.edit((s) => { s.cycles[0].statementConfirmed = true; s.reminders.enabled = false })
  await f.checker.check(daytime(17))
  assert.equal(f.sent.length, 2)
})

test('failed phone retries are persisted, capped at three, and do not resend successful native channel', async () => {
  const f = fixture()
  f.sender(async (m) => m.channel === 'phone' ? { status: 'Failed', error: 'offline' } : { status: 'Sent' })
  await f.checker.check(daytime(17))
  await createCreditCardAlerts(f.deps).check(daytime(17, 16))
  await createCreditCardAlerts(f.deps).check(daytime(17, 18))
  await createCreditCardAlerts(f.deps).check(daytime(17, 20))
  assert.equal(f.sent.filter((m) => m.channel === 'phone').length, 3)
  assert.equal(f.sent.filter((m) => m.channel === 'native' && !m.id.endsWith(':failure')).length, 1)
  assert.equal(f.sent.filter((m) => m.id.endsWith(':failure')).length, 1)
  assert.equal((await f.checker.status()).outcomes.filter((o) => o.channel === 'phone').at(-1)?.status, 'Failed')
})

test('muted results remain muted and manual retry opens one new bounded attempt', async () => {
  const f = fixture()
  f.sender(async () => ({ status: 'Muted' }))
  for (const hour of [14, 16, 18, 20]) await f.checker.check(daytime(17, hour))
  assert.equal(f.sent.length, 6)
  assert.ok(f.state().outcomes.every((o) => o.status === 'Muted'))
  f.sender(async () => ({ status: 'Sent' }))
  await f.checker.retry(daytime(17, 21))
  assert.equal(f.sent.length, 8)
})

test('queued retry rereads cancellation, changed dates, and disabled channels', async () => {
  for (const edit of [
    (s: CreditCardState) => { s.purchases[0].status = 'cancelled' },
    (s: CreditCardState) => { s.purchases[0].firstDueDate = '2026-12-24' },
    (s: CreditCardState) => { s.reminders.channels = [] },
  ]) {
    const f = fixture(); f.sender(async () => ({ status: 'Failed' }))
    await f.checker.check(daytime(17)); f.edit(edit)
    await createCreditCardAlerts(f.deps).check(daytime(17, 16))
    assert.equal(f.sent.length, 2)
  }
})

test('overlapping ticks share one check and reread paid state before the next channel sends', async () => {
  const f = fixture()
  let release!: () => void
  f.sender(async () => { await new Promise<void>((resolve) => { release = resolve }); return { status: 'Sent' } })
  const first = f.checker.check(daytime(17)); const second = f.checker.check(daytime(17))
  while (!release) await new Promise((resolve) => setImmediate(resolve))
  f.edit((s) => { s.purchases[0].status = 'cancelled' }); release()
  await Promise.all([first, second])
  assert.equal(f.sent.length, 1)
})

test('failed occurrence persistence prevents delivery and surfaces the error', async () => {
  const f = fixture(); f.failWrite(2)
  const result = await f.checker.check(daytime(17))
  assert.equal(f.sent.length, 0)
  assert.match(result.error || '', /persist/i)
  assert.match((await f.checker.status()).error || '', /persist/i)
})

test('post-delivery write failure preserves attempts and stable ID on restart', async () => {
  const f = fixture(); f.failWrite(3)
  await f.checker.check(daytime(17))
  assert.equal(f.sent.length, 1)
  assert.equal(Object.values(f.state().occurrences)[0].channels.native?.attempts, 1)
  await createCreditCardAlerts(f.deps).check(daytime(17, 16))
  assert.equal(f.sent[0].id, f.sent[1].id)
})

test('test notification is labelled, recorded, bounded, and never implies phone display', async () => {
  const f = fixture()
  const state = emptyCreditCardAlertState()
  state.outcomes = Array.from({ length: 105 }, (_, i) => ({ channel: 'phone', id: `old-${i}`, title: 'Old', at: daytime(1).toISOString(), status: 'Sent' }))
  f.seed(state)
  const result = await f.checker.test('phone', daytime(17))
  assert.equal(result.status, 'Sent'); assert.match(result.title, /test/i)
  assert.equal((await f.checker.status()).outcomes.length, 100)
})

test('corrupt bookkeeping fails closed with a visible error instead of resetting retry caps', async () => {
  const f = fixture()
  f.seed({ version: 1, lastCheckedAt: null, occurrences: { broken: { channels: { phone: { attempts: -1 } } } }, outcomes: [] } as unknown as CreditCardAlertState)
  const result = await f.checker.check(daytime(17))
  assert.equal(f.sent.length, 0)
  assert.match(result.error || '', /state|check/i)
})

test('interrupted delivery remains visibly incomplete after process restart', async () => {
  const f = fixture(); f.failWrite(3)
  await f.checker.check(daytime(17))
  const status = await createCreditCardAlerts(f.deps).status()
  assert.match(status.error || '', /incomplete/i)
})

test('retry backoff and live quiet clock are checked again before delivery', async () => {
  const f = fixture(); f.sender(async () => ({ status: 'Failed' }))
  await f.checker.check(daytime(17))
  await f.checker.check(new Date('2026-11-17T14:10:00Z'))
  assert.equal(f.sent.length, 2)
  const g = fixture()
  let clock = daytime(17, 14)
  const checker = createCreditCardAlerts({ ...g.deps, now: () => clock })
  g.sender(async () => { clock = new Date('2026-11-18T04:00:00Z'); return { status: 'Sent' } }) // 23:00 Bogota
  await checker.check()
  assert.equal(g.sent.length, 1)
})
