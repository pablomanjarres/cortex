import test from 'node:test'
import assert from 'node:assert/strict'
import { GymRestAlerts, gymRestUrl, sendGymRestAlert, type GymRestReceipt } from '../electron/gym-rest-alerts.ts'

const resting = { startedAt: '2026-10-06T18:00:00Z', restTimerEnd: 1000, isResting: true }

function harness(saved: Record<string, GymRestReceipt> = {}) {
  let now = 0
  let active: unknown = resting
  let receipts = structuredClone(saved)
  let result: 'sent' | 'muted' = 'sent'
  let failSend = false
  let failWrite = false
  let failSentReceiptWrites = 0
  let sentReceiptWrites = 0
  let sendBarrier: Promise<void> | null = null
  const jobs = new Map<number, { fire: () => Promise<void>; delay: number }>()
  const sent: string[] = []
  const errors: string[] = []
  let scheduled = 0
  const service = new GymRestAlerts({
    now: () => now,
    readActive: async () => active,
    readReceipts: async () => structuredClone(receipts),
    writeReceipts: async (next) => {
      if (failWrite) throw new Error('Store unavailable')
      if (Object.values(next).some((receipt) => receipt.sentAt !== undefined)) {
        sentReceiptWrites++
        if (failSentReceiptWrites-- > 0) throw new Error('Sent receipt storage unavailable')
      }
      receipts = structuredClone(next)
    },
    schedule: (fire, delay) => {
      const key = ++scheduled
      jobs.set(key, { fire, delay })
      return () => { jobs.delete(key) }
    },
    send: async (id) => {
      sent.push(id)
      if (sendBarrier) await sendBarrier
      if (failSend) throw new Error('Network unavailable')
      return result
    },
    log: (message) => errors.push(message),
  })
  return {
    service, jobs, sent, errors,
    get receipts() { return receipts },
    get scheduled() { return scheduled },
    get sentReceiptWrites() { return sentReceiptWrites },
    set result(next: 'sent' | 'muted') { result = next },
    set failSend(next: boolean) { failSend = next },
    set failWrite(next: boolean) { failWrite = next },
    set failSentReceiptWrites(next: number) { failSentReceiptWrites = next },
    set sendBarrier(next: Promise<void> | null) { sendBarrier = next },
    commit(next: unknown) { active = next; service.update(next) },
    async fireNext() {
      const entry = jobs.entries().next().value
      assert.ok(entry, 'A server-owned alert is scheduled')
      const [key, job] = entry
      jobs.delete(key)
      now += job.delay
      await job.fire()
    },
  }
}

test('restoring a saved rest schedules and delivers without a renderer', async () => {
  const h = harness()
  await h.service.restore()
  assert.equal(h.jobs.size, 1)
  await h.fireNext()
  assert.equal(h.sent.length, 1)
  assert.equal(h.receipts[h.sent[0]].sentAt, 1000)
})

test('editing sets with the same deadline keeps one timer', async () => {
  const h = harness()
  await h.service.restore()
  h.commit({ ...resting, exerciseLogs: [{ sets: [{ weight: 20 }] }] })
  assert.equal(h.scheduled, 1)
  await h.fireNext()
  assert.equal(h.sent.length, 1)
  h.commit(resting)
  assert.equal(h.jobs.size, 0)
})

test('skip and finish cancel pending alerts', async () => {
  for (const next of [null, { ...resting, isResting: false, restTimerEnd: null }]) {
    const h = harness()
    await h.service.restore()
    h.commit(next)
    assert.equal(h.jobs.size, 0)
    assert.equal(h.sent.length, 0)
  }
})

test('a changed deadline replaces the pending timer', async () => {
  const h = harness()
  await h.service.restore()
  h.commit({ ...resting, restTimerEnd: 2000 })
  assert.equal(h.jobs.size, 1)
  await h.fireNext()
  assert.equal(h.sent.length, 1)
  assert.equal(h.receipts[h.sent[0]].sentAt, 2000)
})

test('a persisted delivery receipt suppresses an overdue alert after restart', async () => {
  const original = harness()
  await original.service.restore()
  await original.fireNext()
  const restarted = harness(original.receipts)
  await restarted.service.restore()
  await restarted.fireNext()
  assert.deepEqual(restarted.sent, [])
})

test('failed delivery retries three times with a stable provider id', async () => {
  const h = harness()
  h.failSend = true
  await h.service.restore()
  for (let attempt = 0; attempt < 3; attempt++) await h.fireNext()
  assert.equal(h.sent.length, 3)
  assert.equal(new Set(h.sent).size, 1)
  assert.equal(h.jobs.size, 0)
  assert.equal(h.receipts[h.sent[0]].attempts, 3)
  assert.equal(h.receipts[h.sent[0]].sentAt, undefined)
})

test('Muted output is logged as a delivery failure and never recorded as sent', async () => {
  const h = harness()
  h.result = 'muted'
  await h.service.restore()
  for (let attempt = 0; attempt < 3; attempt++) await h.fireNext()
  assert.equal(h.receipts[h.sent[0]].sentAt, undefined)
  assert.match(h.errors.join('\n'), /muted/i)
})

test('an unpersisted attempt never sends an alert', async () => {
  const h = harness()
  h.failWrite = true
  await h.service.restore()
  for (let attempt = 0; attempt < 3; attempt++) await h.fireNext()
  assert.deepEqual(h.sent, [])
  assert.equal(h.jobs.size, 0)
  assert.match(h.errors.join('\n'), /store unavailable/i)
})

test('rest push waits for subprocess completion and uses its Sent acknowledgement', async () => {
  let complete!: (output: string) => void
  let settled = false
  const result = sendGymRestAlert('/fake/notify.sh', 'stable-id', 'https://example.test/#/gym', async (file, args) => {
    assert.equal(file, '/fake/notify.sh')
    assert.deepEqual(args, ['-c', 'gym-rest', '-t', 'Rest finished', '-m', 'Time for your next set.',
      '-s', 'cosmic', '--id', 'stable-id', '--url', 'https://example.test/#/gym', '--url-title', 'Open workout'])
    return new Promise<string>((resolve) => { complete = resolve })
  }).then((value) => { settled = true; return value })
  await Promise.resolve()
  assert.equal(settled, false)
  complete('Sent: [gym-rest] Rest finished\n')
  assert.equal(await result, 'sent')
})

test('subprocess Muted output does not count as delivery', async () => {
  assert.equal(await sendGymRestAlert('/fake', 'id', undefined, async () => 'Muted: [gym-rest] policy'), 'muted')
  await assert.rejects(sendGymRestAlert('/fake', 'id', undefined, async () => ''), /acknowledge/)
  await assert.rejects(sendGymRestAlert('/fake', 'id', undefined, async () => { throw new Error('exit 1') }), /exit 1/)
})

test('deep links accept configured HTTPS origins and target the gym hash route', () => {
  assert.equal(gymRestUrl('https://example.test:8445'), 'https://example.test:8445/#/gym')
  for (const raw of [undefined, '', 'http://example.test', 'invalid', 'https://user:password@example.test']) {
    assert.equal(gymRestUrl(raw), undefined)
  }
})

test('overlapping rest deliveries serialize durable receipt changes', async () => {
  const h = harness()
  let release!: () => void
  h.sendBarrier = new Promise<void>((resolve) => { release = resolve })
  await h.service.restore()
  const first = h.fireNext()
  for (let tick = 0; tick < 8; tick++) await Promise.resolve()
  assert.equal(h.sent.length, 1)
  h.commit({ ...resting, restTimerEnd: 2000 })
  const second = h.fireNext()
  for (let tick = 0; tick < 8; tick++) await Promise.resolve()
  assert.equal(h.sent.length, 1, 'The next alert waits for the previous receipt to persist')
  release()
  await Promise.all([first, second])
  assert.equal(h.sent.length, 2)
  assert.equal(Object.keys(h.receipts).length, 2)
  assert.ok(h.sent.every((id) => h.receipts[id].sentAt !== undefined))
})

test('a stale callback does not lose the current timer cancellation handle', async () => {
  const h = harness()
  await h.service.restore()
  const stale = [...h.jobs.values()][0].fire
  h.commit({ ...resting, restTimerEnd: 2000 })
  await stale()
  h.commit(null)
  assert.equal(h.jobs.size, 0)
  assert.equal(h.sent.length, 0)
})

test('an accepted alert retries a failed sent receipt write without sending again', async () => {
  const h = harness()
  h.failSentReceiptWrites = 1
  await h.service.restore()
  await h.fireNext()
  assert.equal(h.sent.length, 1)
  assert.equal(h.receipts[h.sent[0]].sentAt, undefined)
  assert.equal(h.jobs.size, 1, 'The accepted alert schedules receipt-only recovery')
  await h.fireNext()
  assert.equal(h.sent.length, 1)
  assert.equal(h.receipts[h.sent[0]].sentAt, 1000)
  assert.equal(h.sentReceiptWrites, 2)
  const restarted = harness(h.receipts)
  await restarted.service.restore()
  await restarted.fireNext()
  assert.deepEqual(restarted.sent, [])
})

test('sent receipt recovery stops after three persistence attempts', async () => {
  const h = harness()
  h.failSentReceiptWrites = 3
  await h.service.restore()
  await h.fireNext()
  await h.fireNext()
  await h.fireNext()
  assert.equal(h.sent.length, 1)
  assert.equal(h.sentReceiptWrites, 3)
  assert.equal(h.jobs.size, 0)
  assert.match(h.errors.join('\n'), /receipt.*storage unavailable/i)
})

test('finishing allows sent receipt recovery while stopping cancels it', async () => {
  const h = harness()
  h.failSentReceiptWrites = 1
  await h.service.restore()
  await h.fireNext()
  h.commit(null)
  assert.equal(h.jobs.size, 1)
  const queuedRetry = [...h.jobs.values()][0].fire
  h.service.stop()
  assert.equal(h.jobs.size, 0)
  await queuedRetry()
  assert.equal(h.sentReceiptWrites, 1)
  assert.equal(h.sent.length, 1)
})

test('sent receipt recovery merges markers from a newer rest period', async () => {
  const h = harness()
  h.failSentReceiptWrites = 1
  await h.service.restore()
  await h.fireNext()
  const retryEntry = [...h.jobs.entries()][0]
  assert.ok(retryEntry, 'A failed sent receipt schedules persistence recovery')
  const [retryKey, retry] = retryEntry
  h.jobs.delete(retryKey)
  h.commit({ ...resting, restTimerEnd: 2000 })
  await h.fireNext()
  await retry.fire()
  assert.equal(h.sent.length, 2)
  assert.equal(Object.keys(h.receipts).length, 2)
  assert.ok(h.sent.every((id) => h.receipts[id].sentAt !== undefined))
})
