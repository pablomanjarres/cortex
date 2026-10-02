import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkHoursService } from '../electron/work-hours-service.ts'
import { type WorkHoursCommand, type WorkHoursState } from '../electron/work-hours-model.ts'

function ledger() {
  let state: WorkHoursState = {
    projects: [{ id: 'p', name: 'Project', currency: 'COP', ratePerHour: null }],
    active: null, sessions: [], reports: [],
  }
  const service = new WorkHoursService({ read: async () => state, write: async (next) => { state = next } })
  const command = (value: unknown) => service.command(value as WorkHoursCommand, '2026-10-01T20:00:00Z')
  return { command, read: () => state }
}

test('recorded activity excludes queue time and recovery polling delay', async () => {
  const { command, read } = ledger()
  await command({ type: 'start-owned-at', id: 'ccw-one', projectId: 'p', startedAt: '2026-10-01T19:46:37.260Z' })
  await command({ type: 'stop-owned-at', id: 'ccw-one', endedAt: '2026-10-01T19:58:58.731Z' })
  assert.equal(read().active, null)
  assert.equal(read().sessions[0].startedAt, '2026-10-01T19:46:37.260Z')
  assert.equal(read().sessions[0].endedAt, '2026-10-01T19:58:58.731Z')
  assert.equal(read().sessions[0].durationMs, 741471)
  await command({ type: 'stop-owned-at', id: 'ccw-one', endedAt: '2026-10-01T19:58:58.731Z' })
  assert.equal(read().sessions.length, 1)
})

test('recorded cleanup cannot stop a replacement manual timer', async () => {
  const { command, read } = ledger()
  await command({ type: 'start', id: 'manual', projectId: 'p' })
  await command({ type: 'stop-owned-at', id: 'ccw-one', endedAt: '2026-10-01T19:58:58.731Z' })
  assert.equal(read().active?.id, 'manual')
  assert.equal(read().sessions.length, 0)
})

test('recorded start is idempotent after a lost response', async () => {
  const { command, read } = ledger()
  const start = { type: 'start-owned-at', id: 'ccw-one', projectId: 'p', startedAt: '2026-10-01T19:00:00Z' }
  await command(start)
  await command(start)
  await command({ type: 'stop-owned-at', id: 'ccw-one', endedAt: '2026-10-01T19:10:00Z' })
  await command(start)
  assert.equal(read().active, null)
  assert.equal(read().sessions.length, 1)
})

test('recorded start rejects future time, conflicting identities and saved overlaps', async () => {
  const { command, read } = ledger()
  await assert.rejects(command({ type: 'start-owned-at', id: 'ccw-future', projectId: 'p', startedAt: '2026-10-01T21:00:00Z' }), /future/)
  await command({ type: 'start-owned-at', id: 'ccw-one', projectId: 'p', startedAt: '2026-10-01T19:00:00Z' })
  await assert.rejects(command({ type: 'start-owned-at', id: 'ccw-one', projectId: 'p', startedAt: '2026-10-01T19:01:00Z' }), /conflict/)
  await command({ type: 'stop-owned-at', id: 'ccw-one', endedAt: '2026-10-01T19:10:00Z' })
  await assert.rejects(command({ type: 'start-owned-at', id: 'ccw-two', projectId: 'p', startedAt: '2026-10-01T19:05:00Z' }), /overlap/)
  assert.equal(read().sessions.length, 1)
})

test('recorded stop rejects future or reversed endpoints without changing the active work', async () => {
  const { command, read } = ledger()
  await command({ type: 'start-owned-at', id: 'ccw-one', projectId: 'p', startedAt: '2026-10-01T19:00:00Z' })
  await assert.rejects(command({ type: 'stop-owned-at', id: 'ccw-one', endedAt: '2026-10-01T21:00:00Z' }), /future/)
  await assert.rejects(command({ type: 'stop-owned-at', id: 'ccw-one', endedAt: '2026-10-01T18:00:00Z' }), /precedes/)
  assert.equal(read().active?.id, 'ccw-one')
  assert.equal(read().sessions.length, 0)
})

test('recorded completion trims an interrupted interval after app restart with an audit record', async () => {
  const { command, read } = ledger()
  await command({ type: 'start-owned-at', id: 'ccw-one', projectId: 'p', startedAt: '2026-10-01T19:00:00Z' })
  await command({ type: 'mark-interrupted' })
  assert.equal(read().sessions[0].durationMs, 3600000)
  await command({ type: 'stop-owned-at', id: 'ccw-one', endedAt: '2026-10-01T19:10:00Z' })
  const saved = read().sessions[0]
  assert.equal(saved.durationMs, 600000)
  assert.equal(saved.needsReview, false)
  assert.equal(saved.corrections[0].before.endedAt, '2026-10-01T20:00:00.000Z')
  assert.equal(saved.corrections[0].after.endedAt, '2026-10-01T19:10:00.000Z')
  await command({ type: 'stop-owned-at', id: 'ccw-one', endedAt: '2026-10-01T19:10:00Z' })
  assert.equal(read().sessions[0].corrections.length, 1)
})
