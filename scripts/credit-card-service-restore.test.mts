import assert from 'node:assert/strict'
import test from 'node:test'
import { CreditCardService } from '../electron/credit-card-service.ts'
import { applyCreditCardCommand, emptyCreditCardState } from '../electron/credit-card-model.ts'

const initial = () => applyCreditCardCommand(emptyCreditCardState(), { type: 'initialize', requestId: 'setup',
  card: { id: 'card', name: 'Card', limit: 1000, closingDay: 4, dueDay: 24 }, purchases: [] }, '2026-10-03T16:00:00Z')

test('restore holds the command queue until both managed keys commit', async () => {
  let stored = initial(), committed = 0
  let release!: () => void, started!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  const service = new CreditCardService({ read: async () => structuredClone(stored),
    write: async state => { stored = structuredClone(state) } }, () => { committed++ })
  const imported = { ...initial(), reserves: { '2090-11': 100 } }
  const restoring = service.restore(imported, async () => { started(); await gate })
  await entered
  const command = service.command({ type: 'reserve.set', requestId: 'during-restore', cycleId: '2090-12', amount: 200 })
  assert.equal(committed, 0)
  assert.deepEqual(stored.reserves, { '2090-11': 100 })
  release()
  assert.equal(await restoring, 1)
  await command
  assert.deepEqual(stored.reserves, { '2090-11': 100, '2090-12': 200 })
  assert.equal(committed, 2)
})

test('related-write failure rolls back the ledger before queued commands continue', async () => {
  let stored = initial(), committed = 0
  const service = new CreditCardService({ read: async () => structuredClone(stored),
    write: async state => { stored = structuredClone(state) } }, () => { committed++ })
  await assert.rejects(service.restore({ ...initial(), reserves: { '2090-11': 100 } },
    async () => { throw new Error('alert write failed') }), /alert write failed/)
  assert.deepEqual(stored, initial())
  assert.equal(committed, 0)
  await service.command({ type: 'reserve.set', requestId: 'after-failure', cycleId: '2090-12', amount: 200 })
  assert.deepEqual(stored.reserves, { '2090-12': 200 })
})

test('rollback failures reject explicitly rather than reporting a successful restore', async () => {
  let stored = initial(), writes = 0
  const service = new CreditCardService({ read: async () => structuredClone(stored),
    write: async state => { if (++writes > 1) throw new Error('rollback unavailable'); stored = structuredClone(state) } })
  await assert.rejects(service.restore({ ...initial(), reserves: { '2090-11': 100 } },
    async () => { throw new Error('alert write failed') }), /rollback/i)
})
