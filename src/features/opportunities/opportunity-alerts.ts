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
import { ALL_MODES, scoreOpportunity } from './opportunity-score.ts'
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

