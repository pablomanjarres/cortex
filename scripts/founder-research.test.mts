import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import http from 'node:http'
import { once } from 'node:events'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { FounderResearchService, ResearchValidationError, ResearchConflictError, createResearchState, computeBriefHash, parseResearchState, researchArchiveFiles, researchView, type ResearchEvent, type ResearchState } from '../electron/founder-research.ts'
import { isLoopbackAddress } from '../electron/noelle-crm.ts'
import type { NoelleCrmSnapshot } from '../electron/noelle-crm.ts'

const now = '2026-10-11T15:00:00.000Z'
function harness() {
  let saved: ResearchState | null = null
  let clock = now
  let crm: NoelleCrmSnapshot | null = null
  const service = new FounderResearchService({ read: async () => structuredClone(saved), readCrm: async () => structuredClone(crm), write: async next => { saved = structuredClone(next) }, now: () => clock })
  return { service, state: () => saved!, tick: () => { clock = new Date(Date.parse(clock) + 1_000).toISOString() }, crm: (next: NoelleCrmSnapshot) => { crm = next } }
}
function event(state: ResearchState, overrides: Partial<ResearchEvent> = {}): ResearchEvent {
  const brief = state.campaign.revisions.at(-1)!
  return { id: 'draft-1', requestId: 'request-1', draftId: 'draft-1', purpose: 'research_invitation', briefVersion: brief.version, briefHash: brief.hash, platform: 'x', recipient: { name: 'Fixture participant', handle: 'fixture', profileUrl: 'https://x.com/fixture' }, body: 'Fixture invitation with exact spacing.  ', status: 'approved', review: { status: 'approved', id: 'review-1' }, evidence: [{ id: 'source-1', source: 'public_post', summary: 'Fixture source only.' }], updatedAt: now, ...overrides }
}
function snapshot(events: ResearchEvent[], syncedAt = now) { return { schemaVersion: 1, source: 'noelle', campaignId: 'small-software', syncedAt, events, status: { lastAttemptAt: syncedAt, lastSuccessfulSyncAt: syncedAt } } }
function receipt(body: string): NoelleCrmSnapshot {
  return { schemaVersion: 1, source: 'noelle', syncedAt: now, status: { lastAttemptAt: now }, contacts: [{ id: 'contact-1', platform: 'x', name: 'Fixture participant', handle: 'fixture', profileUrl: 'https://x.com/fixture', firstSentAt: now, lastSentAt: now, conversations: [{ id: 'thread-1', url: '', lastObservedAt: now, syncStatus: 'ok', messages: [{ id: 'message-1', externalId: 'native-1', direction: 'outbound', body, sentAt: now, observedAt: now }] }] }] }
}

test('initial campaign is real research scope with no invented people or published brief', async () => {
  const h = harness(), view = await h.service.read()
  assert.equal(view.campaign.id, 'small-software')
  assert.match(view.campaign.draft.audience, /already building internal tools/)
  assert.equal(view.events.length, 0)
  assert.equal(view.crmContacts.length, 0)
  assert.equal(view.campaign.revisions.length, 0)
  assert.equal(view.findings.length, 0)
})

test('maximum accepted published brief satisfies the actual Noelle consumer schema', async t => {
  const contract = new URL('../../noelle/packages/contracts/src/research-dm.ts', import.meta.url)
  if (!existsSync(contract)) { t.skip('Sibling Noelle contract is unavailable in this checkout'); return }
  const { PublishedResearchBriefSchema } = await import(contract.href)
  const h = harness()
  const draft = { title: 't'.repeat(300), audience: 'a'.repeat(3000), objective: 'o'.repeat(3000), questions: Array.from({ length: 12 }, (_, i) => String(i).padEnd(1000, '?')), invitationGuidance: 'g'.repeat(3000) }
  await h.service.action({ type: 'save_draft', draft })
  const view = await h.service.action({ type: 'publish' })
  assert.equal(PublishedResearchBriefSchema.safeParse(view.campaign.revisions[0]).success, true)
  for (const invalid of [{ ...draft, questions: [...draft.questions, 'Thirteenth question'] }, { ...draft, questions: ['?'.repeat(1001)] }, { ...draft, audience: 'a'.repeat(3001) }, { ...draft, title: 't'.repeat(301) }]) {
    await assert.rejects(h.service.action({ type: 'save_draft', draft: invalid }), /Invalid research/)
  }
  assert.equal(h.state().campaign.revisions.length, 1)
})

test('publishing creates an immutable canonical revision and identical publish is idempotent', async () => {
  const h = harness()
  const one = await h.service.action({ type: 'publish' }), brief = one.campaign.revisions[0]
  const draft = one.campaign.draft
  assert.equal(brief.hash, createHash('sha256').update(JSON.stringify({ campaignId: 'small-software', version: 1, title: draft.title, audience: draft.audience, objective: draft.objective, questions: draft.questions, invitationGuidance: draft.invitationGuidance })).digest('hex'))
  h.tick()
  assert.equal((await h.service.action({ type: 'publish' })).campaign.revisions.length, 1)
  await h.service.action({ type: 'save_draft', draft: { ...draft, audience: 'Revised real audience.' }, expectedUpdatedAt: one.campaign.draftUpdatedAt })
  const two = await h.service.action({ type: 'publish' })
  assert.deepEqual(two.campaign.revisions[0], brief)
  assert.equal(two.campaign.revisions[1].version, 2)
  assert.notEqual(two.campaign.revisions[1].hash, brief.hash)
})

test('stale brief edits are rejected instead of overwriting another edit', async () => {
  const h = harness(), original = await h.service.read()
  h.tick()
  await h.service.action({ type: 'save_draft', draft: original.campaign.draft, expectedUpdatedAt: original.campaign.draftUpdatedAt })
  await assert.rejects(h.service.action({ type: 'publish', expectedUpdatedAt: original.campaign.draftUpdatedAt }), /brief changed/)
})

test('a changed published brief requires re-review of unsent drafts', async () => {
  const h = harness(), published = await h.service.action({ type: 'publish' })
  await h.service.import(snapshot([event(h.state())]))
  assert.equal((await h.service.read()).events[0].requiresReview, false)
  h.tick()
  await h.service.action({ type: 'save_draft', draft: { ...published.campaign.draft, objective: 'Updated research objective.' } })
  assert.equal((await h.service.read()).events[0].requiresReview, false)
  await h.service.action({ type: 'publish' })
  assert.equal((await h.service.read()).events[0].requiresReview, true)
})

test('a sent flag requires exact native CRM proof and does not enroll historical contacts', async () => {
  const h = harness(); await h.service.action({ type: 'publish' })
  const sent = event(h.state(), { status: 'sent', nativeExternalId: 'native-1', crmContactId: 'contact-1', conversationId: 'thread-1', sentAt: now })
  h.crm(receipt(sent.body))
  assert.equal((await h.service.read()).crmContacts.length, 0)
  await h.service.import(snapshot([sent]))
  const verified = await h.service.read()
  assert.equal(verified.events[0].verifiedSent, true)
  assert.equal(verified.crmContacts.length, 1)
  const wrongBody = receipt(sent.body.trim()); h.crm(wrongBody)
  assert.equal((await h.service.read()).events[0].verifiedSent, false)
  h.crm(receipt(sent.body)); wrongBody.contacts[0].profileUrl = 'https://x.com/another'; h.crm(wrongBody)
  assert.equal((await h.service.read()).events[0].verifiedSent, false)
  const inbound = receipt(sent.body); inbound.contacts[0].conversations[0].messages[0].direction = 'inbound'; h.crm(inbound)
  assert.equal((await h.service.read()).events[0].verifiedSent, false)
})

test('verified sends retain their original brief after a new version is published', async () => {
  const h = harness(); const view = await h.service.action({ type: 'publish' })
  const sent = event(h.state(), { status: 'sent', nativeExternalId: 'native-1', crmContactId: 'contact-1', conversationId: 'thread-1' }); h.crm(receipt(sent.body))
  await h.service.import(snapshot([sent])); h.tick()
  await h.service.action({ type: 'save_draft', draft: { ...view.campaign.draft, title: 'Small Software revised' } }); await h.service.action({ type: 'publish' })
  const final = (await h.service.read()).events[0]
  assert.equal(final.verifiedSent, true)
  assert.equal(final.requiresReview, false)
  assert.equal(final.briefVersion, 1)
})

test('imports merge by source ID and time, preserve partial snapshots, and reject duplicate or non-research sources', async () => {
  const h = harness(); await h.service.action({ type: 'publish' }); const original = event(h.state())
  await h.service.import(snapshot([original]))
  const newer = { ...original, status: 'rejected' as const, updatedAt: '2026-10-11T15:01:00.000Z' }
  await h.service.import(snapshot([newer], newer.updatedAt)); await h.service.import(snapshot([original]))
  await h.service.import({ ...snapshot([], '2026-10-11T15:02:00.000Z'), status: { lastAttemptAt: '2026-10-11T15:02:00.000Z', error: 'Fixture source offline' } })
  const view = await h.service.read()
  assert.equal(view.events.length, 1); assert.equal(view.events[0].status, 'rejected'); assert.match(view.sync.error!, /offline/)
  assert.throws(() => h.service.import(snapshot([original, original])), /duplicate/)
  assert.throws(() => h.service.import(snapshot([{ ...original, purpose: 'friendly' } as unknown as ResearchEvent])), /purpose/)
})

test('request-only prospects can stage without inventing a draft or send', async () => {
  const h = harness(); await h.service.action({ type: 'publish' })
  await h.service.import(snapshot([event(h.state(), { id: 'request:request-1', draftId: null, body: '', status: 'prospect' })]))
  const view = await h.service.read(); assert.equal(view.events[0].draftId, null); assert.equal(view.events[0].verifiedSent, false)
})

test('request placeholders leave active staging when a draft arrives without losing notes or source history', async () => {
  const h = harness(); await h.service.action({ type: 'publish' })
  const placeholder = event(h.state(), { id: 'request:request-1', draftId: null, body: '', status: 'prospect' })
  await h.service.import(snapshot([placeholder]))
  await h.service.action({ type: 'save_note', scope: `event:${placeholder.id}`, text: 'Original prospect note.' })
  const drafted = event(h.state(), { updatedAt: '2026-10-11T15:01:00.000Z' })
  await h.service.import(snapshot([drafted], drafted.updatedAt)); await h.service.import(snapshot([drafted], drafted.updatedAt))
  const view = await h.service.read()
  assert.equal(view.events.length, 2)
  assert.deepEqual(view.events.filter(item => !item.superseded).map(item => item.id), ['draft-1'])
  assert.equal(view.notes[`event:${placeholder.id}`].text, 'Original prospect note.')
})

test('a genuine retry draft supersedes its failed request placeholder while retaining immutable lineage and notes', async () => {
  const h = harness(); await h.service.action({ type: 'publish' })
  const failedRequestId = '8b8acd86-b379-4b8f-b5d9-5c3a8b6be008'
  const successorRequestId = '964f270c-a233-4647-996b-7c04bbf02cb7'
  const failed = event(h.state(), { id: `request:${failedRequestId}`, requestId: failedRequestId, draftId: null, body: '', status: 'error' })
  await h.service.import(snapshot([failed]))
  await h.service.action({ type: 'save_note', scope: `event:${failed.id}`, text: 'Original failed request history.' })
  const successor = event(h.state(), { requestId: successorRequestId, supersedesRequestId: failedRequestId, updatedAt: '2026-10-11T15:01:00.000Z' })
  await h.service.import(snapshot([successor], successor.updatedAt))
  await h.service.import(snapshot([successor], successor.updatedAt))
  let view = await h.service.read()
  assert.equal(view.events.length, 2)
  assert.equal(view.events.find(item => item.id === failed.id)!.superseded, true)
  assert.deepEqual(view.events.filter(item => !item.verifiedSent && !item.superseded).map(item => item.id), ['draft-1'])
  assert.equal(view.events.find(item => item.id === successor.id)!.supersedesRequestId, failedRequestId)
  assert.equal(view.notes[`event:${failed.id}`].text, 'Original failed request history.')
  const archive = researchArchiveFiles(h.state(), null)
  assert.equal(JSON.parse(archive['state.json']).events.find((item: ResearchEvent) => item.id === successor.id).supersedesRequestId, failedRequestId)
  assert.match(archive['contacts.csv'], /supersedes_request_id/)
  const withoutLineage = { ...successor }; delete withoutLineage.supersedesRequestId
  const updatedAt = '2026-10-11T15:02:00.000Z'
  await h.service.import(snapshot([{ ...withoutLineage, updatedAt }], updatedAt))
  view = await h.service.read()
  assert.equal(view.events.find(item => item.id === successor.id)!.supersedesRequestId, failedRequestId)
  assert.equal(view.events.find(item => item.id === failed.id)!.superseded, true)
  await assert.rejects(h.service.import(snapshot([{ ...successor, supersedesRequestId: '413e38b4-26ae-4b77-93b7-9a6b403d1b48', updatedAt }], updatedAt)), /immutable.*lineage/)
  assert.throws(() => h.service.import(snapshot([{ ...successor, supersedesRequestId: 'not-a-uuid' }], updatedAt)), /superseded request id/)
  assert.equal(h.state().events.find(item => item.id === successor.id)!.supersedesRequestId, failedRequestId)
})

test('copy revisions replace only active unsent drafts and retain their exact history and immutable lineage', async () => {
  const h = harness(); await h.service.action({ type: 'publish' })
  const originalId = '795d0697-90ac-45cb-9173-c3eaf7e605d5'
  const successorId = 'b0d5e479-a564-491d-95a2-b161a1ee67f2'
  const original = event(h.state(), { id: originalId, draftId: originalId, body: 'Original exact invitation.  ' })
  await h.service.import(snapshot([original]))
  await h.service.action({ type: 'save_note', scope: `event:${originalId}`, text: 'Why the original copy needed revision.' })
  const successor = event(h.state(), { id: successorId, draftId: successorId, supersedesDraftId: originalId, body: 'Revised invitation with supported context.', updatedAt: '2026-10-11T15:01:00.000Z' })
  await h.service.import(snapshot([successor], successor.updatedAt))
  await h.service.import(snapshot([successor], successor.updatedAt))
  let view = await h.service.read()
  assert.deepEqual(view.events.filter(item => !item.verifiedSent && !item.superseded).map(item => item.id), [successorId])
  assert.equal(view.events.find(item => item.id === originalId)!.superseded, true)
  assert.equal(view.events.find(item => item.id === originalId)!.body, original.body)
  assert.equal(view.notes[`event:${originalId}`].text, 'Why the original copy needed revision.')
  const archive = researchArchiveFiles(h.state(), null)
  assert.match(archive['contacts.csv'], /supersedes_draft_id/)
  assert.equal(JSON.parse(archive['state.json']).events.find((item: ResearchEvent) => item.id === successorId).supersedesDraftId, originalId)
  const withoutLineage = { ...successor }; delete withoutLineage.supersedesDraftId
  const updatedAt = '2026-10-11T15:02:00.000Z'
  await h.service.import(snapshot([{ ...withoutLineage, updatedAt }], updatedAt))
  assert.equal((await h.service.read()).events.find(item => item.id === successorId)!.supersedesDraftId, originalId)
  await assert.rejects(h.service.import(snapshot([{ ...successor, supersedesDraftId: '6a6d6b32-0f82-4c1c-8681-2b3d04400a63', updatedAt }], updatedAt)), /immutable.*lineage/)
  assert.throws(() => h.service.import(snapshot([{ ...successor, supersedesDraftId: 'not-a-uuid' }], updatedAt)), /superseded draft id/)
  h.crm(receipt(original.body))
  const sent = { ...original, status: 'sent' as const, nativeExternalId: 'native-1', crmContactId: 'contact-1', conversationId: 'thread-1', updatedAt: '2026-10-11T15:03:00.000Z' }
  await h.service.import(snapshot([sent], sent.updatedAt))
  view = await h.service.read()
  assert.equal(view.events.find(item => item.id === originalId)!.verifiedSent, true)
  assert.equal(view.events.find(item => item.id === originalId)!.superseded, false)
  assert.deepEqual(view.events.filter(item => !item.verifiedSent && !item.superseded).map(item => item.id), [successorId])
  assert.equal(view.crmContacts.length, 1)
})

test('equal-timestamp proof enrichment is accepted while verified original sent content stays fixed', async () => {
  const h = harness(); await h.service.action({ type: 'publish' }); const drafted = event(h.state())
  await h.service.import(snapshot([drafted])); h.crm(receipt(drafted.body))
  const sent = { ...drafted, status: 'sent' as const, nativeExternalId: 'native-1', crmContactId: 'contact-1', conversationId: 'thread-1' }
  await h.service.import(snapshot([sent], '2026-10-11T15:01:00.000Z'))
  assert.equal((await h.service.read()).events[0].verifiedSent, true)
  await h.service.import(snapshot([{ ...sent, body: 'Edited after native send', briefHash: 'f'.repeat(64), updatedAt: '2026-10-11T15:02:00.000Z' }], '2026-10-11T15:02:00.000Z'))
  const final = (await h.service.read()).events[0]
  assert.equal(final.body, drafted.body); assert.equal(final.briefHash, drafted.briefHash); assert.equal(final.verifiedSent, true)
})

test('findings can cite exact inbound CRM message references only after campaign send verification', async () => {
  const h = harness(); await h.service.action({ type: 'publish' }); const drafted = event(h.state())
  const crm = receipt(drafted.body)
  crm.contacts[0].conversations[0].messages.push({ id: 'incoming-1', direction: 'inbound', body: 'Exact customer words.', sentAt: null, observedAt: now })
  h.crm(crm); await h.service.import(snapshot([drafted]))
  const source = 'crm:x:thread-1:incoming-1'
  await assert.rejects(h.service.action({ type: 'add_finding', text: 'Fixture unsupported attribution', sourceIds: [source], reviewStatus: 'unreviewed' }), /source IDs/)
  await h.service.import(snapshot([{ ...drafted, status: 'sent', nativeExternalId: 'native-1', crmContactId: 'contact-1', conversationId: 'thread-1' }], '2026-10-11T15:01:00.000Z'))
  const view = await h.service.read(), reference = view.sources.find(item => item.id === source)!
  assert.equal(reference.kind, 'reply'); assert.equal(reference.preview, 'Exact customer words.'); assert.equal(reference.messageId, 'incoming-1')
  const final = await h.service.action({ type: 'add_finding', text: 'Fixture source-backed claim.', sourceIds: [source], reviewStatus: 'unreviewed' })
  assert.deepEqual(final.findings[0].sourceIds, [source]); assert.equal(crm.contacts[0].conversations[0].messages[1].body, 'Exact customer words.')
})

test('generation health receipts are bounded, merge by platform observation, and preserve errors and brief provenance', async () => {
  const h = harness(); await h.service.action({ type: 'publish' })
  const brief = h.state().campaign.revisions[0]
  const generation = { schemaVersion: 1, campaignId: 'small-software', purpose: 'research_invitation', platform: 'x', observedAt: now, status: 'success', windowKey: 'fixture-window', briefVersion: 1, briefHash: brief.hash, eligible: 2, staged: 1, pending: 1, sent: 0 }
  await h.service.import({ ...snapshot([]), status: { lastAttemptAt: now, generation: [generation] } })
  await h.service.import(snapshot([], '2026-10-11T15:01:00.000Z'))
  assert.equal((await h.service.read()).sync.generation![0].staged, 1)
  await h.service.import({ ...snapshot([], '2026-10-11T15:02:00.000Z'), status: { lastAttemptAt: '2026-10-11T15:02:00.000Z', generation: [{ ...generation, observedAt: '2026-10-11T15:02:00.000Z', status: 'error', error: 'brief_unavailable' }] } })
  assert.equal((await h.service.read()).sync.generation![0].error, 'brief_unavailable')
  assert.throws(() => h.service.import({ ...snapshot([]), status: { lastAttemptAt: now, generation: [{ ...generation, sent: 1 }] } }), /generation receipt/)
})

test('Markdown notes stay separate from exact conversations and source-backed findings link to decisions', async () => {
  const h = harness(); await h.service.action({ type: 'publish' }); const draft = event(h.state())
  await h.service.import(snapshot([draft]))
  await h.service.action({ type: 'save_note', scope: 'event:draft-1', text: '## Interview notes\n\nA reviewed annotation.' })
  assert.equal(h.state().events[0].body, draft.body)
  await assert.rejects(h.service.action({ type: 'add_finding', text: 'Unsupported claim', sourceIds: ['unknown'], reviewStatus: 'confirmed' }), /source IDs/)
  const finding = await h.service.action({ type: 'add_finding', text: 'Fixture finding', sourceIds: ['source-1'], reviewStatus: 'unreviewed' })
  const final = await h.service.action({ type: 'add_decision', text: 'Fixture decision', evidenceIds: [finding.findings[0].id], reviewStatus: 'proposed' })
  assert.deepEqual(final.decisions[0].evidenceIds, [finding.findings[0].id])
  await h.service.action({ type: 'review_finding', id: finding.findings[0].id, reviewStatus: 'confirmed' })
  await h.service.action({ type: 'review_decision', id: final.decisions[0].id, reviewStatus: 'accepted' })
  assert.equal(h.state().findings[0].reviewStatus, 'confirmed')
  assert.equal(h.state().decisions[0].reviewStatus, 'accepted')
  const files = researchArchiveFiles(h.state(), null)
  assert.match(files['notes.md'], /## Interview notes/); assert.match(files['contacts.csv'], /verified_sent/)
  assert.equal(JSON.parse(files['brief-v1.json']).hash, h.state().campaign.revisions[0].hash)
})

test('booked and completed are explicit manual records for verified participants only', async () => {
  const h = harness(); await h.service.action({ type: 'publish' }); const draft = event(h.state())
  await h.service.import(snapshot([draft])); await assert.rejects(h.service.action({ type: 'set_meeting', eventId: draft.id, status: 'booked' }), /verified participant/)
  const sent = { ...draft, status: 'sent' as const, nativeExternalId: 'native-1', crmContactId: 'contact-1', conversationId: 'thread-1', updatedAt: '2026-10-11T15:01:00.000Z' }; h.crm(receipt(sent.body))
  await h.service.import(snapshot([sent])); const view = await h.service.action({ type: 'set_meeting', eventId: sent.id, status: 'completed' })
  assert.equal(view.meetings[sent.id].source, 'manual')
  assert.throws(() => h.service.import(snapshot([{ ...sent, status: 'completed' } as unknown as ResearchEvent])), /status/)
})

test('edited published revisions fail validation and CSV values cannot become spreadsheet formulas', () => {
  const state = createResearchState(now), draft = state.campaign.draft
  state.campaign.revisions.push({ ...draft, schemaVersion: 1, campaignId: 'small-software', version: 1, hash: computeBriefHash('small-software', 1, draft), publishedAt: now })
  state.events.push(event(state, { recipient: { name: '=HYPERLINK("bad")', handle: 'fixture', profileUrl: 'https://x.com/fixture' } }))
  assert.match(researchArchiveFiles(state, null)['contacts.csv'], /'=HYPERLINK/)
  state.campaign.revisions[0].title = 'Tampered'; assert.throws(() => parseResearchState(state), /published revision/)
})

test('concurrent notes and imports both persist through the same domain owner', async () => {
  const h = harness(); await h.service.action({ type: 'publish' })
  await Promise.all([h.service.import(snapshot([event(h.state())])), h.service.action({ type: 'save_note', scope: 'campaign', text: 'Concurrent note.' })])
  assert.equal(h.state().events.length, 1); assert.equal(h.state().notes.campaign.text, 'Concurrent note.')
  assert.equal(researchView(h.state(), null).crmContacts.length, 0)
})

async function apiHarness(remoteAddress?: string) {
  const source = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true)
  const declarations = ['readBody', 'isTailscaleOrLocal', 'startWebServer'].map(name => {
    const fn = tree.statements.find((item): item is ts.FunctionDeclaration => ts.isFunctionDeclaration(item) && item.name?.text === name)
    assert.ok(fn); return fn.getText(tree)
  }).join('\n')
  const h = harness()
  const context = vm.createContext({
    http: { createServer: (handler: http.RequestListener) => http.createServer((req, res) => { if (remoteAddress) Object.defineProperty(req.socket, 'remoteAddress', { value: remoteAddress }); handler(req, res) }) },
    path, URL, Buffer, console, __dirname: '/isolated-api-test', WEB_PORT: 0, MAX_BODY_BYTES: 25 * 1024 * 1024,
    isLoopbackAddress, founderResearchService: h.service, ResearchValidationError, ResearchConflictError, parseResearchState, researchArchiveFiles, readResearchCrm: async () => null,
  })
  const javascript = ts.transpileModule(declarations, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  vm.runInContext(`let webServer = null; ${javascript}\nstartWebServer(); globalThis.apiServer = webServer;`, context)
  const server = context.apiServer as http.Server; await once(server, 'listening')
  const port = (server.address() as { port: number }).port
  return { ...h, url: `http://127.0.0.1:${port}/api/founder-research`, close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections() }) }
}

test('HTTP exposes a clear unpublished brief, then the exact canonical published transport', async t => {
  const api = await apiHarness(); t.after(() => api.close())
  const initial = await fetch(api.url); assert.equal(initial.status, 200); assert.equal((await initial.json()).events.length, 0)
  const missing = await fetch(`${api.url}/brief?campaignId=small-software`); assert.equal(missing.status, 404); assert.match((await missing.json()).error, /not published/)
  assert.equal((await fetch(`${api.url}/brief?campaignId=unknown`)).status, 404)
  const published = await fetch(`${api.url}/action`, { method: 'POST', body: JSON.stringify({ type: 'publish' }) }); assert.equal(published.status, 200)
  const transport = await fetch(`${api.url}/brief?campaignId=small-software`); assert.equal(transport.status, 200)
  assert.deepEqual(await transport.json(), api.state().campaign.revisions[0])
  assert.equal(transport.headers.get('cache-control'), 'no-store')
})

test('HTTP validates research imports and refuses non-loopback writers', async t => {
  const local = await apiHarness(); t.after(() => local.close()); await local.service.action({ type: 'publish' })
  assert.equal((await fetch(`${local.url}/import`, { method: 'POST', body: '{' })).status, 400)
  const valid = snapshot([event(local.state())])
  assert.equal((await fetch(`${local.url}/import`, { method: 'POST', body: JSON.stringify(valid) })).status, 200)
  assert.equal(local.state().events.length, 1)
  const remote = await apiHarness('100.70.1.2'); t.after(() => remote.close())
  assert.equal((await fetch(`${remote.url}/import`, { method: 'POST', body: JSON.stringify(valid) })).status, 403)
  assert.equal(remote.state(), null)
})

test('HTTP export returns annotations and blocks paths outside the owned archive', async t => {
  const api = await apiHarness(); t.after(() => api.close())
  await api.service.action({ type: 'save_note', scope: 'campaign', text: '# Fixture notes\nExact annotation.' })
  const notes = await fetch(`${api.url}/export?file=notes.md`)
  assert.equal(notes.status, 200); assert.match(await notes.text(), /Exact annotation/); assert.match(notes.headers.get('content-disposition')!, /notes.md/)
  assert.equal((await fetch(`${api.url}/export?file=../../secrets`)).status, 404)
  assert.equal((await fetch(`${api.url}/export?file=contacts.csv`)).headers.get('content-type'), 'text/csv; charset=utf-8')
})

test('durable write errors do not acknowledge saved imports and do not poison the next import', async () => {
  const state = createResearchState(now); const draft = state.campaign.draft
  state.campaign.revisions.push({ ...draft, schemaVersion: 1, campaignId: 'small-software', version: 1, hash: computeBriefHash('small-software', 1, draft), publishedAt: now })
  let stored = structuredClone(state), broken = true
  const service = new FounderResearchService({ read: async () => structuredClone(stored), readCrm: async () => null, write: async next => { if (broken) throw new Error('Fixture write failed'); stored = next } })
  await assert.rejects(service.import(snapshot([event(state)])), /write failed/); assert.equal(stored.events.length, 0)
  broken = false; assert.equal((await service.import(snapshot([event(state)]))).events, 1)
})
