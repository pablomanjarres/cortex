import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkHoursService } from '../electron/work-hours-service.ts'
import { type WorkHoursState } from '../electron/work-hours-model.ts'

function activeService() {
  let stored: WorkHoursState = {
    projects: [{ id: 'construcredit', name: 'ConstruCredit', currency: 'COP', ratePerHour: null }],
    active: { id: 'hook-one', projectId: 'construcredit', startedAt: '2026-09-29T10:00:00.000Z', interrupted: false },
    sessions: [],
    reports: [],
  }
  const service = new WorkHoursService({
    read: async () => structuredClone(stored),
    write: async (next) => { stored = structuredClone(next) },
  })
  return { service, read: () => stored }
}

test('owned stop records only its matching active interval and is idempotent', async () => {
  const { service, read } = activeService()
  await service.command({ type: 'stop-owned', id: 'hook-one' }, '2026-09-29T10:12:34.567Z')
  const stopped = structuredClone(read())
  assert.equal(stopped.active, null)
  assert.equal(stopped.sessions.length, 1)
  assert.equal(stopped.sessions[0].id, 'hook-one')
  assert.equal(stopped.sessions[0].durationMs, 754_567)
  assert.equal(stopped.sessions[0].endedAt, '2026-09-29T10:12:34.567Z')

  await service.command({ type: 'stop-owned', id: 'hook-one' }, '2026-09-29T10:20:00.000Z')
  assert.deepEqual(read(), stopped)
})

test('owned stop leaves a different active interval unchanged', async () => {
  const { service, read } = activeService()
  const before = structuredClone(read())
  await service.command({ type: 'stop-owned', id: 'hook-two' }, '2026-09-29T10:20:00.000Z')
  assert.deepEqual(read(), before)
})

test('owned stop checks the latest serialized state after a manual timer restart', async () => {
  const { service, read } = activeService()
  await Promise.all([
    service.command({ type: 'stop' }, '2026-09-29T10:10:00.000Z'),
    service.command({ type: 'start', id: 'manual', projectId: 'construcredit' }, '2026-09-29T10:11:00.000Z'),
    service.command({ type: 'stop-owned', id: 'hook-one' }, '2026-09-29T10:12:00.000Z'),
  ])
  assert.equal(read().active?.id, 'manual')
  assert.deepEqual(read().sessions.map(({ id, durationMs }) => ({ id, durationMs })), [
    { id: 'hook-one', durationMs: 600_000 },
  ])
})

test('owned stop rejects a missing or malformed owner ID without changing the ledger', async () => {
  const { service, read } = activeService()
  const before = structuredClone(read())
  for (const id of [undefined, '', 'has spaces']) {
    await assert.rejects(
      service.command({ type: 'stop-owned', id: id as string }, '2026-09-29T10:20:00.000Z'),
      /Invalid ID/,
    )
  }
  assert.deepEqual(read(), before)
})
