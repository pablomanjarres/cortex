import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const origin = 'https://cortex.example'
const source = readFileSync(process.env.SERVICE_WORKER_TEST_SOURCE || new URL('../public/sw.js', import.meta.url), 'utf8')
const oldShell = '<html><script src="/assets/removed.js"></script></html>'
const freshShell = '<html><script src="/assets/current.js"></script></html>'

function response(body: string, type = 'text/html', status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': type } })
}

function request(path: string, destination: 'document' | 'script' | 'style') {
  const result = new Request(`${origin}${path}`)
  Object.defineProperties(result, {
    mode: { value: destination === 'document' ? 'navigate' : 'cors' },
    destination: { value: destination },
  })
  return result
}

function harness(network: () => Promise<Response>) {
  const saved = new Map<string, Response>()
  const listeners = new Map<string, (event: unknown) => void>()
  const lifetimes: Promise<unknown>[] = []
  const key = (input: Request | string) => new URL(typeof input === 'string' ? input : input.url, `${origin}/`).href
  const cache = {
    match: async (input: Request | string) => saved.get(key(input))?.clone(),
    put: async (input: Request | string, value: Response) => { saved.set(key(input), value.clone()) },
    addAll: async () => {},
  }
  vm.runInNewContext(source, {
    URL, Request, Response,
    self: {
      location: new URL(`${origin}/`),
      addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: { open: async () => cache, match: cache.match, keys: async () => [], delete: async () => true },
    fetch: () => {
      const pending = Promise.resolve().then(network)
      const nativeThen = pending.then.bind(pending)
      // Observe ignored refresh rejections locally; waitUntil completion is checked below.
      pending.then = ((...callbacks: Parameters<typeof pending.then>) => {
        const refresh = nativeThen(...callbacks)
        void refresh.catch(() => {})
        return refresh
      }) as typeof pending.then
      void pending.catch(() => {})
      return pending
    },
  })
  return {
    lifetimes,
    seed(path: string, value: Response) { saved.set(key(path), value.clone()) },
    cached: cache.match,
    async dispatch(input: Request) {
      let reply: Promise<Response | undefined> | undefined
      listeners.get('fetch')!({
        request: input,
        respondWith: (value: Response | Promise<Response | undefined>) => { reply = Promise.resolve(value) },
        waitUntil: (value: Promise<unknown>) => {
          const lifetime = Promise.resolve(value)
          void lifetime.catch(() => {})
          lifetimes.push(lifetime)
        },
      })
      assert.ok(reply, 'The fetch event supplies a response')
      return reply
    },
    async settle() {
      await new Promise<void>((resolve) => setImmediate(resolve))
      return Promise.allSettled(lifetimes)
    },
  }
}

test('navigation returns and saves fresh network HTML ahead of the old cached shell', async () => {
  const h = harness(async () => response(freshShell))
  h.seed('/', response(oldShell))
  assert.equal(await (await h.dispatch(request('/', 'document')))!.text(), freshShell)
  await h.settle()
  assert.equal(await (await h.cached('/'))!.text(), freshShell)
})

for (const failure of ['offline', 'HTTP 503']) {
  test(`navigation restores the saved shell after ${failure}`, async () => {
    const h = harness(async () => {
      if (failure === 'offline') throw new Error('Network unavailable')
      return response('Temporary failure', 'text/html', 503)
    })
    h.seed('/', response(oldShell))
    assert.equal(await (await h.dispatch(request('/', 'document')))!.text(), oldShell)
    await h.settle()
    assert.equal(await (await h.cached('/'))!.text(), oldShell)
  })
}

test('an HTML fallback response for a JavaScript asset never enters the cache', async () => {
  const h = harness(async () => response(freshShell))
  await h.dispatch(request('/assets/removed.js', 'script'))
  await h.settle()
  assert.equal(await h.cached('/assets/removed.js'), undefined)
})

test('a failed background asset refresh completes quietly and keeps the saved asset', async () => {
  let resolveNetwork!: (value: Response) => void
  let rejectNetwork!: (error: Error) => void
  const h = harness(() => new Promise<Response>((resolve, reject) => { resolveNetwork = resolve; rejectNetwork = reject }))
  h.seed('/assets/current.js', response('cached code', 'application/javascript'))
  assert.equal(await (await h.dispatch(request('/assets/current.js', 'script')))!.text(), 'cached code')
  if (!h.lifetimes.length) {
    resolveNetwork(response('Unavailable', 'text/plain', 503))
    assert.fail('The worker must keep the background refresh alive with waitUntil')
  }
  rejectNetwork(new Error('Network unavailable'))
  const outcomes = await h.settle()
  assert.ok(outcomes.every((result) => result.status === 'fulfilled'))
  assert.equal(await (await h.cached('/assets/current.js'))!.text(), 'cached code')
})

for (const [path, destination, type] of [
  ['/assets/current.js', 'script', 'application/javascript'],
  ['/assets/current.css', 'style', 'text/css'],
] as const) {
  test(`a successful ${destination} response remains cacheable`, async () => {
    const h = harness(async () => response('fresh asset', type))
    assert.equal(await (await h.dispatch(request(path, destination)))!.text(), 'fresh asset')
    await h.settle()
    assert.equal(await (await h.cached(path))!.text(), 'fresh asset')
  })
}
