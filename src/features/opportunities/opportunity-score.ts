/**
 * Pablo's opportunity profile as code: hard filters, funding and time-cost classes,
 * deadline urgency, and the weighted 0–100 score with mode presets. The one owner of
 * "is this worth his time": the page ranks with it and scripts/opportunity-research.mjs
 * gates ingest with it. Imports carry .ts extensions so Node scripts can load it.
 */

import { daysUntilDeadline } from './expiry.ts'
import { deadlineTypeOf } from './opportunity-model.ts'
import type { FieldTag, OpportunityCategory, Opportunity } from './opportunity-model.ts'

/** Who the score is for. Update when something changes. */
export const PROFILE = {
  age: 18,
  hasMvp: true,
  hasTraction: false,
  hasCompany: false,
} as const

/** Minimum best-mode score an eligible item needs to stay visible. */
export const KEEP_SCORE = 40

const clamp10 = (n: number) => Math.min(10, Math.max(0, n))
/** Field tags, safe against hand-written records with a malformed intel. */
const tagsOf = (o: Opportunity): FieldTag[] => (Array.isArray(o.intel?.fields) ? o.intel.fields : [])
const deburr = (s: string) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
const mean = (xs: (number | null | undefined)[], fallback: number) => {
  const known = xs.filter((x): x is number => typeof x === 'number')
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : fallback
}

// ── Deadline urgency ─────────────────────────────────────────────────────────

export type Urgency = 'urgent' | 'high' | 'prepare' | 'pipeline' | 'rolling' | 'watchlist' | 'unknown' | 'closed'

/** <7d urgent · 7–21d high · 21–60d prepare · >60d pipeline · closed-but-recurring watchlist. */
export function urgencyOf(o: Opportunity, today: string): Urgency {
  const dt = deadlineTypeOf(o)
  if (dt === 'rolling' || dt === 'always-open') return 'rolling'
  const recurs = dt === 'recurring' || !!o.nextWindowExpected
  const d = daysUntilDeadline(o.deadline, today)
  if (d === null) return recurs ? 'watchlist' : 'unknown'
  if (d < 0) return recurs ? 'watchlist' : 'closed'
  if (d < 7) return 'urgent'
  if (d <= 21) return 'high'
  if (d <= 60) return 'prepare'
  return 'pipeline'
}

/** Only these may ever be shown as "apply now". */
export const isApplyNow = (u: Urgency) => u !== 'watchlist' && u !== 'unknown' && u !== 'closed'

// ── Place ────────────────────────────────────────────────────────────────────

export function isInPerson(o: Opportunity): boolean {
  if (typeof o.intel?.inPerson === 'boolean') return o.intel.inPerson
  return o.modality === 'in-person' || o.modality === 'hybrid'
}

const placeText = (o: Opportunity) => deburr(`${o.intel?.city ?? ''} ${o.intel?.country ?? ''} ${o.location}`)
const COLOMBIA = /colombia|bogota|medellin|cali\b|barranquilla|cartagena|bucaramanga/
const HUBS: [RegExp, number][] = [
  [/san francisco|bay area|palo alto|stanford|berkeley|mountain view|menlo park|\bsf\b/, 4],
  [/new york|nyc|boston|cambridge|\bmit\b/, 3.5],
  [/zurich|lausanne|epfl|geneva|switzerland/, 3.5],
  [/london|paris|berlin|munich|amsterdam|stockholm|copenhagen|tubingen|delft|madrid|barcelona/, 3],
  [/tokyo|seoul|singapore|shenzhen|beijing|shanghai|hong kong|taipei|bangalore|bengaluru/, 3],
  [/united states|usa|europe|germany|united kingdom|france|netherlands|japan|korea|china/, 2],
]

// ── Hard filters ─────────────────────────────────────────────────────────────

export interface HardCheck {
  ok: boolean
  /** Why it was rejected (empty when ok). */
  reasons: string[]
  /** 0–10: how likely an unknown or a stage gap still disqualifies him. */
  risk: number
}

export function hardCheck(o: Opportunity, today: string): HardCheck {
  const i = o.intel
  const reasons: string[] = []
  let risk = 0

  if (i?.legit === false) reasons.push('not legit')

  if (i?.ageMin != null && i.ageMin > PROFILE.age) reasons.push(`age ${i.ageMin}+`)
  if (i?.ageMax != null && i.ageMax < PROFILE.age) reasons.push(`age ≤${i.ageMax}`)
  if (i?.ageMin == null && i?.ageMax == null) risk += 1

  if (i?.colombiaAllowed === false || (o.eligibility === 'us-eu' && i?.colombiaAllowed !== true)) {
    reasons.push('not open to Colombia')
  } else if (i?.colombiaAllowed == null && o.eligibility !== 'remote-global' && o.eligibility !== 'latam') {
    risk += 3
  }

  const elite = (i?.prestige ?? 0) >= 9
  const bigMoney = (i?.cashUsd ?? 0) + (i?.stipendUsd ?? 0) + (i?.investmentUsd ?? 0) >= 100_000
  if (i?.undergradAllowed === false && !elite) reasons.push('no undergrads')
  else if (i?.undergradAllowed == null) risk += 1
  if (i?.dropout && !(elite && bigMoney)) reasons.push('requires dropping out')

  if (urgencyOf(o, today) === 'closed') reasons.push('closed')
  if (fieldFitOf(o) < 4) reasons.push('off-field')

  if (i?.tractionRequired && !PROFILE.hasTraction) risk += 3
  if (i?.companyRequired && !PROFILE.hasCompany) risk += 2
  if (i?.mvpRequired && !PROFILE.hasMvp) risk += 2
  if (isInPerson(o) && !COLOMBIA.test(placeText(o)) && i?.visaSupport === false) risk += 1
  if (!o.lastVerified) risk += 1

  return { ok: reasons.length === 0, reasons, risk: clamp10(risk) }
}

// ── Components (each 0–10) ───────────────────────────────────────────────────

const FIELD_FIT: Record<FieldTag, number> = {
  humanoids: 10, manipulation: 10, ai: 9, founder: 9, startups: 8.5, software: 8,
  robotics: 8, research: 7.5, hackathon: 7, hardware: 5, iot: 2,
}
/** Legacy records without field tags fall back to their category. */
const CATEGORY_FIT: Partial<Record<OpportunityCategory, number>> = {
  accelerator: 7, fellowship: 6, hackathon: 6, research: 6, residency: 6,
  competition: 5, program: 5, grant: 5, internship: 5, pitch: 4,
}

export function fieldFitOf(o: Opportunity): number {
  const tags = tagsOf(o)
  return tags.length ? Math.max(...tags.map((t) => FIELD_FIT[t] ?? 0)) : CATEGORY_FIT[o.category] ?? 0
}

export type FundingClass = 'full' | 'mostly' | 'partial' | 'none' | 'unknown'
export const FUNDING_LABEL: Record<FundingClass, string> = {
  full: 'Fully funded', mostly: 'Mostly funded', partial: 'Partly funded', none: 'Unfunded', unknown: 'Funding ?',
}

/** In person, funding means getting there and staying; remote, it is the money itself. */
export function fundingClassOf(o: Opportunity): FundingClass {
  const i = o.intel
  if (!i) return 'unknown'
  const known = [i.cashUsd, i.stipendUsd, i.investmentUsd, i.travelCovered, i.travelCapUsd, i.housingCovered, i.feeUsd]
  if (known.every((v) => v == null)) return 'unknown'
  const money = (i.cashUsd ?? 0) + (i.stipendUsd ?? 0)
  const invest = i.investmentUsd ?? 0
  if ((i.feeUsd ?? 0) > money) return 'none'
  if (isInPerson(o)) {
    const travel = i.travelCovered === true || (i.travelCapUsd ?? 0) >= 500
    if (i.travelCovered && i.housingCovered) return 'full'
    if ((travel && (money >= 1000 || i.housingCovered)) || money + invest >= 10_000) return 'mostly'
    if (travel || (i.travelCapUsd ?? 0) > 0 || i.housingCovered || money > 0 || invest > 0) return 'partial'
    return 'none'
  }
  if (money >= 5000) return 'full'
  if (money >= 1000 || invest >= 25_000) return 'mostly'
  return money > 0 || invest > 0 ? 'partial' : 'none'
}

const FUNDING_BASE: Record<FundingClass, number> = { full: 7, mostly: 5, partial: 2.5, none: 0, unknown: 1 }

/** Funding per week of commitment: $15k over four months is worth less than it looks. */
function fundingScore(o: Opportunity): number {
  const i = o.intel
  const money = (i?.cashUsd ?? 0) + (i?.stipendUsd ?? 0) + 0.5 * (i?.investmentUsd ?? 0)
  const perWeek = money / Math.max(1, (i?.durationDays ?? 7) / 7)
  const bonus = perWeek > 100 ? Math.min(3, Math.log10(perWeek / 100) * 2) : 0
  return clamp10(FUNDING_BASE[fundingClassOf(o)] + bonus)
}

const networkOf = (o: Opportunity) =>
  mean([o.intel?.network, o.intel?.founderDensity, o.intel?.technicalDensity], 3)

/** Funded trips to dense hubs. A trip without network density is just tourism. */
function travelScore(o: Opportunity): number {
  if (!isInPerson(o)) return 0
  const where = placeText(o)
  if (COLOMBIA.test(where)) return 2
  const i = o.intel
  const hub = HUBS.find(([re]) => re.test(where))?.[1] ?? 1
  const cap = i?.travelCapUsd ?? 0
  const covered = i?.travelCovered ? 4 : cap >= 500 ? 3 : cap > 0 ? 1.5 : 0
  const housing = i?.housingCovered ? 2 : 0
  return clamp10((hub + covered + housing) * (0.6 + 0.04 * networkOf(o)))
}

function roboticsScore(o: Opportunity): number {
  const tags = tagsOf(o)
  const depth = tags.some((t) => t === 'humanoids' || t === 'manipulation') ? 9
    : tags.includes('robotics') ? 7 : tags.includes('hardware') ? 4 : tags.includes('iot') ? 1 : 0
  return clamp10(depth + (depth > 0 && o.intel?.hardwareAccess ? 1 : 0))
}

function researchScore(o: Opportunity): number {
  const tagged = tagsOf(o).includes('research')
  return o.category === 'research' ? (tagged ? 10 : 7) : tagged ? 8 : 0
}

function hackathonScore(o: Opportunity): number {
  const compete = o.category === 'hackathon' || o.category === 'competition'
  if (!compete) return tagsOf(o).includes('hackathon') ? 7 : 0
  return clamp10(8 + ((o.intel?.durationDays ?? 99) <= 3 ? 2 : 0))
}

const SELECTIVITY_ODDS = { reach: 0.05, competitive: 0.2, realistic: 0.5, easy: 0.8 } as const
const EFFORT_HOURS = { low: 2, medium: 8, high: 20 } as const

/** upside × probability ÷ effort. sqrt keeps a 3% shot at something huge alive. */
function valueScore(o: Opportunity, funding: number): number {
  const i = o.intel
  const upside = mean([funding, networkOf(o), i?.prestige, i?.careerUpside], 3)
  const p = i?.probability ?? (i?.selectivity ? SELECTIVITY_ODDS[i.selectivity] : 0.2)
  const hours = i?.effortHours ?? (o.effort ? EFFORT_HOURS[o.effort] : 8)
  return clamp10((upside * Math.sqrt(p) * 1.3) / (1 + Math.log2(1 + hours / 4) / 2))
}

const TIMING: Record<Urgency, number> = {
  urgent: 8, high: 10, prepare: 7, pipeline: 5, rolling: 7, watchlist: 2, unknown: 3, closed: 0,
}

export type Component =
  | 'fieldFit' | 'funding' | 'network' | 'career' | 'travel' | 'prestige' | 'value'
  | 'skill' | 'timing' | 'investors' | 'robotics' | 'research' | 'hackathon'

export function componentsOf(o: Opportunity, today: string): Record<Component, number> {
  const i = o.intel
  const funding = fundingScore(o)
  return {
    fieldFit: fieldFitOf(o),
    funding,
    network: networkOf(o),
    career: i?.careerUpside ?? 3,
    travel: travelScore(o),
    prestige: i?.prestige ?? 3,
    value: valueScore(o, funding),
    skill: i?.skillGain ?? 3,
    timing: TIMING[urgencyOf(o, today)],
    investors: i?.investorAccess ?? 2,
    robotics: roboticsScore(o),
    research: researchScore(o),
    hackathon: hackathonScore(o),
  }
}

// ── Penalties (each 0–10) ────────────────────────────────────────────────────

/** A 3-day event costs little; four full-time months cost a lot; leaving school costs more. */
export function timeCostPenalty(o: Opportunity): number {
  const i = o.intel
  let p = 2
  if (i?.durationDays != null) {
    const load = i.hoursPerWeek != null ? i.hoursPerWeek / 40 : i.fullTime === false ? 0.25 : 1
    p = Math.log2((i.durationDays / 7) * load + 1) * 2.5
  }
  if (i?.leaveUniversity) p += 3
  if (i?.dropout) p += 6
  return clamp10(p)
}

export function relocationPenalty(o: Opportunity): number {
  if (!o.intel?.relocation) return 0
  const days = o.intel.durationDays ?? 90
  return days >= 60 ? 10 : days >= 14 ? 6 : 3
}

// ── Modes and the final score ────────────────────────────────────────────────

export type Mode = 'balanced' | 'founder' | 'robotics' | 'research' | 'hackathon' | 'travel' | 'money'

const PENALTY_WEIGHT = { timeCost: 0.1, relocation: 0.1, eligibilityRisk: 0.1 }

export const MODES: Record<Mode, { label: string; weights: Partial<Record<Component, number>> }> = {
  balanced: { label: 'Balanced', weights: { fieldFit: 0.2, funding: 0.15, network: 0.15, career: 0.1, travel: 0.1, prestige: 0.1, value: 0.1, skill: 0.05, timing: 0.05 } },
  founder: { label: 'Founder', weights: { fieldFit: 0.1, funding: 0.2, investors: 0.2, network: 0.2, career: 0.1, prestige: 0.1, value: 0.05, timing: 0.05 } },
  robotics: { label: 'Robotics', weights: { robotics: 0.3, fieldFit: 0.1, skill: 0.15, network: 0.1, funding: 0.1, prestige: 0.1, travel: 0.05, value: 0.05, timing: 0.05 } },
  research: { label: 'Research', weights: { research: 0.3, prestige: 0.15, skill: 0.15, network: 0.1, funding: 0.1, career: 0.1, value: 0.05, timing: 0.05 } },
  hackathon: { label: 'Hackathon', weights: { hackathon: 0.3, travel: 0.15, funding: 0.15, network: 0.15, fieldFit: 0.1, value: 0.1, timing: 0.05 } },
  travel: { label: 'Travel', weights: { travel: 0.35, funding: 0.2, network: 0.15, prestige: 0.1, fieldFit: 0.1, timing: 0.1 } },
  money: { label: 'Money', weights: { funding: 0.45, value: 0.2, fieldFit: 0.1, prestige: 0.1, timing: 0.15 } },
}
export const ALL_MODES = Object.keys(MODES) as Mode[]

export interface Scored {
  /** 0–100 in the requested mode. */
  score: number
  /** Passes the hard filters and clears KEEP_SCORE in its best mode. */
  keep: boolean
  /** Why it is hidden (empty when kept). */
  reasons: string[]
  urgency: Urgency
  funding: FundingClass
}

function modeScore(c: Record<Component, number>, mode: Mode, penalty: number): number {
  const weighted = Object.entries(MODES[mode].weights)
    .reduce((sum, [k, w]) => sum + (w ?? 0) * c[k as Component], 0)
  return Math.round(Math.min(100, Math.max(0, (weighted - penalty) * 10)))
}

export function scoreOpportunity(o: Opportunity, today: string, mode: Mode = 'balanced'): Scored {
  const check = hardCheck(o, today)
  const c = componentsOf(o, today)
  const penalty = PENALTY_WEIGHT.timeCost * timeCostPenalty(o)
    + PENALTY_WEIGHT.relocation * relocationPenalty(o)
    + PENALTY_WEIGHT.eligibilityRisk * check.risk
  const best = Math.max(...ALL_MODES.map((m) => modeScore(c, m, penalty)))
  const reasons = check.ok ? (best < KEEP_SCORE ? [`low score (${best})`] : []) : check.reasons
  return {
    score: modeScore(c, mode, penalty),
    keep: reasons.length === 0,
    reasons,
    urgency: urgencyOf(o, today),
    funding: fundingClassOf(o),
  }
}

/**
 * The research run's visibility rule. Only untouched items move: 'new' ones that fail
 * hide with a reason, and ones this rule hid come back once they pass. Anything Pablo
 * acted on, or archived himself, stays as he left it. Returns null when nothing changes.
 */
export function visibilityPatch(o: Opportunity, today: string): Pick<Opportunity, 'status' | 'hiddenReason'> | null {
  const autoHidden = o.status === 'archived' && !!o.hiddenReason
  if (o.status !== 'new' && !autoHidden) return null
  const { keep, reasons } = scoreOpportunity(o, today)
  if (keep) return autoHidden ? { status: 'new', hiddenReason: null } : null
  const hiddenReason = reasons.join(', ')
  return autoHidden && o.hiddenReason === hiddenReason ? null : { status: 'archived', hiddenReason }
}
