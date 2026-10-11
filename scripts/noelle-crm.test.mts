import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'
import { once } from 'node:events'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import {
  NoelleCrmService,
  NoelleCrmValidationError,
  mergeNoelleCrmSnapshot,
  parseNoelleCrmSnapshot,
  isLoopbackAddress,
  type NoelleCrmSnapshot,
} from '../electron/noelle-crm.ts'

const observedAt = '2026-10-11T14:30:00.000Z'

function snapshot(): NoelleCrmSnapshot {
  return {
    schemaVersion: 1,
    source: 'noelle',
    syncedAt: observedAt,
    contacts: [{
      id: 'contact-1', name: 'Test contact', platform: 'x', handle: 'test-contact',
      profileUrl: 'https://x.com/test-contact',
      firstSentAt: '2026-10-10T15:00:00.000Z', lastSentAt: '2026-10-10T15:00:00.000Z',
      conversations: [{
        id: 'thread-1', url: 'https://x.com/messages/1', lastObservedAt: observedAt,
        syncStatus: 'ok', messages: [{
          id: 'message-1', direction: 'outbound', body: 'Hello from the test fixture.',
          sentAt: '2026-10-10T15:00:00.000Z', observedAt, deliveryStatus: 'sent',
        }],
      }],
    }],
    status: { lastAttemptAt: observedAt, lastSuccessfulSyncAt: observedAt },
  }
}

test('a verified sent contact is accepted without altering its message text', () => {
  const input = snapshot()
  input.contacts[0].conversations[0].messages[0].body = '  spacing\nand intentional typoos  '
  const result = parseNoelleCrmSnapshot(input)
  assert.equal(result.contacts[0].conversations[0].messages[0].body, '  spacing\nand intentional typoos  ')
  assert.notEqual(result.contacts, input.contacts)
})

test('contacts without a confirmed send timestamp cannot enter Cortex', () => {
  const input = snapshot()
  input.contacts[0].firstSentAt = ''
  assert.throws(() => parseNoelleCrmSnapshot(input), /firstSentAt/)
  const inconsistent = snapshot()
  inconsistent.contacts[0].lastSentAt = '2026-10-09T15:00:00Z'
  assert.throws(() => parseNoelleCrmSnapshot(inconsistent), /lastSentAt/)
})

test('unsafe links, invalid directions, and excessive message text are rejected', () => {
  const unsafe = snapshot()
  unsafe.contacts[0].profileUrl = 'javascript:alert(1)'
  assert.throws(() => parseNoelleCrmSnapshot(unsafe), /profileUrl/)
  const wrongPlatform = snapshot()
  wrongPlatform.contacts[0].platform = 'linkedin'
  wrongPlatform.contacts[0].conversations[0].url = 'https://www.linkedin.com/messaging/thread/1'
  assert.throws(() => parseNoelleCrmSnapshot(wrongPlatform), /profileUrl/)
  const badDirection = snapshot()
  ;(badDirection.contacts[0].conversations[0].messages[0] as { direction: string }).direction = 'unknown'
  assert.throws(() => parseNoelleCrmSnapshot(badDirection), /direction/)
  const huge = snapshot()
  huge.contacts[0].conversations[0].messages[0].body = 'x'.repeat(100_001)
  assert.throws(() => parseNoelleCrmSnapshot(huge), /body/)
})

test('reimporting a snapshot is idempotent and inbound messages join the saved history', () => {
  const prior = snapshot()
  const next = snapshot()
  next.syncedAt = '2026-10-11T15:00:00.000Z'
  next.status.lastAttemptAt = next.syncedAt
  next.contacts[0].conversations[0].messages = [{
    id: 'message-2', externalId: 'external-2', direction: 'inbound', body: 'A fixture reply.',
    sentAt: '2026-10-11T14:45:00.000Z', observedAt: next.syncedAt,
  }]
  const merged = mergeNoelleCrmSnapshot(prior, next)
  assert.deepEqual(merged.contacts[0].conversations[0].messages.map((message) => message.id), ['message-1', 'message-2'])
  assert.deepEqual(mergeNoelleCrmSnapshot(merged, next), merged)
  assert.equal(prior.contacts[0].conversations[0].messages.length, 1)
})

test('failed or partial syncs preserve prior contacts, conversations, and messages', () => {
  const prior = snapshot()
  const failed = snapshot()
  failed.syncedAt = '2026-10-11T15:00:00.000Z'
  failed.status = { lastAttemptAt: failed.syncedAt, error: 'Source unavailable' }
  failed.contacts = []
  const merged = mergeNoelleCrmSnapshot(prior, failed)
  assert.equal(merged.contacts.length, 1)
  assert.equal(merged.contacts[0].conversations[0].messages.length, 1)
  assert.equal(merged.status.lastSuccessfulSyncAt, observedAt)
  assert.equal(merged.status.error, 'Source unavailable')
})

test('a stale snapshot cannot roll back conversation sync state or lose a reply', () => {
  const fresh = snapshot()
  fresh.syncedAt = '2026-10-11T16:00:00.000Z'
  fresh.status.lastAttemptAt = fresh.syncedAt
  fresh.contacts[0].conversations[0].lastObservedAt = fresh.syncedAt
  fresh.contacts[0].conversations[0].messages.push({
    id: 'message-2', direction: 'inbound', body: 'Newest fixture reply.',
    sentAt: fresh.syncedAt, observedAt: fresh.syncedAt,
  })
  const stale = snapshot()
  stale.contacts[0].conversations[0].syncStatus = 'error'
  stale.contacts[0].conversations[0].syncError = 'Older error'
  const merged = mergeNoelleCrmSnapshot(fresh, stale)
  assert.equal(merged.syncedAt, fresh.syncedAt)
  assert.equal(merged.contacts[0].conversations[0].syncStatus, 'ok')
  assert.equal(merged.contacts[0].conversations[0].messages.length, 2)
})

test('concurrent imports serialize the merge and both replies reach storage', async () => {
  let saved = snapshot()
  const service = new NoelleCrmService({
    read: async () => structuredClone(saved),
    write: async (next) => { await new Promise((resolve) => setTimeout(resolve, 5)); saved = structuredClone(next) },
  })
  const one = snapshot()
  const two = snapshot()
  one.contacts[0].conversations[0].messages = [{ id: 'reply-1', direction: 'inbound', body: 'First reply.', sentAt: null, observedAt }]
  two.contacts[0].conversations[0].messages = [{ id: 'reply-2', direction: 'inbound', body: 'Second reply.', sentAt: null, observedAt }]
  const results = await Promise.all([service.import(one), service.import(two)])
  assert.deepEqual(saved.contacts[0].conversations[0].messages.map((message) => message.id), ['message-1', 'reply-1', 'reply-2'])
  assert.equal(results[1].messages, 3)
})

test('a failed durable write rejects the import and a later import can recover', async () => {
  let saved: NoelleCrmSnapshot | null = null
  let fail = true
  const service = new NoelleCrmService({
    read: async () => saved,
    write: async (next) => { if (fail) throw new Error('Disk unavailable'); saved = next },
  })
  await assert.rejects(service.import(snapshot()), /Disk unavailable/)
  assert.equal(saved, null)
  fail = false
  assert.deepEqual(await service.import(snapshot()), { ok: true, contacts: 1, conversations: 1, messages: 1, syncedAt: observedAt })
})

test('only IPv4 and IPv6 loopback addresses may import conversation history', () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(isLoopbackAddress(address), true)
  for (const address of ['100.70.1.2', '192.168.1.2', '8.8.8.8', '127.0.0.1.evil', '']) assert.equal(isLoopbackAddress(address), false)
})

test('partial history metadata survives imports and later snapshots without history metadata', () => {
  const input = snapshot()
  input.contacts[0].conversations[0].history = { complete: false, cursor: 'older-page', reason: 'Older messages remain' }
  const parsed = parseNoelleCrmSnapshot(input)
  assert.deepEqual(parsed.contacts[0].conversations[0].history, { complete: false, cursor: 'older-page', reason: 'Older messages remain' })
  const merged = mergeNoelleCrmSnapshot(parsed, snapshot())
  assert.equal(merged.contacts[0].conversations[0].history?.complete, false)
})

test('source external IDs reconcile observations whose local message ID changed', () => {
  const original = snapshot()
  original.contacts[0].conversations[0].messages[0].externalId = 'platform-message-1'
  const incoming = snapshot()
  incoming.contacts[0].conversations[0].messages[0].externalId = 'platform-message-1'
  incoming.contacts[0].conversations[0].messages[0].id = 'second-observation-id'
  const merged = mergeNoelleCrmSnapshot(original, incoming)
  assert.equal(merged.contacts[0].conversations[0].messages.length, 1)
  assert.equal(merged.contacts[0].conversations[0].messages[0].id, 'message-1')
})

test('confirmed sends can import before a conversation URL is discovered', () => {
  const input = snapshot()
  ;(input.contacts[0].conversations[0] as { url: string | null }).url = null
  assert.equal(parseNoelleCrmSnapshot(input).contacts[0].conversations[0].url, '')
})

test('captured message text up to the shared 100000-character limit imports without truncation', () => {
  const input = snapshot()
  input.contacts[0].conversations[0].messages[0].body = 'x'.repeat(100_000)
  assert.equal(parseNoelleCrmSnapshot(input).contacts[0].conversations[0].messages[0].body.length, 100_000)
})

test('a newer complete successful snapshot removes recipients whose sent receipts were revoked', () => {
  const prior = snapshot()
  const revoked = snapshot()
  revoked.syncedAt = '2026-10-11T16:00:00.000Z'
  revoked.status = { lastAttemptAt: revoked.syncedAt, lastSuccessfulSyncAt: revoked.syncedAt }
  revoked.pagination = { hasMore: false, nextCursor: null }
  revoked.contacts = []
  const parsed = parseNoelleCrmSnapshot(revoked)
  assert.deepEqual(parsed.pagination, { hasMore: false, nextCursor: null })
  assert.equal(mergeNoelleCrmSnapshot(prior, parsed).contacts.length, 0)
})

test('complete exports retain earlier messages for recipients who are still eligible', () => {
  const prior = snapshot()
  const next = snapshot()
  next.syncedAt = '2026-10-11T16:00:00.000Z'
  next.status.lastSuccessfulSyncAt = next.syncedAt
  next.pagination = { hasMore: false, nextCursor: null }
  next.contacts[0].conversations[0].messages = [{
    id: 'latest-reply', direction: 'inbound', body: 'New fixture reply.', sentAt: null, observedAt: next.syncedAt,
  }]
  assert.deepEqual(mergeNoelleCrmSnapshot(prior, next).contacts[0].conversations[0].messages.map((message) => message.id), ['message-1', 'latest-reply'])
})

test('failed, partial, stale, and same-time exports cannot remove missing recipients', () => {
  const prior = snapshot()
  for (const kind of ['failed', 'partial', 'stale', 'same-time']) {
    const next = snapshot()
    next.contacts = []
    next.syncedAt = kind === 'stale' ? '2026-10-11T13:00:00.000Z' : kind === 'same-time' ? observedAt : '2026-10-11T16:00:00.000Z'
    next.status = { lastAttemptAt: next.syncedAt, lastSuccessfulSyncAt: next.syncedAt, ...(kind === 'failed' ? { error: 'Export unavailable' } : {}) }
    next.pagination = { hasMore: kind === 'partial', nextCursor: kind === 'partial' ? 'next-contact' : null }
    assert.equal(mergeNoelleCrmSnapshot(prior, parseNoelleCrmSnapshot(next)).contacts.length, 1, kind)
  }
})

async function importApi(remoteAddress?: string) {
  const source = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true)
  const functions = ['readBody', 'isTailscaleOrLocal', 'startWebServer'].map((name) => {
    const declaration = tree.statements.find((statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name)
    assert.ok(declaration)
    return declaration.getText(tree)
  }).join('\n')
  let saved: NoelleCrmSnapshot | null = null
  const service = new NoelleCrmService({ read: async () => saved, write: async (next) => { saved = next } })
  const context = vm.createContext({
    http: {
      createServer: (handler: http.RequestListener) => http.createServer((req, res) => {
        if (remoteAddress) Object.defineProperty(req.socket, 'remoteAddress', { value: remoteAddress })
        handler(req, res)
      }),
    },
    path, URL, Buffer, console,
    __dirname: '/isolated-api-test', WEB_PORT: 0, MAX_BODY_BYTES: 25 * 1024 * 1024,
    isLoopbackAddress, NoelleCrmValidationError, noelleCrmService: service,
  })
  const javascript = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  vm.runInContext(`let webServer = null; ${javascript}\nstartWebServer(); globalThis.apiServer = webServer;`, context)
  const server = context.apiServer as http.Server
  await once(server, 'listening')
  const port = (server.address() as { port: number }).port
  return {
    saved: () => saved,
    url: `http://127.0.0.1:${port}/api/noelle-crm/import`,
    close: () => new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections() }),
  }
}

test('the HTTP import persists history and returns counts without exposing message bodies', async (t) => {
  const api = await importApi()
  t.after(() => api.close())
  const response = await fetch(api.url, { method: 'POST', body: JSON.stringify(snapshot()), headers: { 'Content-Type': 'application/json' } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, contacts: 1, conversations: 1, messages: 1, syncedAt: observedAt })
  assert.equal(api.saved()?.contacts[0].conversations[0].messages[0].body, 'Hello from the test fixture.')
})

test('the HTTP import rejects malformed JSON and unverified contacts without writing', async (t) => {
  const api = await importApi()
  t.after(() => api.close())
  assert.equal((await fetch(api.url, { method: 'POST', body: '{' })).status, 400)
  const unverified = snapshot()
  unverified.contacts[0].firstSentAt = ''
  assert.equal((await fetch(api.url, { method: 'POST', body: JSON.stringify(unverified) })).status, 400)
  assert.equal(api.saved(), null)
})

test('the HTTP import refuses Tailscale access even though other Cortex routes accept it', async (t) => {
  const api = await importApi('100.70.1.2')
  t.after(() => api.close())
  const response = await fetch(api.url, { method: 'POST', body: JSON.stringify(snapshot()) })
  assert.equal(response.status, 403)
  assert.equal(api.saved(), null)
})
