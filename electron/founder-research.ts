import { createHash, randomUUID } from 'node:crypto'
import type { NoelleCrmSnapshot } from './noelle-crm.js'
import { RESEARCH_BRIEF_LIMITS } from './founder-research-model.js'

import type { ResearchBriefDraft, ResearchEvent, ResearchGeneration, ResearchSource, ResearchState, ResearchView } from './founder-research-model.js'
export * from './founder-research-model.js'

export class ResearchValidationError extends Error {}
export class ResearchConflictError extends Error {}
const fail = (field: string): never => { throw new ResearchValidationError(`Invalid research ${field}`) }
const record = (value: unknown, field: string): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail(field)
const text = (value: unknown, field: string, max = 2_000, required = false): string => typeof value === 'string' && value.length <= max && (!required || !!value.trim()) ? value : fail(field)
const list = (value: unknown, field: string, max: number): unknown[] => Array.isArray(value) && value.length <= max ? value : fail(field)
const iso = (value: unknown, field: string): string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fail(field)
const nullableText = (value: unknown, field: string): string | null => value == null ? null : text(value, field, 500, true)
const nullableIso = (value: unknown, field: string): string | null => value == null ? null : iso(value, field)
function optionalUuid(value: unknown, field: string): string | undefined {
  if (value == null) return undefined
  const result = text(value, field, 36, true).toLowerCase()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(result) ? result : fail(field)
}
function url(value: unknown, field: string): string {
  if (value == null || value === '') return ''
  const raw = text(value, field)
  try { const parsed = new URL(raw); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) fail(field); return parsed.href } catch { return fail(field) }
}
function choice<T extends string>(value: unknown, options: readonly T[], field: string): T { return options.includes(value as T) ? value as T : fail(field) }
function version(value: unknown): number { return Number.isInteger(value) && Number(value) > 0 && Number(value) < 1_000_000 ? Number(value) : fail('brief version') }
function hash(value: unknown): string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : fail('brief hash') }
function parseGeneration(raw: unknown): ResearchGeneration[] {
  const generations = list(raw, 'generation receipts', 2).map(value => {
    const row = record(value, 'generation receipt')
    if (row.schemaVersion !== 1 || row.campaignId !== 'small-software' || row.sent !== 0) fail('generation receipt schema/campaign/sent')
    const counts: Pick<ResearchGeneration, 'eligible' | 'staged' | 'pending'> = {}
    for (const field of ['eligible', 'staged', 'pending'] as const) {
      if (row[field] !== undefined) { if (!Number.isInteger(row[field]) || Number(row[field]) < 0 || Number(row[field]) > 1_000_000) fail(`generation ${field}`); counts[field] = Number(row[field]) }
    }
    return { schemaVersion: 1 as const, campaignId: 'small-software' as const, platform: choice(row.platform, ['x', 'linkedin'], 'generation platform'), purpose: choice(row.purpose, ['research_invitation', 'research_followup'], 'generation purpose'), observedAt: iso(row.observedAt, 'generation observed at'), status: choice(row.status, ['success', 'error'], 'generation status'), windowKey: text(row.windowKey, 'generation window', 200, true), ...(row.briefVersion != null ? { briefVersion: version(row.briefVersion) } : {}), ...(row.briefHash != null ? { briefHash: hash(row.briefHash) } : {}), ...counts, ...(row.error ? { error: text(row.error, 'generation error', 200) } : {}), sent: 0 as const }
  })
  if (new Set(generations.map(item => item.platform)).size !== generations.length) fail('duplicate generation platforms')
  return generations
}
function isInvalidGenerationReceipt(receipt: ResearchGeneration | undefined): boolean {
  return receipt?.status === 'error' && receipt.windowKey === 'receipt-invalid' && receipt.error === 'research_generation_receipt_invalid'
}

export function parseBriefDraft(raw: unknown): ResearchBriefDraft {
  const row = record(raw, 'brief')
  const questions = list(row.questions, 'questions', RESEARCH_BRIEF_LIMITS.questions).map(value => text(value, 'question', RESEARCH_BRIEF_LIMITS.question, true))
  if (!questions.length) fail('questions')
  return { title: text(row.title, 'title', RESEARCH_BRIEF_LIMITS.title, true), audience: text(row.audience, 'audience', RESEARCH_BRIEF_LIMITS.audience, true), objective: text(row.objective, 'objective', RESEARCH_BRIEF_LIMITS.objective, true), questions, invitationGuidance: text(row.invitationGuidance, 'invitation guidance', RESEARCH_BRIEF_LIMITS.invitationGuidance, true) }
}
export function computeBriefHash(campaignId: string, revision: number, draft: ResearchBriefDraft): string {
  return createHash('sha256').update(JSON.stringify({ campaignId, version: revision, title: draft.title, audience: draft.audience, objective: draft.objective, questions: draft.questions, invitationGuidance: draft.invitationGuidance })).digest('hex')
}
export function createResearchState(now: string): ResearchState {
  return { schemaVersion: 1, campaign: { id: 'small-software', draftUpdatedAt: now, revisions: [], draft: {
    title: 'Small Software',
    audience: 'Small teams already building internal tools with agents.',
    objective: 'Understand where deploying, sharing, authentication, permissions and environment setup break down for teams already building internal tools with agents.',
    questions: [
      'What was the last internal tool your team built with an agent?',
      'How did you actually deploy it and share it with the team?',
      'What failed around login, permissions or environment setup, and what workaround did you use?',
      'How much real time or money did that setup and workaround cost?',
    ],
    invitationGuidance: 'Ask for a short research conversation grounded in their actual internal tool. Keep the invitation personal and brief. Explore real deployment and team-sharing experience; do not pitch a product or assume a problem they have not described.',
  } }, events: [], notes: {}, findings: [], decisions: [], meetings: {}, sync: { syncedAt: null, lastAttemptAt: null, lastSuccessfulSyncAt: null } }
}

export function parseResearchEvent(raw: unknown): ResearchEvent {
  const row = record(raw, 'event'), recipient = record(row.recipient, 'recipient'), review = record(row.review, 'review')
  const requestId = nullableText(row.requestId, 'request id'), draftId = nullableText(row.draftId, 'draft id')
  const supersedesRequestId = optionalUuid(row.supersedesRequestId, 'superseded request id')
  const supersedesDraftId = optionalUuid(row.supersedesDraftId, 'superseded draft id')
  if (!requestId && !draftId) fail('source request/draft id')
  const platform = choice(row.platform, ['x', 'linkedin'], 'platform')
  const profileUrl = url(recipient.profileUrl, 'profile URL')
  if (profileUrl) {
    const parsed = new URL(profileUrl), host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    if (parsed.protocol !== 'https:' || !(platform === 'x' ? ['x.com', 'twitter.com'] : ['linkedin.com']).includes(host)) fail('profile URL')
  }
  return {
    id: text(row.id, 'event id', 500, true), requestId, draftId,
    ...(supersedesRequestId ? { supersedesRequestId } : {}),
    ...(supersedesDraftId ? { supersedesDraftId } : {}),
    purpose: choice(row.purpose, ['research_invitation', 'research_followup'], 'purpose'),
    briefVersion: version(row.briefVersion), briefHash: hash(row.briefHash), platform,
    recipient: { name: text(recipient.name, 'recipient name', 500), handle: text(recipient.handle, 'recipient handle', 500), profileUrl },
    body: text(row.body, 'draft body', 100_000), status: choice(row.status, ['prospect', 'drafted', 'pending_review', 'approved', 'rejected', 'queued', 'sending', 'sent', 'blocked', 'error'], 'event status'),
    review: { status: choice(review.status, ['pending', 'approved', 'rejected', 'needs_review', 'unknown'], 'review status'), id: nullableText(review.id, 'review id'), reason: review.reason == null ? null : text(review.reason, 'review reason', 2_000), reviewedAt: nullableIso(review.reviewedAt, 'reviewed at') },
    evidence: list(row.evidence, 'event evidence', 100).map(value => { const item = record(value, 'evidence'); return { id: text(item.id, 'evidence id', 500, true), source: text(item.source, 'evidence source', 200, true), ...(item.url ? { url: url(item.url, 'evidence URL') } : {}), ...(item.summary ? { summary: text(item.summary, 'evidence summary', 1_000) } : {}) } }),
    nativeExternalId: nullableText(row.nativeExternalId, 'native send id'), sentAt: nullableIso(row.sentAt, 'sent at'),
    crmContactId: nullableText(row.crmContactId, 'CRM contact id'), conversationId: nullableText(row.conversationId, 'conversation id'), updatedAt: iso(row.updatedAt, 'event updated at'),
  }
}
export function parseResearchState(raw: unknown): ResearchState {
  const row = record(raw, 'state'), campaign = record(row.campaign, 'campaign')
  if (row.schemaVersion !== 1 || campaign.id !== 'small-software') fail('schema/campaign')
  const draft = parseBriefDraft(campaign.draft)
  const revisions = list(campaign.revisions, 'revisions', 1_000).map(value => {
    const item = record(value, 'revision'), brief = parseBriefDraft(item), revision = version(item.version)
    if (item.schemaVersion !== 1 || item.campaignId !== campaign.id || hash(item.hash) !== computeBriefHash(String(campaign.id), revision, brief)) fail('published revision')
    return { ...brief, schemaVersion: 1 as const, campaignId: String(campaign.id), version: revision, hash: String(item.hash), publishedAt: iso(item.publishedAt, 'published at') }
  })
  if (revisions.some((item, index) => item.version !== index + 1)) fail('revision sequence')
  const notes: ResearchState['notes'] = {}
  for (const [scope, value] of Object.entries(record(row.notes, 'notes'))) {
    if (Object.keys(notes).length >= 5_001 || !(scope === 'campaign' || scope.startsWith('event:'))) fail('note scope')
    const item = record(value, 'note'); notes[scope] = { text: text(item.text, 'note text', 100_000), updatedAt: iso(item.updatedAt, 'note updated at') }
  }
  const findings = list(row.findings, 'findings', 5_000).map(value => { const item = record(value, 'finding'); return { id: text(item.id, 'finding id', 500, true), text: text(item.text, 'finding text', 10_000, true), sourceIds: list(item.sourceIds, 'source IDs', 100).map(value => text(value, 'source ID', 2_000, true)), reviewStatus: choice(item.reviewStatus, ['unreviewed', 'confirmed', 'rejected'], 'finding review'), createdAt: iso(item.createdAt, 'finding created at') } })
  const decisions = list(row.decisions, 'decisions', 5_000).map(value => { const item = record(value, 'decision'); return { id: text(item.id, 'decision id', 500, true), text: text(item.text, 'decision text', 10_000, true), evidenceIds: list(item.evidenceIds, 'evidence IDs', 100).map(value => text(value, 'evidence ID', 500, true)), reviewStatus: choice(item.reviewStatus, ['proposed', 'accepted', 'rejected'], 'decision review'), createdAt: iso(item.createdAt, 'decision created at') } })
  const meetings: ResearchState['meetings'] = {}
  for (const [id, value] of Object.entries(record(row.meetings, 'meetings'))) { const item = record(value, 'meeting'); if (item.source !== 'manual') fail('meeting source'); meetings[id] = { status: choice(item.status, ['booked', 'completed'], 'meeting status'), source: 'manual', updatedAt: iso(item.updatedAt, 'meeting updated at') } }
  const sync = record(row.sync, 'sync')
  return { schemaVersion: 1, campaign: { id: 'small-software', draft, draftUpdatedAt: iso(campaign.draftUpdatedAt, 'draft updated at'), revisions }, events: list(row.events, 'events', 5_000).map(parseResearchEvent), notes, findings, decisions, meetings, sync: { syncedAt: nullableIso(sync.syncedAt, 'synced at'), lastAttemptAt: nullableIso(sync.lastAttemptAt, 'last attempt'), lastSuccessfulSyncAt: nullableIso(sync.lastSuccessfulSyncAt, 'successful sync'), ...(sync.error ? { error: text(sync.error, 'sync error') } : {}), ...(sync.generation !== undefined ? { generation: parseGeneration(sync.generation) } : {}) } }
}
export function researchView(state: ResearchState, crm: NoelleCrmSnapshot | null): ResearchView {
  const latest = state.campaign.revisions.at(-1)
  const contacts = new Map((crm?.contacts ?? []).map(contact => [`${contact.platform}:${contact.id}`, contact]))
  const associated = new Set<string>()
  const supersededRequests = new Set(state.events.filter(event => event.draftId && event.requestId).map(event => event.requestId))
  const supersededDrafts = new Set<string>()
  for (const event of state.events) {
    if (event.supersedesRequestId) supersededRequests.add(event.supersedesRequestId)
    if (event.supersedesDraftId) supersededDrafts.add(event.supersedesDraftId)
  }
  const events = state.events.map(event => {
    const revision = state.campaign.revisions.find(item => item.version === event.briefVersion && item.hash === event.briefHash)
    const contact = contacts.get(`${event.platform}:${event.crmContactId}`)
    const conversation = contact?.conversations.find(item => item.id === event.conversationId)
    const message = event.nativeExternalId ? conversation?.messages.find(item => item.direction === 'outbound' && (item.externalId === event.nativeExternalId || item.id === event.nativeExternalId) && item.body === event.body && !!item.sentAt) : undefined
    const sameRecipient = !!contact && contact.profileUrl.replace(/\/$/, '').toLowerCase() === event.recipient.profileUrl.replace(/\/$/, '').toLowerCase()
    const verifiedSent = event.status === 'sent' && !!revision && !!message && sameRecipient
    if (verifiedSent && contact) associated.add(`${contact.platform}:${contact.id}`)
    const requiresReview = !verifiedSent && (!latest || latest.version !== event.briefVersion || latest.hash !== event.briefHash || event.review.status === 'needs_review')
    const superseded = !verifiedSent && (event.draftId ? supersededDrafts.has(event.draftId) : !!event.requestId && supersededRequests.has(event.requestId))
    return { ...event, verifiedSent, verifiedSentAt: verifiedSent ? message!.sentAt : null, requiresReview, superseded, verificationReason: event.status === 'sent' && !verifiedSent ? 'Send is not matched to this campaign brief and an exact native receipt in the confirmed CRM.' : null }
  })
  const sources = new Map<string, ResearchSource>()
  const linked = new Set<string>()
  for (const event of events) {
    sources.set(event.id, { id: event.id, kind: 'draft', label: `${event.recipient.name || event.recipient.handle} · ${event.draftId ? 'invitation draft' : 'request context'}`, preview: event.body.slice(0, 240) })
    for (const evidence of event.evidence) sources.set(evidence.id, { id: evidence.id, kind: 'context', label: evidence.source, preview: evidence.summary ?? '' })
    if (!event.verifiedSent) continue
    const contact = contacts.get(`${event.platform}:${event.crmContactId}`)!, conversation = contact.conversations.find(item => item.id === event.conversationId)!
    const threadKey = `${event.platform}:${conversation.id}`
    if (linked.has(threadKey)) continue
    linked.add(threadKey)
    for (const message of conversation.messages) {
      if (message.direction !== 'inbound') continue
      const id = `crm:${event.platform}:${conversation.id}:${message.id}`
      sources.set(id, { id, kind: 'reply', label: `${contact.name || contact.handle} · CRM reply`, preview: message.body.slice(0, 240), platform: event.platform, crmContactId: contact.id, conversationId: conversation.id, messageId: message.id })
    }
  }
  return { ...state, events, crmContacts: [...associated].map(key => contacts.get(key)!), sources: [...sources.values()] }
}

type ResearchDeps = { read(): Promise<ResearchState | null>; readCrm(): Promise<NoelleCrmSnapshot | null>; write(state: ResearchState): Promise<void>; now?(): string }
export class FounderResearchService {
  private queue: Promise<unknown> = Promise.resolve()
  private deps: ResearchDeps
  constructor(deps: ResearchDeps) { this.deps = deps }
  private serial<T>(fn: () => Promise<T>): Promise<T> { const next = this.queue.then(fn, fn); this.queue = next.then(() => undefined, () => undefined); return next }
  private now(): string { return this.deps.now?.() ?? new Date().toISOString() }
  private async load(): Promise<ResearchState> { const current = await this.deps.read(); if (current) return parseResearchState(current); const initial = createResearchState(this.now()); await this.deps.write(initial); return initial }
  read(): Promise<ResearchView> { return this.serial(async () => researchView(await this.load(), await this.deps.readCrm())) }
  action(raw: unknown): Promise<ResearchView> {
    return this.serial(async () => {
      const action = record(raw, 'action'), state = await this.load(), now = this.now()
      if (action.type === 'save_draft' || action.type === 'publish') {
        if (action.expectedUpdatedAt !== undefined && action.expectedUpdatedAt !== state.campaign.draftUpdatedAt) throw new ResearchConflictError('The brief changed. Reload it before saving or publishing.')
        if (action.type === 'save_draft') { state.campaign.draft = parseBriefDraft(action.draft); state.campaign.draftUpdatedAt = now }
        else {
          const prior = state.campaign.revisions.at(-1), draft = state.campaign.draft
          if (!prior || computeBriefHash(state.campaign.id, prior.version, draft) !== prior.hash) {
            if (state.campaign.revisions.length >= 1_000) fail('revision limit')
            const nextVersion = (prior?.version ?? 0) + 1
            state.campaign.revisions.push({ ...structuredClone(draft), schemaVersion: 1, campaignId: state.campaign.id, version: nextVersion, hash: computeBriefHash(state.campaign.id, nextVersion, draft), publishedAt: now })
          }
        }
      } else if (action.type === 'save_note') {
        const scope = text(action.scope, 'note scope', 600, true)
        if (scope !== 'campaign' && !state.events.some(event => scope === `event:${event.id}`)) fail('note scope')
        state.notes[scope] = { text: text(action.text, 'note text', 100_000), updatedAt: now }
      } else if (action.type === 'add_finding') {
        const sourceIds = list(action.sourceIds, 'source IDs', 100).map(value => text(value, 'source ID', 2_000, true))
        const known = new Set(state.events.flatMap(event => [event.id, event.requestId, event.draftId, ...event.evidence.map(item => item.id)]).filter(Boolean))
        for (const source of researchView(state, await this.deps.readCrm()).sources) known.add(source.id)
        if (!sourceIds.length || sourceIds.some(id => !known.has(id))) fail('finding source IDs')
        state.findings.push({ id: randomUUID(), text: text(action.text, 'finding text', 10_000, true), sourceIds, reviewStatus: choice(action.reviewStatus, ['unreviewed', 'confirmed', 'rejected'], 'finding review'), createdAt: now })
      } else if (action.type === 'add_decision') {
        const evidenceIds = list(action.evidenceIds, 'evidence IDs', 100).map(value => text(value, 'evidence ID', 500, true))
        if (!evidenceIds.length || evidenceIds.some(id => !state.findings.some(finding => finding.id === id))) fail('decision evidence IDs')
        state.decisions.push({ id: randomUUID(), text: text(action.text, 'decision text', 10_000, true), evidenceIds, reviewStatus: choice(action.reviewStatus, ['proposed', 'accepted', 'rejected'], 'decision review'), createdAt: now })
      } else if (action.type === 'review_finding') {
        const finding = state.findings.find(item => item.id === action.id)
        if (!finding) return fail('finding id')
        finding.reviewStatus = choice(action.reviewStatus, ['unreviewed', 'confirmed', 'rejected'], 'finding review')
      } else if (action.type === 'review_decision') {
        const decision = state.decisions.find(item => item.id === action.id)
        if (!decision) return fail('decision id')
        decision.reviewStatus = choice(action.reviewStatus, ['proposed', 'accepted', 'rejected'], 'decision review')
      } else if (action.type === 'set_meeting') {
        const id = text(action.eventId, 'event id', 500, true)
        if (!researchView(state, await this.deps.readCrm()).events.some(event => event.id === id && event.verifiedSent)) fail('meeting verified participant')
        state.meetings[id] = { status: choice(action.status, ['booked', 'completed'], 'meeting status'), source: 'manual', updatedAt: now }
      } else fail('action type')
      const next = parseResearchState(state)
      await this.deps.write(next)
      return researchView(next, await this.deps.readCrm())
    })
  }
  import(raw: unknown): Promise<{ ok: true; events: number; verifiedSent: number; syncedAt: string | null }> {
    const input = record(raw, 'import')
    if (input.schemaVersion !== 1 || input.source !== 'noelle' || input.campaignId !== 'small-software' || JSON.stringify(input).length > 20 * 1024 * 1024) fail('import source/schema/campaign/size')
    const syncedAt = iso(input.syncedAt, 'synced at'), status = record(input.status, 'import status')
    const incoming = list(input.events, 'events', 5_000).map(parseResearchEvent)
    if (new Set(incoming.map(event => event.id)).size !== incoming.length) fail('duplicate event IDs')
    const sync = { syncedAt, lastAttemptAt: iso(status.lastAttemptAt, 'last attempt'), lastSuccessfulSyncAt: nullableIso(status.lastSuccessfulSyncAt, 'successful sync'), ...(status.error ? { error: text(status.error, 'sync error') } : {}) }
    const generation = status.generation === undefined ? [] : parseGeneration(status.generation)
    return this.serial(async () => {
      const state = await this.load(), events = new Map(state.events.map(event => [event.id, event]))
      const verified = new Set(researchView(state, await this.deps.readCrm()).events.filter(event => event.verifiedSent).map(event => event.id))
      const freshSnapshot = !state.sync.syncedAt || syncedAt >= state.sync.syncedAt
      for (const event of incoming) {
        const prior = events.get(event.id)
        if (prior && !(event.updatedAt > prior.updatedAt || (event.updatedAt === prior.updatedAt && freshSnapshot))) continue
        const nextEvent = { ...event }
        for (const field of ['supersedesRequestId', 'supersedesDraftId'] as const) {
          if (prior?.[field] && event[field] && prior[field] !== event[field]) fail('immutable source lineage')
          if (prior?.[field]) nextEvent[field] = prior[field]
        }
        events.set(event.id, prior && verified.has(prior.id) ? { ...nextEvent, requestId: prior.requestId, draftId: prior.draftId, supersedesRequestId: prior.supersedesRequestId, supersedesDraftId: prior.supersedesDraftId, purpose: prior.purpose, briefVersion: prior.briefVersion, briefHash: prior.briefHash, platform: prior.platform, recipient: prior.recipient, body: prior.body, status: 'sent', nativeExternalId: prior.nativeExternalId, sentAt: prior.sentAt, crmContactId: prior.crmContactId, conversationId: prior.conversationId } : nextEvent)
      }
      state.events = [...events.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
      const generations = new Map((state.sync.generation ?? []).map(item => [item.platform, item]))
      for (const receipt of generation) {
        const prior = generations.get(receipt.platform)
        const diagnostic = isInvalidGenerationReceipt(prior) || isInvalidGenerationReceipt(receipt)
        if (diagnostic ? freshSnapshot : !prior || receipt.observedAt >= prior.observedAt) generations.set(receipt.platform, receipt)
      }
      if (freshSnapshot) state.sync = { ...sync, lastSuccessfulSyncAt: sync.lastSuccessfulSyncAt ?? state.sync.lastSuccessfulSyncAt }
      if (generations.size) state.sync.generation = [...generations.values()]
      const next = parseResearchState(state)
      await this.deps.write(next)
      const view = researchView(next, await this.deps.readCrm())
      return { ok: true, events: view.events.length, verifiedSent: view.events.filter(event => event.verifiedSent).length, syncedAt: view.sync.syncedAt }
    })
  }
}

function csvCell(value: unknown): string { let result = String(value ?? ''); if (/^[=+@\-\t\r]/.test(result)) result = "'" + result; return `"${result.replaceAll('"', '""')}"` }
export function researchArchiveFiles(state: ResearchState, crm: NoelleCrmSnapshot | null): Record<string, string> {
  const view = researchView(state, crm), files: Record<string, string> = { 'state.json': JSON.stringify(state, null, 2) + '\n' }
  const notes = ['# Small Software research notes', '', ...Object.entries(state.notes).flatMap(([scope, note]) => [`## ${scope.replace(/[\r\n]/g, ' ')}`, '', note.text, ''])]
  files['notes.md'] = notes.join('\n') + '\n'
  files['working-brief.md'] = [`# ${state.campaign.draft.title}`, '', 'Working draft — not a published invitation brief.', '', '## Audience', state.campaign.draft.audience, '', '## Objective', state.campaign.draft.objective, '', '## Questions', ...state.campaign.draft.questions.map(question => `- ${question}`), '', '## Invitation guidance', state.campaign.draft.invitationGuidance, ''].join('\n')
  files['findings-and-decisions.md'] = ['# Evidence and decisions', '', ...state.findings.flatMap(item => [`## Finding ${item.id}`, `Review: ${item.reviewStatus}`, `Sources: ${item.sourceIds.join(', ')}`, '', item.text, '']), ...state.decisions.flatMap(item => [`## Decision ${item.id}`, `Review: ${item.reviewStatus}`, `Findings: ${item.evidenceIds.join(', ')}`, '', item.text, ''])].join('\n') + '\n'
  for (const revision of state.campaign.revisions) files[`brief-v${revision.version}.json`] = JSON.stringify(revision, null, 2) + '\n'
  const columns = ['event_id', 'request_id', 'supersedes_request_id', 'draft_id', 'supersedes_draft_id', 'platform', 'name', 'handle', 'profile_url', 'stage', 'superseded', 'verified_sent', 'brief_version', 'brief_hash', 'crm_contact_id', 'conversation_id', 'native_external_id', 'meeting_status']
  files['contacts.csv'] = [columns.map(csvCell).join(','), ...view.events.map(event => [event.id, event.requestId, event.supersedesRequestId, event.draftId, event.supersedesDraftId, event.platform, event.recipient.name, event.recipient.handle, event.recipient.profileUrl, event.status, event.superseded, event.verifiedSent, event.briefVersion, event.briefHash, event.crmContactId, event.conversationId, event.nativeExternalId, state.meetings[event.id]?.status].map(csvCell).join(','))].join('\r\n') + '\r\n'
  return files
}
