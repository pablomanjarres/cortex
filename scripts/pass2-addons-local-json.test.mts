import test from 'node:test'
import assert from 'node:assert/strict'
import { readLocalJson } from '../src/features/system/api-base.ts'

const isNamed = (value: unknown): value is { name: string } =>
  typeof value === 'object' && value !== null && typeof (value as { name?: unknown }).name === 'string'

const realFetch = globalThis.fetch
let lastInit: RequestInit | undefined
let lastUrl = ''
function stubFetch(respond: (signal: AbortSignal) => Promise<Response>) {
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    lastUrl = url
    lastInit = init
    return respond(init!.signal!)
  }) as typeof fetch
}
const never = (signal: AbortSignal) => new Promise<Response>((_, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason), { once: true })
})
test.afterEach(() => { globalThis.fetch = realFetch })

test('a body that passes the guard is returned from an uncached read', async () => {
  stubFetch(async () => Response.json({ name: 'ok' }))
  assert.deepEqual(await readLocalJson('/api/thing', isNamed, 1000), { name: 'ok' })
  assert.equal(lastUrl, '/api/thing')
  assert.equal(lastInit?.cache, 'no-store')
})

test('error statuses, wrong shapes, null bodies and unparsable bodies read as null', async () => {
  for (const response of [
    () => new Response('{}', { status: 503 }),
    () => Response.json({ name: 7 }),
    () => Response.json(null),
    () => new Response('not json'),
  ]) {
    stubFetch(async () => response())
    assert.equal(await readLocalJson('/api/thing', isNamed, 1000), null)
  }
})

test('a hung read times out to null instead of throwing', async () => {
  stubFetch(never)
  assert.equal(await readLocalJson('/api/thing', isNamed, 20, new AbortController().signal), null)
  assert.equal(await readLocalJson('/api/thing', isNamed, 20), null)
})

test('a caller abort is rethrown so the caller can tell it apart from unreachable', async () => {
  stubFetch(never)
  const controller = new AbortController()
  const read = readLocalJson('/api/thing', isNamed, 10_000, controller.signal)
  controller.abort()
  await assert.rejects(read)
})
