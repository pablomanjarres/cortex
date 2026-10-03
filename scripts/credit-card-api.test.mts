import assert from 'node:assert/strict'
import test from 'node:test'
import { createCreditCardAPI, handleCreditCardRequest } from '../electron/credit-card-api.ts'
import { emptyCreditCardAlertState } from '../electron/credit-card-alerts-types.ts'
import type { CreditCardState } from '../electron/credit-card-types.ts'

function fixture() {
  const calls: string[] = []
  const status = { lastCheckedAt: null, outcomes: [], channels: { native: { ready: true }, phone: { ready: false } } }
  const api = createCreditCardAPI({
    command: async () => { calls.push('command'); return {} as CreditCardState },
    alerts: {
      status: async () => status,
      test: async (channel) => { calls.push(channel); return { channel, id: 'test', title: 'Test', at: 'now', status: 'Sent' } },
      retry: async () => { calls.push('retry'); return status },
    },
    getLogin: () => ({ available: true, enabled: false }),
    setLogin: (enabled) => { calls.push(String(enabled)); return { available: true, enabled } },
  })
  return { api, calls, status }
}

test('HTTP command uses the same result envelope as IPC', async () => {
  const f = fixture()
  const result = await handleCreditCardRequest(f.api, 'POST', '/api/credit-card/command', { type: 'configure', requestId: 'request' })
  assert.equal(result?.status, 200)
  assert.deepEqual(f.calls, ['command'])
  assert.deepEqual(result?.body, { ok: true, state: {} })
})

test('invalid notification channel and login value cannot cause side effects', async () => {
  const f = fixture()
  assert.equal((await handleCreditCardRequest(f.api, 'POST', '/api/credit-card/test', { channel: 'email' }))?.status, 400)
  assert.equal((await handleCreditCardRequest(f.api, 'POST', '/api/credit-card/login', { enabled: 'false' }))?.status, 400)
  assert.deepEqual(f.calls, [])
})

test('read routes expose status without starting delivery and mutations reject GET', async () => {
  const f = fixture()
  assert.deepEqual((await handleCreditCardRequest(f.api, 'GET', '/api/credit-card/alerts'))?.body, f.status)
  assert.equal((await handleCreditCardRequest(f.api, 'GET', '/api/credit-card/test'))?.status, 405)
  assert.equal(await handleCreditCardRequest(f.api, 'GET', '/api/other'), null)
  assert.deepEqual(f.calls, [])
  assert.equal(emptyCreditCardAlertState().version, 1)
})
