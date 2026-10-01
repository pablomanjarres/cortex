import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkHoursService } from '../electron/work-hours-service.ts'
import { emptyWorkHoursState, type WorkHoursState } from '../electron/work-hours-model.ts'

test('two concurrent starts leave one committed active interval', async () => {
  let stored: WorkHoursState = emptyWorkHoursState()
  const service = new WorkHoursService({
    read: async () => structuredClone(stored),
    write: async (next) => { stored = structuredClone(next) },
  })
  await service.command({ type: 'add-project', id: 'construcredit', name: 'ConstruCredit' }, '2026-09-27T14:00:00.000Z')

  const outcomes = await Promise.allSettled([
    service.command({ type: 'start', id: 'one', projectId: 'construcredit' }, '2026-09-27T14:01:00.000Z'),
    service.command({ type: 'start', id: 'two', projectId: 'construcredit' }, '2026-09-27T14:01:00.000Z'),
  ])

  assert.deepEqual(outcomes.map((outcome) => outcome.status), ['fulfilled', 'rejected'])
  assert.equal(stored.active?.id, 'one')
  assert.equal(stored.sessions.length, 0)
})

test('a failed disk write does not announce a started timer', async () => {
  let stored: WorkHoursState = emptyWorkHoursState()
  let announced: WorkHoursState | null = null
  let failNextWrite = false
  const service = new WorkHoursService({
    read: async () => structuredClone(stored),
    write: async (next) => {
      if (failNextWrite) throw new Error('disk unavailable')
      stored = structuredClone(next)
    },
  }, (next) => { announced = next })
  await service.command({ type: 'add-project', id: 'construcredit', name: 'ConstruCredit' }, '2026-09-27T14:00:00.000Z')
  failNextWrite = true

  await assert.rejects(
    service.command({ type: 'start', id: 'one', projectId: 'construcredit' }, '2026-09-27T14:01:00.000Z'),
    /disk unavailable/,
  )

  assert.equal(stored.active, null)
  assert.equal(announced?.active, null)
})

test('restoring an active interval flags it for review before billing', async () => {
  let stored: WorkHoursState = emptyWorkHoursState()
  const service = new WorkHoursService({
    read: async () => structuredClone(stored),
    write: async (next) => { stored = structuredClone(next) },
  })
  await service.command({ type: 'add-project', id: 'construcredit', name: 'ConstruCredit' }, '2026-09-27T14:00:00.000Z')
  await service.command({ type: 'start', id: 'one', projectId: 'construcredit' }, '2026-09-27T14:01:00.000Z')

  await new WorkHoursService({
    read: async () => structuredClone(stored),
    write: async (next) => { stored = structuredClone(next) },
  }).restore('2026-09-27T15:00:00.000Z')

  assert.equal(stored.active, null)
  assert.equal(stored.sessions[0]?.needsReview, true)
  assert.equal(stored.sessions[0]?.endedAt, '2026-09-27T15:00:00.000Z')
})
