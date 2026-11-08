/**
 * Opportunity alerts: compare the radar against the last state Cortex saw, turn
 * meaningful changes into immutable, deduplicated alerts, and decide what a delivery
 * (Kaiser's scheduled check) should send. Pure state transitions over the
 * cortex-opportunity-alerts store; scripts/opportunity-alerts.mjs does the I/O.
 *
 * Events: a new open opportunity, a tracked one opening, a closed one reopening, new
 * material support, a material deadline move (earlier = urgent), and a verified
 * deadline within 7 days. The first reconcile only records snapshots (silent baseline).
 */

import { daysUntilDeadline } from './expiry.ts'
import type { ApplicationStatus, Opportunity, OppStatus } from './opportunity-model.ts'
import { buildCard, renderCard, type AlertCard } from './opportunity-alert-card.ts'
import { SUPPORT_LABEL, supportKeysOf, type SupportKey } from './opportunity-funding.ts'
import { scoreOpportunity } from './opportunity-score.ts'
import type { TravelReadiness } from './travel-readiness.ts'
import {
  applicationStatusOf, daysLeft, deadlineConfidenceOf, isLiveStatus,
} from './opportunity-window.ts'

export const ALERTS_KEY = 'cortex-opportunity-alerts'

/** Urgent alerts cover verified deadlines within this many days. */
export const URGENT_DAYS = 7
/** The weekly digest goes out at most this often, with at most DIGEST_MAX opportunities. */
export const DIGEST_EVERY_DAYS = 6
export const DIGEST_MAX = 5
/** Later deadline moves smaller than this are noise; earlier moves always count. */
const LATER_SHIFT_DAYS = 7
const KEEP_FINISHED_ALERTS = 300
const KEEP_HISTORY = 5000

export type AlertType = 'new_open' | 'opened' | 'reopened' | 'support_added' | 'deadline_changed' | 'deadline_soon'
export type AlertPriority = 'urgent' | 'digest'
export type AlertState = 'pending' | 'delivered' | 'expired'

export interface OppSnapshot {
  status: ApplicationStatus
  deadline: string | null
  opensAt: string | null
  support: SupportKey[]
  /** Whether any funding fact was known; new support only counts against a known baseline. */
  supportKnown: boolean
  lastVerified: string | null
  runId: string | null
}

export interface AlertDelivery { at: string; channel: string; ok: boolean; note?: string }

export interface OpportunityAlert {
  id: string
  dedupeKey: string
  type: AlertType
  priority: AlertPriority
  opportunityId: string
  createdAt: string
  runId: string | null
  /** Best-mode profile score at creation (+ premium boost); ranks the digest. */
  rank: number
  card: AlertCard
  text: string
  // Delivery state: the only fields that change after creation.
  state: AlertState
  deliveries: AlertDelivery[]
  deliveredAt?: string | null
  expiredAt?: string | null
  expiredReason?: string | null
}

export interface AlertStore {
  version: 1
  /** Set by the first reconcile, which records snapshots and sends nothing. */
  baselineAt: string | null
  lastCheckAt: string | null
  lastDigestAt: string | null
  snapshots: Record<string, OppSnapshot>
  alerts: OpportunityAlert[]
  /** Notification history: dedupe key -> when it first fired. Outlives pruned alerts. */
  sent: Record<string, string>
}

export const emptyAlertStore = (): AlertStore => ({
  version: 1, baselineAt: null, lastCheckAt: null, lastDigestAt: null, snapshots: {}, alerts: [], sent: {},
})

export function normalizeAlertStore(raw: unknown): AlertStore {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AlertStore>
  return {
    version: 1,
    baselineAt: typeof r.baselineAt === 'string' ? r.baselineAt : null,
    lastCheckAt: typeof r.lastCheckAt === 'string' ? r.lastCheckAt : null,
    lastDigestAt: typeof r.lastDigestAt === 'string' ? r.lastDigestAt : null,
    snapshots: r.snapshots && typeof r.snapshots === 'object' ? r.snapshots : {},
    alerts: Array.isArray(r.alerts) ? r.alerts.filter((a) => a && typeof a.id === 'string') : [],
    sent: r.sent && typeof r.sent === 'object' ? r.sent : {},
  }
}

// ── Detection ────────────────────────────────────────────────────────────────

export function snapshotOf(o: Opportunity, today: string): OppSnapshot {
  const i = o.intel
  const known = [i?.cashUsd, i?.stipendUsd, i?.travelCovered, i?.travelCapUsd, i?.housingCovered, i?.mealsCovered, i?.visaSupport]
  return {
    status: applicationStatusOf(o, today),
    deadline: o.deadline ?? null,
    opensAt: o.opensAt ?? null,
    support: supportKeysOf(o),
    supportKnown: known.some((v) => v != null),
    lastVerified: o.lastVerified ?? null,
    runId: o.runId ?? null,
  }
}

const USER_CLOSED: OppStatus[] = ['archived', 'won', 'lost', 'applied']

/** Worth interrupting him for: not closed out by him, and premium, pursued, or passing the profile. */
export function alertWorthy(o: Opportunity, today: string): boolean {
  if (USER_CLOSED.includes(o.status)) return false
  if (o.premium || o.status === 'pursuing') return true
  return scoreOpportunity(o, today).keep
}

interface Detected { type: AlertType; key: string; shift?: number; from?: string; added?: SupportKey[] }

export function detectEvents(prev: OppSnapshot | undefined, cur: OppSnapshot, o: Opportunity, today: string): Detected[] {
  const events: Detected[] = []
  const live = isLiveStatus(cur.status)
  const cycle = cur.deadline ?? cur.opensAt ?? cur.status
  if (!prev) {
    // Something he added himself is not news to him.
    if (live && o.source !== 'manual') events.push({ type: 'new_open', key: `new:${o.id}` })
  } else {
    // A snapshot taken while open is closed once its deadline passes.
    const was: ApplicationStatus = prev.status === 'open' && prev.deadline && prev.deadline < today ? 'closed' : prev.status
    if (live && !isLiveStatus(was)) {
      events.push(was === 'closed'
        ? { type: 'reopened', key: `reopened:${o.id}:${cycle}` }
        : { type: 'opened', key: `opened:${o.id}:${cycle}` })
    }
    const reverified = cur.lastVerified !== prev.lastVerified || cur.runId !== prev.runId
    if (reverified && prev.supportKnown && (live || cur.status === 'upcoming')) {
      const added = cur.support.filter((k) => !prev.support.includes(k))
      if (added.length) events.push({ type: 'support_added', key: `support:${o.id}:${added.join('+')}`, added })
    }
    if (reverified && live && isLiveStatus(was) && prev.deadline && cur.deadline && prev.deadline !== cur.deadline) {
      const shift = daysUntilDeadline(cur.deadline, prev.deadline)
      if (shift !== null && (shift < 0 || shift >= LATER_SHIFT_DAYS)) {
        events.push({ type: 'deadline_changed', key: `deadline:${o.id}:${prev.deadline}>${cur.deadline}`, shift, from: prev.deadline })
      }
    }
  }
  const days = daysLeft(o, today)
  if (cur.status === 'open' && days !== null && days >= 0 && days <= URGENT_DAYS && deadlineConfidenceOf(o, today) === 'verified') {
    events.push({ type: 'deadline_soon', key: `soon:${o.id}:${o.deadline}` })
  }
  return events
}

// ── Alerts ───────────────────────────────────────────────────────────────────

function headlineOf(ev: Detected, o: Opportunity, today: string): string {
  switch (ev.type) {
    case 'new_open': return `New opportunity: ${o.title}`
    case 'opened': return `Applications now open: ${o.title}`
    case 'reopened': return `Reopened: ${o.title}`
    case 'support_added':
      return `New support for ${o.title}: ${(ev.added ?? []).map((k) => SUPPORT_LABEL[k]).join(', ')}`
    case 'deadline_changed':
      return (ev.shift ?? 0) < 0
        ? `Deadline moved earlier: ${o.title} (${ev.from} to ${o.deadline})`
        : `Deadline moved later: ${o.title} (${ev.from} to ${o.deadline})`
    case 'deadline_soon': {
      const d = daysLeft(o, today) ?? 0
      return `Deadline ${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}: ${o.title}`
    }
  }
}

function priorityOf(ev: Detected, card: AlertCard): AlertPriority {
  // He cannot act on a blocked trip or a rule he fails; never interrupt for those.
  if (card.action === 'Skip') return 'digest'
  if (ev.type === 'deadline_soon') return 'urgent'
  if (ev.type === 'deadline_changed' && (ev.shift ?? 0) < 0) return 'urgent'
  const d = card.deadline
  return d.confidence === 'verified' && d.daysLeft !== null && d.daysLeft >= 0 && d.daysLeft <= URGENT_DAYS ? 'urgent' : 'digest'
}

const rankOf = (o: Opportunity, today: string) => scoreOpportunity(o, today).best + (o.premium ? 20 : 0)

/** Short stable id from the dedupe key (FNV-1a), so a re-created alert keeps its id. */
function alertId(key: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0
  return `oa-${h.toString(36)}-${key.length.toString(36)}`
}

function expireReason(a: OpportunityAlert, o: Opportunity | undefined, today: string): string | null {
  if (!o) return 'removed from the radar'
  if (USER_CLOSED.includes(o.status)) return `marked ${o.status}`
  if (applicationStatusOf(o, today) === 'closed') return 'applications closed'
  if (a.type === 'deadline_soon' && a.card.deadline.date !== (o.deadline ?? null)) return 'deadline changed'
  return null
}

export interface ReconcileInput {
  store: unknown
  items: Opportunity[]
  readiness: TravelReadiness
  today: string
  now: string
  runId?: string | null
}

export interface ReconcileResult {
  store: AlertStore
  created: OpportunityAlert[]
  expired: number
  baseline: boolean
}

/**
 * One check: snapshot every item, emit alerts for new events (never twice for the same
 * dedupe key), expire pending alerts that can no longer be acted on, prune history.
 */
export function reconcileAlerts({ store, items, readiness, today, now, runId = null }: ReconcileInput): ReconcileResult {
  const s = normalizeAlertStore(store)
  const baseline = !s.baselineAt
  const snapshots: Record<string, OppSnapshot> = {}
  const sent = { ...s.sent }
  const created: OpportunityAlert[] = []

  for (const o of items) {
    if (!o || typeof o.id !== 'string') continue
    const cur = snapshotOf(o, today)
    snapshots[o.id] = cur
    if (baseline || !alertWorthy(o, today)) continue
    for (const ev of detectEvents(s.snapshots[o.id], cur, o, today)) {
      if (sent[ev.key]) continue
      sent[ev.key] = now
      const card = buildCard(o, headlineOf(ev, o, today), readiness, today)
      created.push({
        id: alertId(ev.key), dedupeKey: ev.key, type: ev.type, priority: priorityOf(ev, card),
        opportunityId: o.id, createdAt: now, runId, rank: rankOf(o, today), card, text: renderCard(card),
        state: 'pending', deliveries: [],
      })
    }
  }

  const byId = new Map(items.filter((o) => o && typeof o.id === 'string').map((o) => [o.id, o]))
  let expired = 0
  const alerts = [...created, ...s.alerts].map((a) => {
    if (a.state !== 'pending') return a
    const reason = expireReason(a, byId.get(a.opportunityId), today)
    if (!reason) return a
    expired++
    return { ...a, state: 'expired' as const, expiredAt: now, expiredReason: reason }
  })
  const pending = alerts.filter((a) => a.state === 'pending')
  const finished = alerts.filter((a) => a.state !== 'pending').slice(0, KEEP_FINISHED_ALERTS)
  const history = Object.entries(sent).sort((a, b) => b[1].localeCompare(a[1])).slice(0, KEEP_HISTORY)

  return {
    store: {
      ...s,
      baselineAt: s.baselineAt ?? now,
      lastCheckAt: now,
      snapshots,
      alerts: [...pending, ...finished],
      sent: Object.fromEntries(history),
    },
    created,
    expired,
    baseline,
  }
}

// ── Delivery ─────────────────────────────────────────────────────────────────

export type DeliveryMode = 'auto' | 'urgent' | 'all'

export interface DeliveryGroup {
  opportunityId: string
  priority: AlertPriority
  rank: number
  /** Recommended action is Skip (blocked trip, failed rule): shown last, never displaces an actionable pick. */
  skip: boolean
  alertIds: string[]
  text: string
}

export interface Delivery {
  hasAlerts: boolean
  digestDue: boolean
  urgent: DeliveryGroup[]
  digest: DeliveryGroup[]
  /** Pending digest opportunities beyond DIGEST_MAX: summarized as a count, acked with the digest. */
  overflowIds: string[]
  /** Every alert id the message covers; pass these to ack. */
  alertIds: string[]
  message: string
}

/** Which headline leads a card when one opportunity has several alerts (the rest go under "Also"). */
const TYPE_ORDER: AlertType[] = ['new_open', 'reopened', 'opened', 'deadline_changed', 'deadline_soon', 'support_added']

function groupsOf(alerts: OpportunityAlert[]): DeliveryGroup[] {
  const byOpp = new Map<string, OpportunityAlert[]>()
  for (const a of alerts) byOpp.set(a.opportunityId, [...(byOpp.get(a.opportunityId) ?? []), a])
  return [...byOpp.entries()].map(([opportunityId, list]) => {
    const sorted = [...list].sort((a, b) =>
      (a.priority === b.priority ? 0 : a.priority === 'urgent' ? -1 : 1)
      || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
      || b.createdAt.localeCompare(a.createdAt))
    const lead = sorted[0]
    return {
      opportunityId,
      priority: sorted.some((a) => a.priority === 'urgent') ? 'urgent' : 'digest',
      rank: Math.max(...sorted.map((a) => a.rank)),
      skip: lead.card.action === 'Skip',
      alertIds: sorted.map((a) => a.id),
      text: renderCard(lead.card, sorted.slice(1).map((a) => a.card.headline)),
    }
  })
}

const daysBetween = (fromIso: string, toIso: string) => (Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000

/**
 * What a check should send. Urgent groups always; the digest when it is due (auto:
 * at most once every DIGEST_EVERY_DAYS) or requested (all), top DIGEST_MAX by rank.
 */
export function selectDelivery(storeRaw: unknown, now: string, mode: DeliveryMode = 'auto', max = DIGEST_MAX): Delivery {
  const s = normalizeAlertStore(storeRaw)
  const groups = groupsOf(s.alerts.filter((a) => a.state === 'pending'))
    .sort((a, b) => Number(a.skip) - Number(b.skip) || b.rank - a.rank)
  const urgent = groups.filter((g) => g.priority === 'urgent')
  const digestDue = mode === 'all' || (mode === 'auto' && (!s.lastDigestAt || daysBetween(s.lastDigestAt, now) >= DIGEST_EVERY_DAYS))
  const pendingDigest = digestDue ? groups.filter((g) => g.priority === 'digest') : []
  const digest = pendingDigest.slice(0, Math.max(0, max))
  const overflowIds = pendingDigest.slice(digest.length).flatMap((g) => g.alertIds)
  const alertIds = [...urgent, ...digest].flatMap((g) => g.alertIds).concat(overflowIds)
  const hasAlerts = urgent.length + digest.length > 0

  const parts: string[] = []
  if (urgent.length) parts.push('URGENT: verified deadlines within 7 days or moved earlier', ...urgent.map((g) => g.text))
  if (digest.length) parts.push(`This week: top ${digest.length} of ${pendingDigest.length}`, ...digest.map((g) => g.text))
  if (overflowIds.length) parts.push(`+${pendingDigest.length - digest.length} more on the Cortex Opportunity Radar.`)
  return {
    hasAlerts, digestDue, urgent, digest, overflowIds, alertIds,
    message: hasAlerts ? parts.join('\n\n') : 'No new opportunity alerts.',
  }
}

export interface AckInput { ids: string[]; delivered: boolean; channel: string; note?: string; now: string }
export interface AckResult { store: AlertStore; acked: string[]; failed: string[]; already: string[]; unknown: string[] }

/**
 * Record a delivery attempt. delivered=true moves pending alerts to delivered (idempotent);
 * delivered=false only logs the failed attempt, so the alerts stay queued for the next check.
 */
export function ackAlerts(storeRaw: unknown, { ids, delivered, channel, note, now }: AckInput): AckResult {
  const s = normalizeAlertStore(storeRaw)
  const want = new Set(ids)
  const result: Omit<AckResult, 'store'> = { acked: [], failed: [], already: [], unknown: [] }
  // Same grouping as selectDelivery: an opportunity with any urgent alert went out in the
  // urgent section, so acking its digest-priority alerts is not a weekly digest.
  const urgentOpps = new Set(s.alerts
    .filter((a) => want.has(a.id) && a.state === 'pending' && a.priority === 'urgent')
    .map((a) => a.opportunityId))
  let digestSent = false
  const alerts = s.alerts.map((a) => {
    if (!want.has(a.id)) return a
    want.delete(a.id)
    if (a.state !== 'pending') { result.already.push(a.id); return a }
    const attempt: AlertDelivery = { at: now, channel, ok: delivered, ...(note ? { note: note.slice(0, 300) } : {}) }
    if (!delivered) { result.failed.push(a.id); return { ...a, deliveries: [...a.deliveries, attempt] } }
    result.acked.push(a.id)
    if (a.priority === 'digest' && !urgentOpps.has(a.opportunityId)) digestSent = true
    return { ...a, state: 'delivered' as const, deliveredAt: now, deliveries: [...a.deliveries, attempt] }
  })
  result.unknown = [...want]
  return { store: { ...s, alerts, lastDigestAt: digestSent ? now : s.lastDigestAt }, ...result }
}
