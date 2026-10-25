import test from 'node:test'
import assert from 'node:assert/strict'
import { ScreenBlackoutService, parseBlackoutCommand } from '../electron/screen-blackout-service.ts'
import { blackoutOriginAllowed, isBlackoutState } from '../electron/screen-blackout-contract.ts'

test('screen controls refuse unrelated browser origins including lookalike hosts', () => {
  assert.equal(blackoutOriginAllowed('https://100.attacker.example', '127.0.0.1:3456', true), false)
  assert.equal(blackoutOriginAllowed('https://attacker.example', '127.0.0.1:3456', true), false)
  assert.equal(blackoutOriginAllowed('null', '127.0.0.1:3456', true), true)
  assert.equal(blackoutOriginAllowed('null', '100.64.1.2:3456', false), false)
  assert.equal(blackoutOriginAllowed('http://localhost:5173', '127.0.0.1:3456', true), true)
  assert.equal(blackoutOriginAllowed('https://cortex.example', 'cortex.example', false), true)
})

test('native snapshots require a boolean known state or an explicitly unavailable host', () => {
  assert.equal(isBlackoutState({ host: 'mac', label: 'Mac', enabled: 'true', available: true }), false)
  assert.equal(isBlackoutState({ host: 'mac', label: 'Mac', enabled: null, available: true }), false)
  assert.equal(isBlackoutState({ host: 'mac', label: 'Mac', enabled: null, available: false, error: 'Offline' }), true)
})

test('commands reject unknown hosts and non-boolean target states', () => {
  for (const input of [{ host: 'other', enabled: true }, { host: 'mac', enabled: 'false' }, null, {}]) {
    assert.throws(() => parseBlackoutCommand(input), /host|enabled|command/i)
  }
  assert.deepEqual(parseBlackoutCommand({ host: 'laptop-w', enabled: false }), { host: 'laptop-w', enabled: false })
})

test('an unreachable laptop does not hide the live Mac state', async () => {
  const service = new ScreenBlackoutService({
    read: async host => { if (host === 'laptop-w') throw new Error('SSH unavailable'); return false },
    set: async () => true,
  })
  const { hosts } = await service.read()
  assert.deepEqual(hosts[0], { host: 'mac', label: 'Mac', enabled: false, available: true })
  assert.equal(hosts[1].enabled, null)
  assert.equal(hosts[1].available, false)
  assert.match(hosts[1].error!, /SSH unavailable/)
})

test('a write returns native state only after it matches the requested state', async () => {
  let enabled = false
  const service = new ScreenBlackoutService({ read: async () => enabled, set: async (_host, next) => { enabled = next; return enabled } })
  assert.equal((await service.set({ host: 'mac', enabled: true })).enabled, true)
  assert.equal((await service.set({ host: 'mac', enabled: false })).enabled, false)
})

test('a native mismatch is a failure rather than a successful switch', async () => {
  const service = new ScreenBlackoutService({ read: async () => false, set: async () => false })
  await assert.rejects(service.set({ host: 'mac', enabled: true }), /verify|match/i)
})

test('concurrent writes to one host are rejected and another host remains usable', async () => {
  let release!: (value: boolean) => void
  const service = new ScreenBlackoutService({ read: async () => false, set: async host => host === 'mac' ? new Promise<boolean>(resolve => { release = resolve }) : true })
  const first = service.set({ host: 'mac', enabled: true })
  await assert.rejects(service.set({ host: 'mac', enabled: false }), /progress|busy/i)
  assert.equal((await service.set({ host: 'laptop-w', enabled: true })).enabled, true)
  release(true)
  await first
})

test('failed writes release the host without replaying an uncertain command', async () => {
  let calls = 0
  const service = new ScreenBlackoutService({ read: async () => false, set: async () => { calls++; throw new Error('Timed out; read current state') } })
  await assert.rejects(service.set({ host: 'mac', enabled: true }), /Timed out/)
  assert.equal(calls, 1)
  assert.equal((await service.read()).hosts[0].enabled, false)
  await assert.rejects(service.set({ host: 'mac', enabled: false }), /Timed out/)
  assert.equal(calls, 2)
})

test('a read after a confirmed write does not join a snapshot from before that write', async () => {
  let release!: (value: boolean) => void
  let reads = 0
  let enabled = false
  const service = new ScreenBlackoutService({
    read: async host => host === 'mac' && ++reads === 1 ? new Promise<boolean>(resolve => { release = resolve }) : enabled,
    set: async (_host, next) => { enabled = next; return next },
  })
  const old = service.read()
  await service.set({ host: 'mac', enabled: true })
  const fresh = service.read()
  release(false)
  assert.equal((await fresh).hosts[0].enabled, true)
  assert.equal((await old).hosts[0].enabled, false)
})
