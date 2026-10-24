/**
 * Radar view rules: geography buckets, kind groups, urgency sections, countdown
 * labels, hunt-order matching, and the top-picks ranking. Pure functions over
 * opportunity records; the page composes them and owns store access.
 */

import { daysUntilDeadline } from './expiry'
import {
  categoryOf, deadlineTypeOf, eligibilityOf, priorityOf,
  type ChipVariant, type ObjectiveParsed, type Opportunity, type OpportunityCategory,
} from './opportunity-model'

// ── Region (geography) — distinct from modality (venue) and eligibility (who can apply) ──

export type Region = 'colombia' | 'latam' | 'usa' | 'europe' | 'asia' | 'online' | 'other'
export const regionConfig: Record<Region, { label: string; match: string[] }> = {
  colombia: { label: 'Colombia', match: ['colombia', 'medellin', 'bogota', 'cali', 'barranquilla', 'cartagena', 'bucaramanga', 'pereira', 'manizales'] },
  latam: { label: 'LatAm', match: ['latam', 'latin america', 'latinoamerica', 'mexico', 'brasil', 'brazil', 'argentina', 'chile', 'peru', 'ecuador', 'uruguay', 'bolivia', 'paraguay', 'venezuela', 'guatemala', 'costa rica', 'panama', 'dominican'] },
  usa: { label: 'USA', match: ['united states', ' usa', 'u.s.', 'san francisco', 'new york', 'boston', 'seattle', 'austin', 'silicon valley', 'california', 'chicago', 'los angeles'] },
  europe: { label: 'Europe', match: ['europe', 'london', 'berlin', 'paris', 'madrid', 'barcelona', 'amsterdam', 'lisbon', 'portugal', 'united kingdom', ' uk', 'germany', 'france', 'spain', 'netherlands', 'dublin', 'zurich', 'munich'] },
  asia: { label: 'Asia', match: ['asia', 'india', 'bangalore', 'bengaluru', 'singapore', 'tokyo', 'japan', 'china', 'shenzhen', 'hong kong', 'dubai', 'uae', 'seoul', 'jakarta'] },
  online: { label: 'Online', match: ['online', 'remote', 'virtual', 'global', 'worldwide', 'anywhere'] },
  other: { label: 'Other', match: [] },
}
/** Most-specific region wins: Colombia > LatAm > a named country > Online. */
export const REGION_ORDER: Region[] = ['colombia', 'latam', 'usa', 'europe', 'asia', 'online', 'other']

const deburr = (s: string) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** The most specific region named in free text, or null when none is. */
export function regionForText(text: string): Region | null {
  const hay = deburr(text)
  return REGION_ORDER.find((r) => r !== 'other' && regionConfig[r].match.some((m) => hay.includes(m))) ?? null
}

export const regionOf = (o: Opportunity): Region =>
  regionForText(`${o.location} ${o.title} ${o.host} ${(o.tags || []).join(' ')}`) ?? 'other'

// ── Kind groups (the segmented filter: programs vs funding vs compete vs career) ──

export type KindGroup = 'all' | 'programs' | 'funding' | 'compete' | 'career' | 'other'
export const KIND_GROUPS: Record<Exclude<KindGroup, 'all'>, { label: string; categories: OpportunityCategory[] }> = {
  programs: { label: 'Programs', categories: ['program', 'fellowship', 'accelerator', 'residency'] },
  funding: { label: 'Funding', categories: ['grant', 'scholarship'] },
  compete: { label: 'Compete', categories: ['hackathon', 'competition', 'pitch'] },
  career: { label: 'Career', categories: ['internship', 'exchange'] },
  other: { label: 'Other', categories: ['speaking', 'community', 'launch', 'trending', 'research', 'other'] },
}
export const kindGroupFor = (c: OpportunityCategory): KindGroup =>
  (Object.keys(KIND_GROUPS) as Exclude<KindGroup, 'all'>[]).find((g) => KIND_GROUPS[g].categories.includes(c)) ?? 'other'

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

/** Was this item discovered within the last 7 days? (drives the "New this week" KPI) */
export function isNewThisWeek(o: Opportunity, now = Date.now()): boolean {
  return !!o.discoveredAt && (now - new Date(o.discoveredAt).getTime()) < 7 * 86_400_000
}

/** Rolling and always-open windows have no deadline to count down to. */
export function isOpenWindow(o: Opportunity): boolean {
  const dt = deadlineTypeOf(o)
  return dt === 'rolling' || dt === 'always-open'
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

// ── Urgency sections — the core deadline-intelligence view ───────────────────

export type SectionKey = 'week' | 'month' | 'later' | 'rolling' | 'upcoming' | 'nodate' | 'closed'
const SECTION_META: Record<SectionKey, { title: string; tone: string; dim?: boolean }> = {
  week: { title: 'Closing this week', tone: 'text-destructive' },
  month: { title: 'Closing this month', tone: 'text-warning' },
  later: { title: 'Closing later', tone: 'text-muted-foreground' },
  rolling: { title: 'Rolling · always open', tone: 'text-accent' },
  upcoming: { title: 'Upcoming windows', tone: 'text-muted-foreground' },
  nodate: { title: 'No date intel', tone: 'text-muted-foreground' },
  closed: { title: 'Recently closed', tone: 'text-muted-foreground', dim: true },
}
const SECTION_ORDER: SectionKey[] = ['week', 'month', 'later', 'rolling', 'upcoming', 'nodate', 'closed']

export function sectionOf(o: Opportunity, today: string): SectionKey {
  if (isOpenWindow(o)) return 'rolling'
  const dt = deadlineTypeOf(o)
  const d = daysUntilDeadline(o.deadline, today)
  if (d !== null) {
    if (d < 0) {
      // A recurring program whose cycle closed >7d ago isn't "closed" —
      // it's waiting for its next window.
      if (dt === 'recurring' && d < -7) return 'upcoming'
      return 'closed'
    }
    if (d <= 7) return 'week'
    if (d <= 30) return 'month'
    return 'later'
  }
  if (dt === 'recurring') return 'upcoming' // recurring without an active deadline
  return 'nodate'
}

/** Sort rows within a section: dated ones by soonest deadline, open ones by leverage. */
function sectionSort(key: SectionKey, a: Opportunity, b: Opportunity): number {
  switch (key) {
    case 'week':
    case 'month':
    case 'later':
      return (a.deadline || '').localeCompare(b.deadline || '')
    case 'closed':
      return (b.deadline || '').localeCompare(a.deadline || '')
    case 'rolling':
    case 'upcoming':
      return (b.leverageScore - a.leverageScore) || (priorityOf(a.priority).rank - priorityOf(b.priority).rank)
    case 'nodate':
      return (b.discoveredAt || '').localeCompare(a.discoveredAt || '')
  }
}

/** Non-empty urgency sections in display order, each sorted for that section. */
export function urgencySections(items: Opportunity[], today: string) {
  const buckets = new Map<SectionKey, Opportunity[]>()
  for (const o of items) {
    const k = sectionOf(o, today)
    buckets.set(k, [...(buckets.get(k) ?? []), o])
  }
  return SECTION_ORDER
    .filter((k) => buckets.has(k))
    .map((k) => ({ key: k, ...SECTION_META[k], items: buckets.get(k)!.sort((a, b) => sectionSort(k, a, b)) }))
}

export interface Countdown { text: string; variant: ChipVariant; outline?: boolean; title?: string }

/** Countdown chip content for a row (semantic tone by urgency). */
export function countdownOf(o: Opportunity, today: string): Countdown {
  const dt = deadlineTypeOf(o)
  if (dt === 'rolling') return { text: 'rolling', variant: 'accent', outline: true }
  if (dt === 'always-open') return { text: 'always open', variant: 'accent', outline: true }
  const d = daysUntilDeadline(o.deadline, today)
  if (d !== null) {
    if (d < 0) return { text: `closed ${fmtDate(o.deadline)}`, variant: 'neutral' }
    if (d <= 7) return { text: `D-${d}`, variant: 'danger', title: fmtDate(o.deadline) }
    if (d <= 14) return { text: `D-${d}`, variant: 'warning', title: fmtDate(o.deadline) }
    return { text: fmtDate(o.deadline), variant: 'neutral' }
  }
  if (dt === 'recurring') {
    const hint = windowHint(o.nextWindowExpected)
    return { text: hint ?? 'recurring', variant: 'neutral', title: o.nextWindowExpected ?? undefined }
  }
  return { text: 'no date', variant: 'neutral' }
}

// ── Pursuit ──────────────────────────────────────────────────────────────────

/** Still worth acting on: not yet applied, decided, or archived. */
export const isOpen = (o: Opportunity) => o.status === 'new' || o.status === 'pursuing'

/**
 * Deadline-aware leverage ranking of open items:
 *   score = priorityWeight × leverageScore × urgencyBoost
 *     priorityWeight : high 3 · medium 2 · low 1
 *     urgencyBoost   : a dated deadline within 7 days ×2, within 14 days ×1.5, else ×1
 * Ties break toward the sooner deadline.
 */
export function topPicks(items: Opportunity[], today: string, limit = 5): Opportunity[] {
  const weight = { high: 3, medium: 2, low: 1 } as const
  return items
    .filter(isOpen)
    .map((o) => {
      const d = isOpenWindow(o) ? null : daysUntilDeadline(o.deadline, today)
      const boost = d !== null && d >= 0 ? (d <= 7 ? 2 : d <= 14 ? 1.5 : 1) : 1
      return { o, d, score: (weight[o.priority] ?? 2) * o.leverageScore * boost }
    })
    .sort((a, b) => (b.score - a.score) || ((a.d ?? Infinity) - (b.d ?? Infinity)))
    .slice(0, limit)
    .map((x) => x.o)
}

// ── Hunt orders ──────────────────────────────────────────────────────────────

/** Does an opportunity satisfy a hunt order's parsed constraints? Drives progress counts. */
export function objectiveMatches(o: Opportunity, p?: ObjectiveParsed): boolean {
  if (!p) return false
  if (o.status === 'archived' || o.status === 'lost') return false
  if (p.category && o.category !== p.category) return false
  if (p.eligibility && o.eligibility !== p.eligibility) return false
  if (p.deadlineBefore && !o.rolling && o.deadline && o.deadline > p.deadlineBefore) return false
  if (p.locations && p.locations.length) {
    const where = deburr(`${o.location} ${o.title} ${o.host} ${o.notes} ${(o.tags || []).join(' ')}`)
    if (!p.locations.some((l) => l && where.includes(deburr(l)))) return false
  }
  if (p.keywords && p.keywords.length) {
    const hay = deburr(`${o.title} ${o.host} ${(o.tags || []).join(' ')} ${o.notes}`)
    if (!p.keywords.some((k) => k && hay.includes(deburr(k)))) return false
  }
  return true
}

/** Short labels for what radar read out of a hunt order. */
export function objectiveSummary(p?: ObjectiveParsed): string[] {
  if (!p) return []
  return [
    p.category ? categoryOf(p.category).label : null,
    p.locations?.length ? p.locations.join(' · ') : null,
    p.eligibility ? eligibilityOf(p.eligibility) : null,
    p.salaryText || null,
    p.deadlineBefore ? `by ${fmtDate(p.deadlineBefore)}` : null,
  ].filter((label): label is string => Boolean(label))
}
