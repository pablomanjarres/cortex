/**
 * Opportunity domain model: the `cortex-opportunities` store shape, enum
 * configs (labels + semantic chip tones), and safe accessors that normalize
 * legacy or unknown values at render time.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type OpportunityCategory =
  | 'hackathon' | 'grant' | 'accelerator' | 'fellowship' | 'internship'
  | 'exchange' | 'competition' | 'pitch' | 'speaking' | 'scholarship'
  | 'community' | 'launch' | 'trending' | 'program' | 'residency' | 'research' | 'travel' | 'other'

export type Goal = 'internship' | 'exchange' | 'funding' | 'social-growth' | 'users'

export type Eligibility = 'remote-global' | 'latam' | 'us-eu' | 'other' | 'unknown'

/** How/where the opportunity actually happens (venue axis — distinct from `eligibility`, which is the region axis). */
export type Modality = 'remote' | 'hybrid' | 'in-person' | 'unknown'

export type OppStatus = 'new' | 'pursuing' | 'applied' | 'won' | 'lost' | 'archived'

/** Deadline intelligence: how this opportunity's application window behaves. */
export type DeadlineType = 'fixed' | 'rolling' | 'recurring' | 'always-open' | 'unknown'

/** Rough application effort (form vs essays vs multi-stage interviews). */
export type Effort = 'low' | 'medium' | 'high'

export type OppSource =
  | 'x' | 'linkedin' | 'reddit' | 'instagram' | 'github' | 'devpost' | 'luma'
  | 'eventbrite' | 'meetup' | 'web' | 'manual' | 'catalog'

export interface Opportunity {
  id: string
  title: string
  host: string
  category: OpportunityCategory
  goals: Goal[]
  priority: 'low' | 'medium' | 'high'
  leverageScore: number // 1..5
  leverageNote: string
  status: OppStatus
  deadline: string | null
  /** Legacy boolean — kept in sync with deadlineType ('rolling' | 'always-open' → true). */
  rolling: boolean
  /** Optional: records predating the field derive it at render (deadlineTypeOf). */
  deadlineType?: DeadlineType
  /** Cadence when known, e.g. 'annual', 'rolling cohorts', '2 batches/yr'. */
  recurrence?: string | null
  /** Freeform estimate of the next application window (estimates marked as such). */
  nextWindowExpected?: string | null
  /** Representative amount in USD (grant / stipend / top prize) — null when unclear. */
  amountUsd?: number | null
  /** true ONLY for an explicit 18+/legal-age rule; false = minors explicitly OK; null = unstated. */
  requires18Plus?: boolean | null
  /** Application effort heuristic. */
  effort?: Effort | null
  location: string
  /** Venue modality. Optional so records predating this field default to 'unknown' at render. */
  modality?: Modality
  eligibility: Eligibility
  reward: string
  url: string
  /** Canonical program page when known; `url` stays the apply/discovery link. */
  officialUrl?: string
  source: OppSource
  sourceRef: string
  discoveredAt: string
  /** Which radar run surfaced this item (ISO stamp). 'manual' for hand-added. */
  runId?: string
  notes: string
  tags: string[]
  /** Deep-research facts that drive the profile score (opportunity-score.ts). Absent on legacy records. */
  intel?: OppIntel
  /** ISO date the weekly research last confirmed this item is real and open. */
  lastVerified?: string | null
  /** Set when the research run hid this item for failing the profile; cleared if it later passes. */
  hiddenReason?: string | null
  /** Exact date applications open ("YYYY-MM-DD"); null when unstated. Never an estimate. */
  opensAt?: string | null
  /** Exact program dates ("YYYY-MM-DD"); null when unstated. Drive travel and visa checks. */
  programStart?: string | null
  programEnd?: string | null
  /** Official URL plus the exact wording the research relied on. Radar-owned, refreshed every run. */
  evidence?: string | null
  /** Pablo is 100% interested (his Todoist Opportunities list, or set by hand). Never auto-hidden. */
  premium?: boolean
  /** Linked task in the Todoist Opportunities project. */
  todoistTaskId?: string | null
}

/** Where an application window stands today (opportunity-window.ts derives it). */
export type ApplicationStatus = 'upcoming' | 'open' | 'rolling' | 'closed' | 'unknown'

/** Field tags the profile cares about. Robotics depth: humanoids/manipulation > robotics > hardware > iot. */
export type FieldTag =
  | 'humanoids' | 'manipulation' | 'robotics' | 'hardware' | 'iot'
  | 'ai' | 'software' | 'startups' | 'founder' | 'research' | 'hackathon'

export type Selectivity = 'reach' | 'competitive' | 'realistic' | 'easy'

/**
 * What the weekly deep research learned about one opportunity. Every scalar is
 * nullable: null means "not stated", never a guess. Normalized by opportunity-intel.ts.
 */
export interface OppIntel {
  fields: FieldTag[]
  /** false = sketchy or pay-to-play. */
  legit: boolean | null
  ageMin: number | null
  ageMax: number | null
  colombiaAllowed: boolean | null
  undergradAllowed: boolean | null
  country: string | null
  city: string | null
  inPerson: boolean | null
  visaSupport: boolean | null
  /** Guaranteed grant or award. Prize pools are not funding. */
  cashUsd: number | null
  investmentUsd: number | null
  equityPct: number | null
  /** Total stipend over the whole program. */
  stipendUsd: number | null
  travelCovered: boolean | null
  travelCapUsd: number | null
  housingCovered: boolean | null
  mealsCovered: boolean | null
  /** Out-of-pocket fee (registration, tuition). */
  feeUsd: number | null
  durationDays: number | null
  hoursPerWeek: number | null
  fullTime: boolean | null
  relocation: boolean | null
  leaveUniversity: boolean | null
  dropout: boolean | null
  ideaStageOk: boolean | null
  mvpRequired: boolean | null
  tractionRequired: boolean | null
  companyRequired: boolean | null
  hardwareAccess: boolean | null
  /** Judgment signals, 0–10. */
  prestige: number | null
  network: number | null
  founderDensity: number | null
  technicalDensity: number | null
  investorAccess: number | null
  careerUpside: number | null
  skillGain: number | null
  selectivity: Selectivity | null
  /** Estimated acceptance probability, 0–1. */
  probability: number | null
  effortHours: number | null
}

/** A plain-language focus for the next research run, set from chat (MCP set_hunt_order). */
export interface Objective {
  id: string
  text: string
  status: 'thinking' | 'ready' | 'error'
  active: boolean
  createdAt: string
}

export interface OppData {
  items: Opportunity[]
  lastRun: string | null
  /** Id (== timestamp) of the latest radar run. */
  lastRunId?: string
  /** One-line summary of the latest research run. */
  report?: string
  /** Plain-language focus notes the research run reads. */
  objectives?: Objective[]
  /** Manual-run control (a launchd watcher executes the pipeline when set). */
  runRequestedAt?: string
  runStatus?: 'requested' | 'running' | 'done' | 'error'
  runStartedAt?: string
  runFinishedAt?: string
  runError?: string
}

export const DEFAULT_DATA: OppData = { items: [], lastRun: null }

// ── Config (labels + semantic Chip variants — no per-item hues) ──────────────
// Every lookup goes through a *Of() accessor with a safe fallback, so a record
// written by a newer radar build (or an unknown enum value) can never throw.

export type ChipVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export const categoryConfig: Record<OpportunityCategory, { label: string }> = {
  hackathon: { label: 'Hackathon' },
  grant: { label: 'Grant' },
  accelerator: { label: 'Accelerator' },
  fellowship: { label: 'Fellowship' },
  internship: { label: 'Internship' },
  exchange: { label: 'Exchange' },
  competition: { label: 'Competition' },
  pitch: { label: 'Pitch' },
  speaking: { label: 'Speaking' },
  scholarship: { label: 'Scholarship' },
  community: { label: 'Community' },
  launch: { label: 'Launch' },
  trending: { label: 'Trending' },
  program: { label: 'Program' },
  residency: { label: 'Residency' },
  research: { label: 'Research' },
  travel: { label: 'Travel grant' },
  other: { label: 'Other' },
}
export const ALL_CATEGORIES = Object.keys(categoryConfig) as OpportunityCategory[]

// Statuses: only truly semantic states carry a tone (won/lost/applied); the
// rest are neutral. `text` colors the inline status select per state.
export const statusConfig: Record<OppStatus, { label: string; chip: ChipVariant; text: string }> = {
  new: { label: 'New', chip: 'neutral', text: 'text-foreground' },
  pursuing: { label: 'Pursuing', chip: 'accent', text: 'text-accent' },
  applied: { label: 'Applied', chip: 'warning', text: 'text-warning' },
  won: { label: 'Won', chip: 'success', text: 'text-success' },
  lost: { label: 'Lost', chip: 'danger', text: 'text-destructive' },
  archived: { label: 'Archived', chip: 'neutral', text: 'text-muted-foreground' },
}
export const ALL_STATUSES = Object.keys(statusConfig) as OppStatus[]
export const statusOf = (s: string | null | undefined) => statusConfig[s as OppStatus] ?? statusConfig.new

export const eligibilityConfig: Record<Eligibility, string> = {
  'remote-global': 'Remote / Global',
  latam: 'LatAm',
  'us-eu': 'US / EU',
  other: 'Other',
  unknown: 'Unknown',
}

export const modalityConfig: Record<Modality, { label: string }> = {
  remote: { label: 'Remote' },
  hybrid: { label: 'Hybrid' },
  'in-person': { label: 'In-person' },
  unknown: { label: 'Unknown' },
}
/** Normalize possibly-absent modality (older records) to a valid key. */
export const modalityOf = (o: Opportunity): Modality =>
  o.modality && modalityConfig[o.modality] ? o.modality : 'unknown'

export const sourceConfig: Record<OppSource, { label: string }> = {
  x: { label: 'X' },
  linkedin: { label: 'LinkedIn' },
  reddit: { label: 'Reddit' },
  instagram: { label: 'Instagram' },
  github: { label: 'GitHub' },
  devpost: { label: 'Devpost' },
  luma: { label: 'Luma' },
  eventbrite: { label: 'Eventbrite' },
  meetup: { label: 'Meetup' },
  web: { label: 'Web' },
  manual: { label: 'Manual' },
  catalog: { label: 'Catalog' },
}
/** Safe lookup — a record from a newer radar build could carry a source this UI predates. */
export const sourceOf = (o: Opportunity) => sourceConfig[o.source] ?? sourceConfig.web

export const deadlineTypeConfig: Record<DeadlineType, { label: string }> = {
  fixed: { label: 'Fixed date' },
  rolling: { label: 'Rolling' },
  recurring: { label: 'Recurring' },
  'always-open': { label: 'Always open' },
  unknown: { label: 'Unknown' },
}
export const ALL_DEADLINE_TYPES = Object.keys(deadlineTypeConfig) as DeadlineType[]

/**
 * Normalize an item's deadline type at render time (mirrors scripts/radar-lib.mjs):
 * explicit valid value wins; legacy records derive rolling→'rolling',
 * dated→'fixed', else 'unknown'. All 68 legacy items render without migration.
 */
export function deadlineTypeOf(o: Opportunity): DeadlineType {
  if (o.deadlineType && deadlineTypeConfig[o.deadlineType]) return o.deadlineType
  if (o.rolling === true) return 'rolling'
  if (o.deadline) return 'fixed'
  return 'unknown'
}

export const effortConfig: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High' }
export const ALL_EFFORTS = Object.keys(effortConfig) as Effort[]

/**
 * Turning premium on brings back an item the profile auto-hid (archived with a reason);
 * one he archived himself stays archived. The Todoist sync applies the same rule.
 */
export function premiumPatch(o: Pick<Opportunity, 'status' | 'hiddenReason'>, on: boolean): Partial<Opportunity> {
  if (!on) return { premium: false }
  return o.status === 'archived' && o.hiddenReason ? { premium: true, status: 'new', hiddenReason: null } : { premium: true }
}

/** Writing a deadline type keeps the legacy `rolling` boolean in sync. */
export function deadlineTypePatch(type: DeadlineType): Pick<Opportunity, 'deadlineType' | 'rolling'> {
  return { deadlineType: type, rolling: type === 'rolling' || type === 'always-open' }
}

/** Blank or invalid amounts are unknown (null); valid ones are whole, non-negative USD. */
export function parseAmountUsd(value: string): number | null {
  const v = value.trim()
  const n = Number(v)
  return v === '' || !Number.isFinite(n) ? null : Math.max(0, Math.round(n))
}

export type AgeRule = '' | 'yes' | 'no'
export const ageRuleOf = (o: Opportunity): AgeRule =>
  o.requires18Plus === true ? 'yes' : o.requires18Plus === false ? 'no' : ''
export const requires18PlusFor = (rule: AgeRule): boolean | null => rule === '' ? null : rule === 'yes'
