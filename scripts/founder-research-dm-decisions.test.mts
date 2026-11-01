import test from 'node:test'
import assert from 'node:assert/strict'
import { FounderResearchService, type ResearchEvent, type ResearchState } from '../electron/founder-research.ts'

const now = '2026-11-01T15:00:00.000Z'
function harness() {
  let saved: ResearchState | null = null
  let clock = now
  const service = new FounderResearchService({ read: async () => structuredClone(saved), readCrm: async () => null, write: async next => { saved = structuredClone(next) }, now: () => clock })
  return { service, state: () => saved!, tick: () => { clock = new Date(Date.parse(clock) + 1_000).toISOString() } }
}
async function staged(h: ReturnType<typeof harness>, overrides: Partial<ResearchEvent> = {}) {
  const view = await h.service.action({ type: 'publish' }), brief = view.campaign.revisions[0]
  const event: ResearchEvent = { id: 'draft-1', requestId: 'request-1', draftId: 'draft-1', purpose: 'research_invitation', briefVersion: brief.version, briefHash: brief.hash, platform: 'linkedin', recipient: { name: 'Fixture person', handle: 'fixture-person', profileUrl: 'https://www.linkedin.com/in/fixture-person/' }, body: 'Hi Fixture, exact body.', status: 'pending_review', review: { status: 'pending', id: 'approval-1' }, evidence: [], updatedAt: now, ...overrides }
  await h.service.import({ schemaVersion: 1, source: 'noelle', campaignId: 'small-software', syncedAt: now, events: [event], status: { lastAttemptAt: now, lastSuccessfulSyncAt: now } })
}

test('approving snapshots the exact body and recipient the operator reviewed', async () => {
  const h = harness(); await staged(h)
  const view = await h.service.action({ type: 'decide_dm', eventId: 'draft-1', decision: 'approve' })
  assert.deepEqual(view.dmDecisions['draft-1'], { eventId: 'draft-1', approvalId: 'approval-1', draftId: 'draft-1', platform: 'linkedin', decision: 'approve', exactBody: 'Hi Fixture, exact body.', recipientHandle: 'fixture-person', decidedAt: now, outcome: null })
  assert.deepEqual((await h.service.pendingDmDecisions()).decisions.map(item => item.eventId), ['draft-1'])
})

test('X DMs can be skipped but not approved here', async () => {
  const h = harness(); await staged(h, { platform: 'x', recipient: { name: 'X person', handle: 'xperson', profileUrl: 'https://x.com/xperson' } })
  await assert.rejects(h.service.action({ type: 'decide_dm', eventId: 'draft-1', decision: 'approve' }), /DM decision platform/)
  const view = await h.service.action({ type: 'decide_dm', eventId: 'draft-1', decision: 'skip' })
  assert.equal(view.dmDecisions['draft-1'].decision, 'skip')
})

test('only open drafts with an approval row take a decision', async () => {
  for (const overrides of [{ status: 'rejected' as const }, { review: { status: 'approved' as const, id: 'approval-1' } }, { review: { status: 'pending' as const, id: null } }]) {
    const h = harness(); await staged(h, overrides)
    await assert.rejects(h.service.action({ type: 'decide_dm', eventId: 'draft-1', decision: 'skip' }), /Invalid research DM decision/)
  }
  const h = harness(); await staged(h)
  await assert.rejects(h.service.action({ type: 'decide_dm', eventId: 'missing', decision: 'skip' }), /DM decision event/)
  await assert.rejects(h.service.action({ type: 'decide_dm', eventId: 'draft-1', decision: 'send' }), /DM decision/)
})

test('an acknowledgement settles only the decision Noelle read', async () => {
  const h = harness(); await staged(h)
  await h.service.action({ type: 'decide_dm', eventId: 'draft-1', decision: 'approve' })
  const read = (await h.service.pendingDmDecisions()).decisions[0]
  h.tick(); await h.service.action({ type: 'decide_dm', eventId: 'draft-1', decision: 'skip' })
  assert.deepEqual(await h.service.acknowledgeDmDecisions({ results: [{ eventId: 'draft-1', decidedAt: read.decidedAt, status: 'applied', reason: null }] }), { ok: true, updated: 0 })
  assert.equal(h.state().dmDecisions['draft-1'].outcome, null)
  const current = (await h.service.pendingDmDecisions()).decisions[0]
  await h.service.acknowledgeDmDecisions({ results: [{ eventId: 'draft-1', decidedAt: current.decidedAt, status: 'waiting', reason: 'LinkedIn sender is not verified yet' }] })
  assert.equal((await h.service.pendingDmDecisions()).decisions.length, 1)
  await h.service.acknowledgeDmDecisions({ results: [{ eventId: 'draft-1', decidedAt: current.decidedAt, status: 'applied' }] })
  assert.equal((await h.service.pendingDmDecisions()).decisions.length, 0)
  assert.equal(h.state().dmDecisions['draft-1'].outcome?.status, 'applied')
})

test('an applied decision is final and malformed results are refused', async () => {
  const h = harness(); await staged(h)
  await h.service.action({ type: 'decide_dm', eventId: 'draft-1', decision: 'approve' })
  const { decidedAt } = h.state().dmDecisions['draft-1']
  await h.service.acknowledgeDmDecisions({ results: [{ eventId: 'draft-1', decidedAt, status: 'applied' }] })
  await assert.rejects(h.service.action({ type: 'decide_dm', eventId: 'draft-1', decision: 'skip' }), /already applied/)
  for (const bad of [null, { results: 'x' }, { results: [{ eventId: 'draft-1', decidedAt, status: 'done' }] }, { results: Array.from({ length: 501 }, () => ({})) }])
    await assert.rejects(h.service.acknowledgeDmDecisions(bad), /DM decision result/)
})

test('state saved before decisions existed still loads', async () => {
  const h = harness(); await staged(h)
  const legacy: Record<string, unknown> = structuredClone(h.state()); delete legacy.dmDecisions
  const service = new FounderResearchService({ read: async () => structuredClone(legacy), readCrm: async () => null, write: async () => {}, now: () => now })
  assert.deepEqual((await service.read()).dmDecisions, {})
})
