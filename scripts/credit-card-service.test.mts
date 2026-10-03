import assert from 'node:assert/strict'
import test from 'node:test'
import { CreditCardService } from '../electron/credit-card-service.ts'
import { emptyCreditCardState, type CreditCardState } from '../electron/credit-card-model.ts'

const setup = { type: 'initialize' as const, requestId: 'setup', purchases: [],
  card: { id: 'card', name: 'Card', limit: 1000000, closingDay: 4, dueDay: 24 } }

test('concurrent commands serialize the complete read, transition, and persisted write', async () => {
  let stored = emptyCreditCardState()
  const order: string[] = []
  const service = new CreditCardService({
    read: async () => { order.push('read'); return structuredClone(stored) },
    write: async state => { await Promise.resolve(); stored = structuredClone(state); order.push('write') },
  }, () => { order.push('committed') })
  await service.command(setup)
  order.length = 0
  await Promise.all([
    service.command({ type: 'reserve.set', requestId: 'one', cycleId: '2026-11', amount: 100 }),
    service.command({ type: 'reserve.set', requestId: 'two', cycleId: '2026-12', amount: 200 }),
  ])
  assert.deepEqual(stored.reserves, { '2026-11': 100, '2026-12': 200 })
  assert.deepEqual(order, ['read', 'write', 'committed', 'read', 'write', 'committed'])
})

test('failed persistence never announces a transition and the queue recovers', async () => {
  let stored = emptyCreditCardState()
  let fail = true
  const announced: CreditCardState[] = []
  const service = new CreditCardService({
    read: async () => structuredClone(stored),
    write: async state => { if (fail) throw new Error('disk unavailable'); stored = structuredClone(state) },
  }, state => announced.push(state))
  await assert.rejects(service.command(setup), /disk unavailable/)
  assert.equal(announced.length, 0)
  assert.equal(stored.card, null)
  fail = false
  await service.command(setup)
  assert.equal(announced.length, 1)
  assert.equal(stored.card?.id, 'card')
})

test('load is serialized and duplicate commands do not write or announce again', async () => {
  let stored: CreditCardState | null = null
  let writes = 0
  let announcements = 0
  const service = new CreditCardService({ read: async () => stored,
    write: async state => { writes++; stored = state } }, () => { announcements++ })
  assert.deepEqual(await service.load(), emptyCreditCardState())
  assert.equal(announcements, 0)
  await Promise.all([service.command(setup), service.load()])
  await service.command(setup)
  assert.equal(writes, 1)
  assert.equal(announcements, 1)
})
