import type { ResearchDmDecision, ResearchEventView } from './founder-research-model.js'

const OUTCOME_STATUSES = ['waiting', 'applied', 'failed'] as const
const MAX_ACK_RESULTS = 500

type Result<T> = { ok: true; value: T } | { ok: false; reason: string }

/**
 * Records the operator's decision for one staged DM. The exact body and recipient
 * shown on screen are snapshotted so Noelle approves only what was reviewed.
 * X approval stays in the X DM tracker's exact batch; X DMs can only be skipped here.
 */
export function decideDm(event: ResearchEventView | undefined, prior: ResearchDmDecision | undefined,
  decision: unknown, now: string): Result<ResearchDmDecision> {
  if (decision !== 'approve' && decision !== 'skip') return { ok: false, reason: 'DM decision' }
  if (!event || !event.draftId || !event.review.id) return { ok: false, reason: 'DM decision event' }
  if (event.verifiedSent || event.superseded || event.status !== 'pending_review' || event.review.status !== 'pending')
    return { ok: false, reason: 'DM decision state' }
  if (!event.body.trim()) return { ok: false, reason: 'DM decision body' }
  if (decision === 'approve' && event.platform !== 'linkedin') return { ok: false, reason: 'DM decision platform' }
  if (prior?.outcome?.status === 'applied') return { ok: false, reason: 'DM decision already applied' }
  return { ok: true, value: {
    eventId: event.id, approvalId: event.review.id, draftId: event.draftId, platform: event.platform,
    decision, exactBody: event.body, recipientHandle: event.recipient.handle, decidedAt: now, outcome: null,
  } }
}

/** Decisions Noelle still has to apply: new ones and ones it is waiting to apply. */
export function unappliedDmDecisions(decisions: Record<string, ResearchDmDecision>): ResearchDmDecision[] {
  return Object.values(decisions).filter(item => !item.outcome || item.outcome.status === 'waiting')
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
}

/**
 * Applies Noelle's results. A result counts only for the decision it was read from:
 * a decision changed after Noelle read it keeps waiting for its own result.
 */
export function acknowledgeDmDecisions(decisions: Record<string, ResearchDmDecision>, raw: unknown, now: string): Result<number> {
  const results = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { results?: unknown }).results : undefined
  if (!Array.isArray(results) || results.length > MAX_ACK_RESULTS) return { ok: false, reason: 'DM decision results' }
  let applied = 0
  for (const value of results) {
    const item = value && typeof value === 'object' ? value as Record<string, unknown> : null
    const status = item?.status
    if (!item || typeof item.eventId !== 'string' || typeof item.decidedAt !== 'string'
      || !OUTCOME_STATUSES.includes(status as typeof OUTCOME_STATUSES[number])
      || (item.reason != null && (typeof item.reason !== 'string' || item.reason.length > 500)))
      return { ok: false, reason: 'DM decision result' }
    const current = decisions[item.eventId]
    if (!current || current.decidedAt !== item.decidedAt || current.outcome?.status === 'applied') continue
    current.outcome = { status: status as typeof OUTCOME_STATUSES[number], reason: (item.reason as string | null | undefined) ?? null, at: now }
    applied++
  }
  return { ok: true, value: applied }
}

export function parseDmDecisions(raw: unknown, fail: (field: string) => never): Record<string, ResearchDmDecision> {
  if (raw === undefined) return {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('DM decisions')
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > 5_000) return fail('DM decisions')
  const out: Record<string, ResearchDmDecision> = {}
  const str = (value: unknown, field: string, max: number) => typeof value === 'string' && value.length <= max && value.trim() ? value : fail(field)
  for (const [eventId, value] of entries) {
    const item = value && typeof value === 'object' ? value as Record<string, unknown> : fail('DM decision')
    const outcome = item.outcome == null ? null : item.outcome as Record<string, unknown>
    if (item.eventId !== eventId || !['approve', 'skip'].includes(item.decision as string) || !['x', 'linkedin'].includes(item.platform as string))
      fail('DM decision')
    if (outcome && (!OUTCOME_STATUSES.includes(outcome.status as typeof OUTCOME_STATUSES[number]) || typeof outcome.at !== 'string'
      || (outcome.reason != null && typeof outcome.reason !== 'string'))) fail('DM decision outcome')
    out[eventId] = {
      eventId, approvalId: str(item.approvalId, 'DM decision approval', 500), draftId: str(item.draftId, 'DM decision draft', 500),
      platform: item.platform as ResearchDmDecision['platform'], decision: item.decision as ResearchDmDecision['decision'],
      exactBody: str(item.exactBody, 'DM decision body', 100_000), recipientHandle: str(item.recipientHandle, 'DM decision recipient', 500),
      decidedAt: str(item.decidedAt, 'DM decision time', 100),
      outcome: outcome ? { status: outcome.status as typeof OUTCOME_STATUSES[number], reason: (outcome.reason as string | null | undefined) ?? null, at: outcome.at as string } : null,
    }
  }
  return out
}
