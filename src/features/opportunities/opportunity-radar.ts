/**
 * Radar view rules: the few filters, the Apply / Applied / Watchlist / Hidden split,
 * countdown labels and fact chips. Pure functions over opportunity records; ranking and
 * eligibility come from opportunity-score.ts, the page owns store access.
 */

import { daysUntilDeadline } from './expiry'
import { deadlineTypeOf, type ChipVariant, type Opportunity } from './opportunity-model'
import {
  isApplyNow, isInPerson, scoreOpportunity, type FundingClass, type Mode, type Scored,
} from './opportunity-score'

// ── Dates and money ──────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
}

/** '$62.5k grant' style short money: 1500 -> $1.5k, 62500 -> $63k, 1000000 -> $1M. */
export function fmtAmount(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${n}`
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** Squeeze a freeform nextWindowExpected into a chip-sized hint ("opens ~Sep 2026"). */
function windowHint(s: string | null | undefined): string | null {
  if (!s) return null
  const tokens = s.split(/[\s,;()]+/)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const low = t.toLowerCase().replace(/[^a-z]/g, '')
    const mi = MONTHS.indexOf(low.slice(0, 3))
    if (mi === -1 || low.length < 3) continue
    const year = /^20\d\d$/.test(tokens[i + 1] || '') ? tokens[i + 1] : null
    if (/^[A-Z]/.test(t) || year) {
      const label = MONTHS[mi][0].toUpperCase() + MONTHS[mi].slice(1)
      return `opens ~${label}${year ? ` ${year}` : ''}`
    }
  }
  const y = s.match(/\b20\d\d\b/)?.[0]
  return y ? `opens ~${y}` : null
}

export interface Countdown { text: string; variant: ChipVariant; outline?: boolean; title?: string }

/** Countdown chip content for a row (semantic tone by urgency). */
export function countdownOf(o: Opportunity, today: string): Countdown {
  const dt = deadlineTypeOf(o)
  if (dt === 'rolling') return { text: 'rolling', variant: 'accent', outline: true }
  if (dt === 'always-open') return { text: 'always open', variant: 'accent', outline: true }
  const d = daysUntilDeadline(o.deadline, today)
  if (d !== null && d >= 0) {
    if (d <= 7) return { text: `D-${d}`, variant: 'danger', title: fmtDate(o.deadline) }
    if (d <= 21) return { text: `D-${d}`, variant: 'warning', title: fmtDate(o.deadline) }
    return { text: fmtDate(o.deadline), variant: 'neutral' }
  }
  const hint = windowHint(o.nextWindowExpected)
  if (hint) return { text: hint, variant: 'neutral', title: o.nextWindowExpected ?? undefined }
  if (d !== null) return { text: `closed ${fmtDate(o.deadline)}`, variant: 'neutral' }
  return { text: dt === 'recurring' ? 'recurring' : 'no date', variant: 'neutral' }
}

// ── Filters (the only ones: where, money, time) ──────────────────────────────

export type RadarFilter = 'remote' | 'in-person' | 'funded' | 'soon'
export const RADAR_FILTERS: { key: RadarFilter; label: string; test: (o: Opportunity, s: Scored) => boolean }[] = [
  { key: 'remote', label: 'Remote', test: (o) => !isInPerson(o) },
  { key: 'in-person', label: 'In person', test: (o) => isInPerson(o) },
  { key: 'funded', label: 'Funded', test: (_, s) => s.funding === 'full' || s.funding === 'mostly' },
  { key: 'soon', label: 'Closing ≤21d', test: (_, s) => s.urgency === 'urgent' || s.urgency === 'high' },
]

// ── Sections ─────────────────────────────────────────────────────────────────

export interface Row { o: Opportunity; s: Scored }
export interface RadarView { apply: Row[]; applied: Row[]; watchlist: Row[]; hidden: Row[] }

/**
 * Split items into what to apply to now, what he applied to, what to watch for the next
 * cycle, and what the profile hides (with its reason). A closed deadline never lands in
 * Apply. Each list ranks by the mode's score.
 */
export function radarView(items: Opportunity[], today: string, mode: Mode, filters: RadarFilter[] = []): RadarView {
  const view: RadarView = { apply: [], applied: [], watchlist: [], hidden: [] }
  const active = RADAR_FILTERS.filter((f) => filters.includes(f.key))
  for (const o of items) {
    const s = scoreOpportunity(o, today, mode)
    if (!active.every((f) => f.test(o, s))) continue
    const row = { o, s }
    if (o.status === 'applied') view.applied.push(row)
    else if (o.status === 'archived' || o.status === 'won' || o.status === 'lost' || (o.status === 'new' && !s.keep)) view.hidden.push(row)
    else if (isApplyNow(s.urgency)) view.apply.push(row)
    else view.watchlist.push(row)
  }
  const byScore = (a: Row, b: Row) => b.s.score - a.s.score
  view.apply.sort(byScore)
  view.applied.sort(byScore)
  view.watchlist.sort(byScore)
  view.hidden.sort(byScore)
  return view
}

/** Why a hidden row is hidden, in a few words. */
export function hiddenLabel(r: Row): string {
  const { o, s } = r
  if (o.status === 'won' || o.status === 'lost') return o.status
  return o.hiddenReason || s.reasons.join(', ') || 'archived'
}

// ── Chips ────────────────────────────────────────────────────────────────────

export const FUNDING_CHIP: Record<FundingClass, ChipVariant | null> = {
  full: 'success', mostly: 'accent', partial: 'neutral', none: null, unknown: null,
}

/** Where it happens, chip-sized: "Remote" or the city. */
export function placeLabel(o: Opportunity): string {
  if (!isInPerson(o)) return 'Remote'
  const place = (o.intel?.city || o.location).split(/[,;(/]| or /)[0].trim() || 'In person'
  return place.length > 16 ? `${place.slice(0, 15)}…` : place
}

/** The research facts worth a glance, for the expanded row. */
export function factChips(o: Opportunity): string[] {
  const i = o.intel
  if (!i) return []
  const days = i.durationDays
  return [
    i.travelCovered ? 'Travel covered' : i.travelCapUsd ? `Travel up to ${fmtAmount(i.travelCapUsd)}` : null,
    i.housingCovered ? 'Housing covered' : null,
    i.cashUsd ? `${fmtAmount(i.cashUsd)} grant` : null,
    i.stipendUsd ? `${fmtAmount(i.stipendUsd)} stipend` : null,
    i.investmentUsd ? `${fmtAmount(i.investmentUsd)} invest${i.equityPct ? ` · ${i.equityPct}%` : ''}` : null,
    i.feeUsd ? `${fmtAmount(i.feeUsd)} fee` : null,
    days != null ? (days >= 60 ? `${Math.round(days / 30)} months` : `${days} days`) : null,
    i.relocation ? 'Relocation' : null,
    i.leaveUniversity ? 'Leave school' : null,
    i.ideaStageOk ? 'Idea stage ok' : null,
    i.tractionRequired ? 'Needs traction' : null,
    i.companyRequired ? 'Needs company' : null,
    i.probability != null ? `~${Math.round(i.probability * 100)}% odds` : i.selectivity,
    i.effortHours != null ? `~${i.effortHours}h to apply` : null,
    o.lastVerified ? `Verified ${fmtDate(o.lastVerified)}` : null,
  ].filter((x): x is string => Boolean(x))
}
