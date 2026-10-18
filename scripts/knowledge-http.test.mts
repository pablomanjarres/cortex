import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { handleKnowledgeRequest, type KnowledgeHttpDeps } from '../electron/knowledge/http.ts'
import { KnowledgeVaultService } from '../electron/knowledge/vault.ts'
import { buildKnowledgeSummary } from '../electron/knowledge/summary.ts'
import { readKnowledgeHealth } from '../electron/knowledge/health.ts'
import { cortexRecordLocation, cortexRecordUrl, parseCortexRef, refs } from '../electron/knowledge/refs.ts'

async function server(opts: { remote?: string } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-knowledge-http-'))
  const root = path.join(dir, 'Eightfold')
  fs.mkdirSync(path.join(root, 'Ventures'), { recursive: true })
  fs.writeFileSync(path.join(root, 'Home.md'), '---\nid: home\ntype: home\n---\n\nHome\n')
  fs.writeFileSync(path.join(root, 'Ventures', 'Cortex.md'), '---\nid: venture-cortex\ncortex_refs:\n  - project:cortex\n---\n\nCortex\n')
  const healthFile = path.join(dir, 'health.json')
  const vault = new KnowledgeVaultService({ configuredRoot: root, registryPaths: [], legacyMarsRoot: path.join(dir, 'none') })
  const migrations: boolean[] = []
  const deps: KnowledgeHttpDeps = {
    vault, healthFile,
    isLoopback: remote => remote === '127.0.0.1',
    readBody: async req => { let text = ''; for await (const chunk of req) text += chunk; return text },
    origin: () => 'http://localhost:3456',
    summaryInputs: async () => ({ projectMeta: { cortex: { displayName: 'Cortex', status: 'active', priority: 1 } }, goals: [], calendar: null, finances: null, crm: null, contacts: [], noelleCrm: null, founderHistory: [], research: null }),
    migrateResearch: async dryRun => { migrations.push(dryRun); return { dryRun } },
  }
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost')
    if (!(await handleKnowledgeRequest(req, res, url, opts.remote ?? '127.0.0.1', deps))) { res.writeHead(418); res.end() }
  })
  httpServer.listen(0, '127.0.0.1')
  await once(httpServer, 'listening')
  const base = `http://127.0.0.1:${(httpServer.address() as { port: number }).port}`
  const call = async (pathname: string, body?: unknown) => {
    const response = await fetch(`${base}${pathname}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json().catch(() => null) as Record<string, any> }
  }
  return { root, healthFile, migrations, call, close: () => httpServer.close() }
}

test('knowledge routes list, search, read, link and pass through unrelated paths', async t => {
  const s = await server()
  t.after(s.close)
  assert.equal((await s.call('/api/knowledge/vaults')).body.vaults[0].name, 'Eightfold')
  assert.deepEqual((await s.call('/api/knowledge/files?extensions=md&limit=1')).body.files.map((file: { path: string }) => file.path), ['Home.md'])
  assert.equal((await s.call('/api/knowledge/search?q=cortex')).body.matches[0].path, 'Ventures/Cortex.md')
  const read = await s.call('/api/knowledge/read?id=venture-cortex')
  assert.equal(read.body.note.uri, 'obsidian://open?vault=Eightfold&file=Ventures%2FCortex')
  const link = await s.call(`/api/knowledge/links?ref=${encodeURIComponent('project:cortex')}`)
  assert.equal(link.body.uri, read.body.note.uri)
  assert.equal(link.body.cortexUrl, 'http://localhost:3456/#/projects?project=cortex')
  const missing = await s.call(`/api/knowledge/links?ref=${encodeURIComponent('crm:none')}`)
  assert.equal(missing.body.uri, 'obsidian://search?vault=Eightfold&query=crm%3Anone')
  assert.equal((await s.call('/api/knowledge/links?ref=home:eightfold')).body.notes[0].id, 'home')
  assert.equal((await s.call('/api/knowledge/links?ref=bogus')).status, 400)
  assert.equal((await s.call('/api/knowledge/read?path=../x.md')).status, 400)
  assert.equal((await s.call('/api/knowledge/nope')).status, 404)
  assert.equal((await s.call('/api/founder-research')).status, 418)
})

test('capture and update are loopback-only, revision-checked and return the new revision', async t => {
  const s = await server()
  t.after(s.close)
  const created = await s.call('/api/knowledge/capture', { title: 'Meeting', body: 'Notes', properties: { cortex_refs: ['crm:crm-1'] } })
  assert.equal(created.status, 200)
  assert.equal(created.body.path, 'Inbox/Meeting.md')
  const updated = await s.call('/api/knowledge/update', { id: created.body.id, baseRevision: created.body.revision, body: 'More notes' })
  assert.equal(updated.status, 200)
  const stale = await s.call('/api/knowledge/update', { id: created.body.id, baseRevision: created.body.revision, body: 'Stale' })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.revision, updated.body.revision)
  assert.equal((await s.call('/api/knowledge/capture', '[]')).status, 400)
  assert.equal((await s.call('/api/knowledge/migrate/research', { dryRun: true })).body.dryRun, true)
  assert.deepEqual(s.migrations, [true])

  const remote = await server({ remote: '100.64.0.9' })
  t.after(remote.close)
  assert.equal((await remote.call('/api/knowledge/vaults')).status, 200)
  for (const route of ['/api/knowledge/capture', '/api/knowledge/update', '/api/knowledge/migrate/research']) assert.equal((await remote.call(route, { title: 'x' })).status, 403)
  assert.equal(remote.migrations.length, 0)
})

test('health is read-only and reports missing, invalid and present runtime files', async t => {
  const s = await server()
  t.after(s.close)
  assert.equal((await s.call('/api/knowledge/health')).body.status, 'missing')
  fs.writeFileSync(s.healthFile, '{bad')
  assert.equal((await s.call('/api/knowledge/health')).body.status, 'invalid')
  fs.writeFileSync(s.healthFile, JSON.stringify({ ok: true, lastRefresh: '2026-10-18T12:00:00Z' }))
  const ok = await s.call('/api/knowledge/health')
  assert.equal(ok.body.status, 'ok')
  assert.deepEqual(ok.body.health, { ok: true, lastRefresh: '2026-10-18T12:00:00Z' })
  assert.equal(fs.readFileSync(s.healthFile, 'utf8'), JSON.stringify({ ok: true, lastRefresh: '2026-10-18T12:00:00Z' }))
  assert.equal(readKnowledgeHealth(path.join(s.root, 'missing.json')).status, 'missing')
})

test('summary is curated: references, aggregates and timestamps, never contact details or message bodies', async t => {
  const s = await server()
  t.after(s.close)
  const served = await s.call('/api/knowledge/summary')
  assert.equal(served.body.schemaVersion, 1)
  assert.equal(served.body.vault.homeUri, 'obsidian://open?vault=Eightfold&file=Home')
  assert.equal(served.body.projects.items[0].ref, 'project:cortex')

  const summary = buildKnowledgeSummary({
    now: new Date('2026-10-18T12:00:00Z'), origin: 'http://localhost:3456', timeZone: 'America/Bogota', vault: { name: 'Eightfold', homeUri: null },
    projectMeta: { 'Old Thing': { displayName: 'Old', status: 'archived', priority: 9 }, cortex: { displayName: 'Cortex', status: 'active', priority: 1, notes: 'private project notes' } },
    goals: [{ id: 'g1', title: 'Ship', status: 'active', milestones: [{ done: true }, { done: false }], detail: 'private why' }, { id: 'g2', title: 'Done', status: 'done' }],
    calendar: { events: [{ title: 'Later', startDate: '2026-10-20T10:00:00Z', notes: 'private' }, { title: 'Soon', startDate: '2026-10-19T10:00:00Z', isAllDay: true }], from: '2026-10-18', to: '2026-10-25' },
    finances: { year: 2026, items: [{ type: 'Income', name: 'Salary', months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1000, 0, 0] }, { type: 'Expense', months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 300, 0, 0] }, { type: 'Subscription', months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 0, 0] }] },
    crm: { orgs: [{ id: 'o', contacts: [{ id: 'c1', name: 'Jane Private', email: 'jane@example.com', status: 'active', value: 500 }, { id: 'c2', status: 'lead', value: 10 }] }] },
    contacts: [{ name: 'Friend', phone: '555' }],
    noelleCrm: { syncedAt: '2026-10-18T11:00:00Z', contacts: [{ name: 'DM Person', conversations: [{ messages: [{ direction: 'outbound', body: 'secret dm' }, { direction: 'inbound', body: 'secret reply' }] }] }] },
    founderHistory: [{ date: '2026-10-17', commits: 3, deploys: 1 }, { date: '2026-10-18', commits: 5, deploys: 2, mrr: 10, users: 4 }],
    research: { campaign: { id: 'small-software', revisions: [{ version: 2, hash: 'a'.repeat(64), publishedAt: '2026-10-01T00:00:00.000Z' }] }, events: [{ verifiedSent: true, body: 'invitation text' }, { verifiedSent: false }], findings: [{}], decisions: [], sync: { lastSuccessfulSyncAt: '2026-10-18T10:00:00.000Z' } },
  })
  assert.deepEqual(summary.projects.items.map(item => item.ref), ['project:cortex', 'project:old-thing'])
  assert.equal(summary.projects.items[0].cortexUrl, 'http://localhost:3456/#/projects?project=cortex')
  assert.deepEqual(summary.goals.items, [{ ref: 'goal:g1', title: 'Ship', area: null, period: null, targetDate: null, progress: 50, cortexUrl: 'http://localhost:3456/#/goals?record=goal%3Ag1' }])
  assert.deepEqual((summary.calendar as { upcoming: { title: string }[] }).upcoming.map(event => event.title), ['Soon', 'Later'])
  assert.deepEqual(summary.finance, { available: true, basis: 'planned monthly budget', year: 2026, month: 10, income: 1000, expenses: 300, subscriptions: 50, net: 650 })
  assert.deepEqual(summary.crm.manual.byStatus, { active: 1, lead: 1 })
  assert.equal(summary.crm.manual.activeValue, 500)
  assert.deepEqual({ ...summary.crm.noelle }, { contacts: 1, conversations: 1, outbound: 1, inbound: 1, syncedAt: '2026-10-18T11:00:00Z' })
  assert.equal(summary.crm.personalContacts, 1)
  assert.equal(summary.founder.latest?.commits, 5)
  assert.equal(summary.founder.last7Days.commits, 8)
  assert.deepEqual(summary.founder.research?.latestBrief, { version: 2, hash: 'a'.repeat(64), publishedAt: '2026-10-01T00:00:00.000Z' })
  assert.equal(summary.founder.research?.verifiedSent, 1)
  const text = JSON.stringify(summary)
  for (const secret of ['Jane Private', 'jane@example.com', 'secret dm', 'secret reply', 'DM Person', '555', 'private', 'invitation text', 'Salary']) assert.equal(text.includes(secret), false, secret)
})

test('record references have one mapping to Cortex screens', () => {
  assert.equal(refs.project('My App'), 'project:my-app')
  assert.equal(refs.noelle('x', '123'), 'noelle:x:123')
  assert.deepEqual(parseCortexRef('noelle:x:123'), { kind: 'noelle', id: 'x:123' })
  assert.equal(parseCortexRef('unknown:1'), null)
  assert.equal(parseCortexRef('crm:'), null)
  assert.equal(cortexRecordLocation('crm:crm-1'), '/social?tab=crm&record=crm%3Acrm-1')
  assert.equal(cortexRecordLocation('noelle:linkedin:7'), '/social?tab=crm&record=noelle%3Alinkedin%3A7')
  assert.equal(cortexRecordLocation('contact:c1'), '/social?tab=contacts&record=contact%3Ac1')
  assert.equal(cortexRecordLocation('research:small-software'), '/founder?tab=research')
  assert.equal(cortexRecordUrl('http://localhost:3456/', 'home:eightfold'), 'http://localhost:3456/#/daily')
  assert.throws(() => refs.crm('bad id'), /Invalid/)
})
