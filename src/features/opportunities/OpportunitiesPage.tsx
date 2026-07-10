import { useState, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useStore } from '@/lib/store'
import { GrowthProjectsPanel } from './GrowthProjectsPanel'
import {
  Search,
  Plus,
  Trash2,
  ExternalLink,
  Target,
  CalendarClock,
  InfinityIcon,
  Sparkles,
  RefreshCw,
  Send,
  X,
  Crosshair,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export type OpportunityCategory =
  | 'hackathon' | 'grant' | 'accelerator' | 'fellowship' | 'internship'
  | 'exchange' | 'competition' | 'pitch' | 'speaking' | 'scholarship'
  | 'community' | 'launch' | 'trending' | 'program' | 'residency' | 'research' | 'other'

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
}

/** Structured reading of a natural-language hunt order (filled in by the radar agent). */
export interface ObjectiveParsed {
  /** One-line normalized restatement, e.g. "20 remote internships, $2k+/mo, deadline before 2026-09-01". */
  summary?: string
  category?: OpportunityCategory | null
  /** How many of these the user wants (drives the "N / target found" progress). */
  targetCount?: number | null
  eligibility?: Eligibility | null
  /** Cities / regions / countries the order targets, e.g. ["Medellín", "Bogotá", "Colombia"]. */
  locations?: string[]
  /** Freeform pay/reward ask, e.g. "$2k+/mo" (schema has no salary field, so kept as text). */
  salaryText?: string | null
  /** Only surface items whose deadline is on/before this (YYYY-MM-DD). */
  deadlineBefore?: string | null
  keywords?: string[]
}

/**
 * A natural-language hunt order the user gives radar ("I need 20 remote internships,
 * $2k+, deadline before Sept"). The radar agent reads it, replies conversationally, and
 * fills `parsed`; the classifier then prioritizes + scores matching opportunities.
 */
export interface Objective {
  id: string
  /** Raw text the user typed. */
  text: string
  /** The agent's conversational acknowledgment (the "talk to radar" reply). */
  reply?: string
  parsed?: ObjectiveParsed
  /** thinking = agent is reading it; ready = parsed; error = agent call failed. */
  status: 'thinking' | 'ready' | 'error'
  /** Active objectives steer the next radar run; inactive ones are paused. */
  active: boolean
  createdAt: string
  error?: string
}

interface OppData {
  items: Opportunity[]
  lastRun: string | null
  /** Id (== timestamp) of the latest radar run, for the "this run" filter. */
  lastRunId?: string
  /** Markdown digest written by the weekly routine: what landed + what to look at. */
  report?: string
  /** Natural-language hunt orders that steer radar (the "talk to radar" feature). */
  objectives?: Objective[]
  /** Manual-run control (a launchd watcher executes the pipeline when set). */
  runRequestedAt?: string
  runStatus?: 'requested' | 'running' | 'done' | 'error'
  runStartedAt?: string
  runFinishedAt?: string
  runError?: string
}

const DEFAULT_DATA: OppData = { items: [], lastRun: null }

// ── Config (labels + semantic Chip variants — no per-item hues) ──────────────
// Every lookup goes through a *Of() accessor with a safe fallback, so a record
// written by a newer radar build (or an unknown enum value) can never throw.

type ChipVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const categoryConfig: Record<OpportunityCategory, { label: string }> = {
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
  other: { label: 'Other' },
}
const ALL_CATEGORIES = Object.keys(categoryConfig) as OpportunityCategory[]
const categoryOf = (c: string | null | undefined) =>
  categoryConfig[c as OpportunityCategory] ?? categoryConfig.other

// Statuses: only truly semantic states carry a tone (won/lost/applied); the
// rest are neutral. `text` colors the inline status select per state.
const statusConfig: Record<OppStatus, { label: string; chip: ChipVariant; text: string }> = {
  new: { label: 'New', chip: 'neutral', text: 'text-foreground' },
  pursuing: { label: 'Pursuing', chip: 'accent', text: 'text-accent' },
  applied: { label: 'Applied', chip: 'warning', text: 'text-warning' },
  won: { label: 'Won', chip: 'success', text: 'text-success' },
  lost: { label: 'Lost', chip: 'danger', text: 'text-destructive' },
  archived: { label: 'Archived', chip: 'neutral', text: 'text-muted-foreground' },
}
const ALL_STATUSES = Object.keys(statusConfig) as OppStatus[]
const statusOf = (s: string | null | undefined) => statusConfig[s as OppStatus] ?? statusConfig.new

const priorityConfig: Record<Opportunity['priority'], { label: string; rank: number; chip: ChipVariant }> = {
  high: { label: 'High', rank: 0, chip: 'danger' },
  medium: { label: 'Medium', rank: 1, chip: 'warning' },
  low: { label: 'Low', rank: 2, chip: 'neutral' },
}
const priorityOf = (p: string | null | undefined) =>
  priorityConfig[p as Opportunity['priority']] ?? priorityConfig.medium

const goalConfig: Record<Goal, string> = {
  internship: 'Internship',
  exchange: 'Exchange',
  funding: 'Funding',
  'social-growth': 'Social growth',
  users: 'Users',
}
const ALL_GOALS = Object.keys(goalConfig) as Goal[]

const eligibilityConfig: Record<Eligibility, string> = {
  'remote-global': 'Remote / Global',
  latam: 'LatAm',
  'us-eu': 'US / EU',
  other: 'Other',
  unknown: 'Unknown',
}
const eligibilityOf = (e: string | null | undefined) =>
  eligibilityConfig[e as Eligibility] ?? eligibilityConfig.unknown

const modalityConfig: Record<Modality, { label: string }> = {
  remote: { label: 'Remote' },
  hybrid: { label: 'Hybrid' },
  'in-person': { label: 'In-person' },
  unknown: { label: 'Unknown' },
}
/** Pills the user can filter by (the 'unknown' bucket isn't offered as a filter). */
const MODALITY_FILTERS: Modality[] = ['remote', 'hybrid', 'in-person']
/** Normalize possibly-absent modality (older records) to a valid key. */
const modalityOf = (o: Opportunity): Modality =>
  o.modality && modalityConfig[o.modality] ? o.modality : 'unknown'

const sourceConfig: Record<OppSource, { label: string }> = {
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
const sourceOf = (o: Opportunity) => sourceConfig[o.source] ?? sourceConfig.web

const deadlineTypeConfig: Record<DeadlineType, { label: string }> = {
  fixed: { label: 'Fixed date' },
  rolling: { label: 'Rolling' },
  recurring: { label: 'Recurring' },
  'always-open': { label: 'Always open' },
  unknown: { label: 'Unknown' },
}
const ALL_DEADLINE_TYPES = Object.keys(deadlineTypeConfig) as DeadlineType[]

/**
 * Normalize an item's deadline type at render time (mirrors scripts/radar-lib.mjs):
 * explicit valid value wins; legacy records derive rolling→'rolling',
 * dated→'fixed', else 'unknown'. All 68 legacy items render without migration.
 */
function deadlineTypeOf(o: Opportunity): DeadlineType {
  if (o.deadlineType && deadlineTypeConfig[o.deadlineType]) return o.deadlineType
  if (o.rolling === true) return 'rolling'
  if (o.deadline) return 'fixed'
  return 'unknown'
}

const effortConfig: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High' }
const ALL_EFFORTS = Object.keys(effortConfig) as Effort[]

// ── Region (geography) filter — the "click a tag to show only Colombia" axis ──
// Distinct from modality (the venue axis) and eligibility (who-can-apply): this buckets an
// item by WHERE in the world it is, read accent-insensitively from its location/title/tags.
type Region = 'colombia' | 'latam' | 'usa' | 'europe' | 'asia' | 'online' | 'other'
const regionConfig: Record<Region, { label: string; match: string[] }> = {
  colombia: { label: 'Colombia', match: ['colombia', 'medellin', 'bogota', 'cali', 'barranquilla', 'cartagena', 'bucaramanga', 'pereira', 'manizales'] },
  latam: { label: 'LatAm', match: ['latam', 'latin america', 'latinoamerica', 'mexico', 'brasil', 'brazil', 'argentina', 'chile', 'peru', 'ecuador', 'uruguay', 'bolivia', 'paraguay', 'venezuela', 'guatemala', 'costa rica', 'panama', 'dominican'] },
  usa: { label: 'USA', match: ['united states', ' usa', 'u.s.', 'san francisco', 'new york', 'boston', 'seattle', 'austin', 'silicon valley', 'california', 'chicago', 'los angeles'] },
  europe: { label: 'Europe', match: ['europe', 'london', 'berlin', 'paris', 'madrid', 'barcelona', 'amsterdam', 'lisbon', 'portugal', 'united kingdom', ' uk', 'germany', 'france', 'spain', 'netherlands', 'dublin', 'zurich', 'munich'] },
  asia: { label: 'Asia', match: ['asia', 'india', 'bangalore', 'bengaluru', 'singapore', 'tokyo', 'japan', 'china', 'shenzhen', 'hong kong', 'dubai', 'uae', 'seoul', 'jakarta'] },
  online: { label: 'Online', match: ['online', 'remote', 'virtual', 'global', 'worldwide', 'anywhere'] },
  other: { label: 'Other', match: [] },
}
/** Most-specific region wins: Colombia > LatAm > a named country > Online. */
const REGION_ORDER: Region[] = ['colombia', 'latam', 'usa', 'europe', 'asia', 'online', 'other']
const deburr = (s: string) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
function regionOf(o: Opportunity): Region {
  const hay = deburr(`${o.location} ${o.title} ${o.host} ${(o.tags || []).join(' ')}`)
  for (const r of REGION_ORDER) {
    if (r !== 'other' && regionConfig[r].match.some((m) => hay.includes(m))) return r
  }
  return 'other'
}
/** Region a hunt order's locations point at (e.g. ["Medellín","Bogotá"] -> 'colombia'). */
function regionForText(text: string): Region | null {
  const hay = deburr(text)
  for (const r of REGION_ORDER) {
    if (r !== 'other' && regionConfig[r].match.some((m) => hay.includes(m))) return r
  }
  return null
}

// ── Kind groups (the segmented filter: programs vs funding vs compete vs career) ──

type KindGroup = 'all' | 'programs' | 'funding' | 'compete' | 'career' | 'other'
const KIND_GROUPS: Record<Exclude<KindGroup, 'all'>, { label: string; categories: OpportunityCategory[] }> = {
  programs: { label: 'Programs', categories: ['program', 'fellowship', 'accelerator', 'residency'] },
  funding: { label: 'Funding', categories: ['grant', 'scholarship'] },
  compete: { label: 'Compete', categories: ['hackathon', 'competition', 'pitch'] },
  career: { label: 'Career', categories: ['internship', 'exchange'] },
  other: { label: 'Other', categories: ['speaking', 'community', 'launch', 'trending', 'research', 'other'] },
}
const kindGroupFor = (c: OpportunityCategory): KindGroup => {
  for (const [g, cfg] of Object.entries(KIND_GROUPS)) {
    if (cfg.categories.includes(c)) return g as KindGroup
  }
  return 'other'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
}
function daysUntil(d: string | null): number | null {
  if (!d) return null
  const ms = new Date(d).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}
/** Was this item discovered within the last 7 days? (drives the "New this week" KPI) */
function isNewThisWeek(o: Opportunity): boolean {
  return !!o.discoveredAt && (Date.now() - new Date(o.discoveredAt).getTime()) < 7 * 86_400_000
}
/** '$62.5k grant' style short money: 1500 -> $1.5k, 62500 -> $63k, 1000000 -> $1M. */
function fmtAmount(n: number): string {
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

// ── Urgency sections — the core deadline-intelligence view ───────────────────

type SectionKey = 'week' | 'month' | 'later' | 'rolling' | 'upcoming' | 'nodate' | 'closed'
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

function sectionOf(o: Opportunity): SectionKey {
  const dt = deadlineTypeOf(o)
  if (dt === 'rolling' || dt === 'always-open') return 'rolling'
  if (o.deadline) {
    const d = daysUntil(o.deadline)
    if (d !== null) {
      if (d < 0) return 'closed'
      if (d <= 7) return 'week'
      if (d <= 30) return 'month'
      return 'later'
    }
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

/** Countdown chip content for a row (mono, semantic tone by urgency). */
function countdownOf(o: Opportunity): { text: string; variant: ChipVariant; outline?: boolean; title?: string } {
  const dt = deadlineTypeOf(o)
  if (dt === 'rolling') return { text: 'rolling', variant: 'accent', outline: true }
  if (dt === 'always-open') return { text: 'always open', variant: 'accent', outline: true }
  if (o.deadline) {
    const d = daysUntil(o.deadline)
    if (d !== null) {
      if (d < 0) return { text: `closed ${fmtDate(o.deadline)}`, variant: 'neutral' }
      if (d <= 7) return { text: `D-${d}`, variant: 'danger', title: fmtDate(o.deadline) }
      if (d <= 14) return { text: `D-${d}`, variant: 'warning', title: fmtDate(o.deadline) }
      return { text: fmtDate(o.deadline), variant: 'neutral' }
    }
  }
  if (dt === 'recurring') {
    const hint = windowHint(o.nextWindowExpected)
    return { text: hint ?? 'recurring', variant: 'neutral', title: o.nextWindowExpected ?? undefined }
  }
  return { text: 'no date', variant: 'neutral' }
}

/** Does an opportunity satisfy a hunt order's parsed constraints? Drives progress counts. */
function objectiveMatches(o: Opportunity, p?: ObjectiveParsed): boolean {
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

/** Leverage as five dots — filled dots are the accent, empty ones sit on the hairline. */
function LeverageDots({ score }: { score: number }) {
  const n = Math.max(0, Math.min(5, Math.round(score)))
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5"
      role="img"
      aria-label={`Leverage ${n} of 5`}
      title={`Leverage ${n}/5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} aria-hidden className={`h-1.5 w-1.5 rounded-full ${i < n ? 'bg-accent' : 'bg-border'}`} />
      ))}
    </span>
  )
}

// Shared token style for native <select> controls (mirrors the Input primitive).
const selectCls =
  'h-8 w-full cursor-pointer rounded-md border border-input bg-input/20 px-2 text-xs text-foreground transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

// ── Component ────────────────────────────────────────────────────────────────

export function OpportunitiesPage() {
  const [data, updateData] = useStore<OppData>('cortex-opportunities', DEFAULT_DATA)
  const items = useMemo(() => data.items || [], [data.items])

  const [search, setSearch] = useState('')
  const [kindGroup, setKindGroup] = useState<KindGroup>('all')
  const [catFilter, setCatFilter] = useState<OpportunityCategory | null>(null)
  const [modalityFilter, setModalityFilter] = useState<Modality | null>(null)
  const [statusFilter, setStatusFilter] = useState<OppStatus | null>(null)
  const [regionFilter, setRegionFilter] = useState<Region | null>(null)
  const [thisRunOnly, setThisRunOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const setItems = (fn: (prev: Opportunity[]) => Opportunity[]) =>
    updateData((p) => ({ ...p, items: fn(p.items || []) }))

  const setField = (id: string, f: Partial<Opportunity>) =>
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, ...f } : o)))

  const deleteOpp = (id: string) => {
    setItems((prev) => prev.filter((o) => o.id !== id))
    if (expanded === id) setExpanded(null)
  }

  const running = data.runStatus === 'requested' || data.runStatus === 'running'
  const requestRun = () => {
    if (running) return
    updateData((p) => ({ ...p, runRequestedAt: new Date().toISOString(), runStatus: 'requested', runError: undefined }))
  }

  // ── Hunt orders (talk to radar) ─────────────────────────────────────────────
  const objectives = data.objectives || []
  const [objInput, setObjInput] = useState('')
  const addObjective = () => {
    const text = objInput.trim()
    if (!text) return
    const o: Objective = {
      id: `obj-${Date.now()}`, text, status: 'thinking', active: true,
      createdAt: new Date().toISOString(),
    }
    updateData((p) => ({ ...p, objectives: [...(p.objectives || []), o] }))
    setObjInput('')
  }
  const setObjective = (id: string, f: Partial<Objective>) =>
    updateData((p) => ({ ...p, objectives: (p.objectives || []).map((o) => (o.id === id ? { ...o, ...f } : o)) }))
  const deleteObjective = (id: string) =>
    updateData((p) => ({ ...p, objectives: (p.objectives || []).filter((o) => o.id !== id) }))
  // Jump the list to an objective's matches: filter to its region (so "1/20 found" lands
  // on the actual Colombia rows) and clear competing filters.
  const showObjectiveMatches = (p?: ObjectiveParsed) => {
    const region = p?.locations?.length ? regionForText(p.locations.join(' ')) : null
    const cat = p?.category ?? null
    setCatFilter(cat)
    setKindGroup(cat ? kindGroupFor(cat) : 'all')
    setRegionFilter(region)
    setSearch(region ? '' : (p?.locations?.[0] ?? p?.keywords?.[0] ?? ''))
    setModalityFilter(null); setStatusFilter(null)
    setThisRunOnly(false); setShowArchived(false)
  }

  const addOpp = () => {
    const now = new Date().toISOString()
    const o: Opportunity = {
      id: `opp-${Date.now()}`, title: 'New opportunity', host: '',
      category: 'other', goals: [], priority: 'medium', leverageScore: 3,
      leverageNote: '', status: 'new', deadline: null, rolling: false,
      deadlineType: 'unknown', recurrence: null, nextWindowExpected: null,
      amountUsd: null, requires18Plus: null, effort: null, officialUrl: '',
      location: '', modality: 'unknown', eligibility: 'unknown', reward: '', url: '',
      source: 'manual', sourceRef: '', discoveredAt: now, notes: '', tags: [],
    }
    setItems((prev) => [o, ...prev])
    setExpanded(o.id)
  }

  const toggleGoal = (id: string, g: Goal) =>
    setItems((prev) => prev.map((o) => o.id === id
      ? { ...o, goals: o.goals.includes(g) ? o.goals.filter((x) => x !== g) : [...o.goals, g] }
      : o))

  // ── Filtering + urgency grouping ────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const groupCats = kindGroup === 'all' ? null : KIND_GROUPS[kindGroup].categories
    return items.filter((o) =>
      (showArchived || o.status !== 'archived') &&
      (!groupCats || groupCats.includes(o.category) || (kindGroup === 'other' && !categoryConfig[o.category])) &&
      (!catFilter || o.category === catFilter) &&
      (!modalityFilter || modalityOf(o) === modalityFilter) &&
      (!statusFilter || o.status === statusFilter) &&
      (!regionFilter || regionOf(o) === regionFilter) &&
      (!thisRunOnly || (data.lastRunId != null && o.runId === data.lastRunId)) &&
      (!search || o.title.toLowerCase().includes(q) || o.host.toLowerCase().includes(q) ||
        o.notes.toLowerCase().includes(q) || o.location.toLowerCase().includes(q) ||
        (o.tags || []).some((t) => t.toLowerCase().includes(q)))
    )
  }, [items, search, kindGroup, catFilter, modalityFilter, statusFilter, regionFilter, thisRunOnly, showArchived, data.lastRunId])

  const sections = useMemo(() => {
    const buckets = new Map<SectionKey, Opportunity[]>()
    for (const o of filtered) {
      const k = sectionOf(o)
      if (!buckets.has(k)) buckets.set(k, [])
      buckets.get(k)!.push(o)
    }
    return SECTION_ORDER
      .filter((k) => buckets.has(k))
      .map((k) => ({ key: k, ...SECTION_META[k], items: buckets.get(k)!.sort((a, b) => sectionSort(k, a, b)) }))
  }, [filtered])

  // Regions actually present in the data — drives the geography chip row (no empty chips).
  const availableRegions = useMemo(() => {
    const present = new Set(items.map(regionOf))
    return REGION_ORDER.filter((r) => present.has(r))
  }, [items])

  // ── KPIs (over non-archived) ────────────────────────────────────────────────
  const live = items.filter((o) => o.status !== 'archived')
  const openCount = live.filter((o) => o.status === 'new' || o.status === 'pursuing').length
  const closingWeek = live.filter((o) => sectionOf(o) === 'week').length
  const rollingCount = live.filter((o) => {
    const dt = deadlineTypeOf(o)
    return dt === 'rolling' || dt === 'always-open'
  }).length
  const newThisWeek = live.filter(isNewThisWeek).length
  const thisRunCount = data.lastRunId ? items.filter((o) => o.runId === data.lastRunId).length : 0

  // TOP PICKS — deadline-aware leverage ranking:
  //   score = priorityWeight × leverageScore × urgencyBoost
  //     priorityWeight : high 3 · medium 2 · low 1
  //     leverageScore  : 1..5 (from the radar/profile scoring)
  //     urgencyBoost   : a dated deadline within 7 days ×2, within 14 days ×1.5, else ×1
  //   Overdue items are excluded entirely; ties break toward the sooner deadline.
  const topPicks = useMemo(() => {
    const weight = { high: 3, medium: 2, low: 1 } as const
    const scored = items
      .filter((o) => o.status === 'new' || o.status === 'pursuing')
      .map((o) => {
        const d = o.deadline ? daysUntil(o.deadline) : null
        if (d !== null && d < 0 && !o.rolling) return null // overdue — never a pick
        const boost = d !== null && d >= 0 ? (d <= 7 ? 2 : d <= 14 ? 1.5 : 1) : 1
        const score = (weight[o.priority] ?? 2) * o.leverageScore * boost
        return { o, score, d }
      })
      .filter((x): x is { o: Opportunity; score: number; d: number | null } => x !== null)
    scored.sort((a, b) => (b.score - a.score) || ((a.d ?? Infinity) - (b.d ?? Infinity)))
    return scored.slice(0, 5).map((x) => x.o)
  }, [items])

  return (
    <PageShell>
      <Tabs defaultValue="radar">
        <TabsList>
          <TabsTrigger value="radar">Radar</TabsTrigger>
          <TabsTrigger value="growth">Fastest growing</TabsTrigger>
        </TabsList>

        <TabsContent value="radar">
          <div className="flex flex-col gap-6">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile variant="glass" label="Open" value={openCount} icon={<Target />} />
              <StatTile variant="glass" label="Closing ≤7d" value={closingWeek} icon={<CalendarClock />} />
              <StatTile variant="glass" label="Rolling / open" value={rollingCount} icon={<InfinityIcon />} />
              <StatTile variant="glass" label="New this week" value={newThisWeek} icon={<Sparkles />} />
            </div>

            {/* Radar report — what landed + what to look at first */}
            {(data.report || data.lastRun || topPicks.length > 0) && (
              <WidgetCard
                title="This week's radar"
                description={data.lastRun
                  ? `Ran ${new Date(data.lastRun).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${thisRunCount ? ` · ${thisRunCount} new` : ''}`
                  : 'Not run yet — add opportunities manually or trigger the radar routine.'}
                delay={0.05}
              >
                <div className="flex flex-col gap-4">
                  {data.report && (
                    <div className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">{data.report}</div>
                  )}
                  {topPicks.length > 0 && (
                    <div>
                      <p className="mb-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground">Top picks</p>
                      <div className="flex flex-col gap-1">
                        {topPicks.map((o, i) => {
                          const cd = countdownOf(o)
                          return (
                            <div
                              key={o.id}
                              onClick={() => { setExpanded(o.id); setThisRunOnly(false); setShowArchived(false) }}
                              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/40"
                            >
                              <span className="w-4 shrink-0 font-mono text-2xs tabular-nums text-foreground-faint">{i + 1}</span>
                              <Chip size="sm" variant={priorityOf(o.priority).chip}>{priorityOf(o.priority).label}</Chip>
                              <Chip size="sm">{categoryOf(o.category).label}</Chip>
                              <span className="truncate text-xs font-medium text-foreground">{o.title}</span>
                              {o.leverageNote && <span className="hidden truncate text-xs text-foreground-faint sm:inline">— {o.leverageNote}</span>}
                              <span className="ml-auto shrink-0">
                                <Chip size="sm" variant={cd.variant} className={cd.outline ? 'bg-transparent' : undefined} title={cd.title}>{cd.text}</Chip>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </WidgetCard>
            )}

            {/* Hunt orders — talk to radar in plain language */}
            <WidgetCard
              title="Tell radar what to hunt"
              description="Say it like you'd say it out loud — “I need 20 remote internships paying $2k+, deadline before Sept”. Radar reads it, then prioritizes those on every run."
              delay={0.1}
            >
              <div className="flex flex-col gap-3">
                {objectives.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    {objectives.map((obj) => {
                      const found = obj.parsed ? items.filter((o) => objectiveMatches(o, obj.parsed)).length : 0
                      const target = obj.parsed?.targetCount ?? null
                      const pct = target ? Math.min(100, Math.round((found / target) * 100)) : 0
                      const chips: string[] = []
                      if (obj.parsed?.category) chips.push(categoryOf(obj.parsed.category).label)
                      if (obj.parsed?.locations?.length) chips.push(obj.parsed.locations.join(' · '))
                      if (obj.parsed?.eligibility) chips.push(eligibilityOf(obj.parsed.eligibility))
                      if (obj.parsed?.salaryText) chips.push(obj.parsed.salaryText)
                      if (obj.parsed?.deadlineBefore) chips.push(`by ${fmtDate(obj.parsed.deadlineBefore)}`)
                      return (
                        <div key={obj.id} className={`rounded-xl border p-3 transition-opacity ${obj.active ? 'border-border' : 'border-border/60 opacity-60'}`}>
                          <div className="flex items-start gap-2.5">
                            <Crosshair className={`mt-0.5 size-3.5 shrink-0 ${obj.active ? 'text-accent' : 'text-foreground-faint'}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium leading-snug text-foreground">{obj.text}</p>
                              {obj.status === 'thinking' && (
                                <p className="mt-1 text-xs text-foreground-faint">Radar is reading this order…</p>
                              )}
                              {obj.status === 'error' && (
                                <p className="mt-1 text-xs text-destructive">Couldn't read this: {obj.error || 'agent error'} — it still steers the next run as written.</p>
                              )}
                              {obj.status === 'ready' && obj.reply && (
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{obj.reply}</p>
                              )}
                              {chips.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {chips.map((c, i) => <Chip key={i} size="sm">{c}</Chip>)}
                                </div>
                              )}
                              {obj.status === 'ready' && (
                                <div className="mt-2 flex max-w-sm items-center gap-2">
                                  {target ? (
                                    <>
                                      <Progress value={pct} className="flex-1" />
                                      <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">{found} / {target} found</span>
                                    </>
                                  ) : (
                                    <span className="font-mono text-2xs tabular-nums text-muted-foreground">{found} match{found === 1 ? '' : 'es'} so far</span>
                                  )}
                                  <Button variant="ghost" size="xs" onClick={() => showObjectiveMatches(obj.parsed)}>View</Button>
                                </div>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Chip
                                selectable
                                selected={obj.active}
                                size="sm"
                                onClick={() => setObjective(obj.id, { active: !obj.active })}
                                title={obj.active ? 'Pause (stop steering radar)' : 'Resume'}
                              >
                                {obj.active ? 'Active' : 'Paused'}
                              </Chip>
                              <Button variant="ghost" size="icon-xs" aria-label="Remove hunt order" onClick={() => deleteObjective(obj.id)}>
                                <X />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Composer */}
                <div className="flex items-end gap-2">
                  <textarea
                    value={objInput}
                    onChange={(e) => setObjInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addObjective() } }}
                    rows={2}
                    placeholder="e.g. Find me 20 remote software internships paying $2k+/mo with deadlines before September…"
                    className="flex-1 resize-none rounded-md border border-input bg-input/20 px-2.5 py-2 text-xs text-foreground outline-none transition-colors duration-150 placeholder:text-foreground-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                  <Button size="sm" onClick={addObjective} disabled={!objInput.trim()}>
                    <Send /> Send
                  </Button>
                </div>
                <p className="-mt-1 font-mono text-2xs text-foreground-faint">⌘↵ to send · active orders steer the next “Run radar”.</p>
              </div>
            </WidgetCard>

            {/* Filter rail */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative max-w-xs flex-1">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground-faint" />
                  <Input placeholder="Search opportunities…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 text-xs" />
                </div>
                {data.lastRunId && (
                  <Chip selectable selected={thisRunOnly} onClick={() => setThisRunOnly((v) => !v)}>This run</Chip>
                )}
                <Chip selectable selected={showArchived} onClick={() => setShowArchived((v) => !v)}>Show archived</Chip>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={requestRun}
                    disabled={running}
                    title={running ? 'Radar is running…' : 'Scrape all lanes now and refresh the page'}
                  >
                    <RefreshCw /> {running ? (data.runStatus === 'requested' ? 'Queued…' : 'Running…') : 'Run radar'}
                  </Button>
                  <Button size="sm" onClick={addOpp}><Plus /> Add</Button>
                </div>
              </div>
              {data.runStatus === 'error' && data.runError && (
                <p className="text-xs text-destructive">Last radar run failed: {data.runError}</p>
              )}

              {/* Kind group — segmented control + per-category chips within the group */}
              <div className="flex flex-wrap items-center gap-3">
                <Tabs value={kindGroup} onValueChange={(v) => { setKindGroup(v as KindGroup); setCatFilter(null) }}>
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    {(Object.keys(KIND_GROUPS) as Exclude<KindGroup, 'all'>[]).map((g) => (
                      <TabsTrigger key={g} value={g}>{KIND_GROUPS[g].label}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                {kindGroup !== 'all' && (
                  <div className="flex flex-wrap gap-1.5">
                    {KIND_GROUPS[kindGroup].categories.map((c) => (
                      <Chip key={c} selectable selected={catFilter === c} onClick={() => setCatFilter(catFilter === c ? null : c)}>
                        {categoryOf(c).label}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>

              {/* Status · modality · region chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                {ALL_STATUSES.map((s) => (
                  <Chip key={s} selectable variant={statusConfig[s].chip} selected={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? null : s)}>
                    {statusConfig[s].label}
                  </Chip>
                ))}
                <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />
                {MODALITY_FILTERS.map((m) => (
                  <Chip key={m} selectable selected={modalityFilter === m} onClick={() => setModalityFilter(modalityFilter === m ? null : m)}>
                    {modalityConfig[m].label}
                  </Chip>
                ))}
                {availableRegions.length > 1 && <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />}
                {availableRegions.length > 1 && availableRegions.map((r) => (
                  <Chip key={r} selectable selected={regionFilter === r} onClick={() => setRegionFilter(regionFilter === r ? null : r)}>
                    {regionConfig[r].label}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Urgency-grouped list — the core deadline-intelligence view */}
            {filtered.length === 0 ? (
              <EmptyState
                message={items.length === 0 ? 'The radar hasn’t surfaced anything yet.' : 'Nothing matches these filters.'}
                hint={items.length === 0 ? 'It fills weekly — or add one yourself.' : 'Loosen a chip or two.'}
                action={items.length === 0 ? <Button variant="secondary" size="sm" onClick={addOpp}><Plus /> Add opportunity</Button> : undefined}
              />
            ) : (
              <div className="flex flex-col gap-5">
                {sections.map((section) => (
                  <section key={section.key}>
                    <div className="mb-2 flex items-baseline gap-2">
                      <h3 className={`font-mono text-2xs uppercase tracking-wider ${section.tone}`}>{section.title}</h3>
                      <span className="font-mono text-2xs tabular-nums text-foreground-faint">{section.items.length}</span>
                    </div>
                    <div className={`surface rounded-xl ${section.dim ? 'opacity-70' : ''}`}>
                      <div className="flex flex-col divide-y divide-border/60">
                        {section.items.map((o) => (
                          <OppRow
                            key={o.id}
                            o={o}
                            expanded={expanded === o.id}
                            onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
                            setField={setField}
                            toggleGoal={toggleGoal}
                            onDelete={() => deleteOpp(o.id)}
                          />
                        ))}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="growth">
          <GrowthProjectsPanel />
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}

// ── Row (desktop) / stacked card (mobile) ────────────────────────────────────

function OppRow({ o, expanded, onToggle, setField, toggleGoal, onDelete }: {
  o: Opportunity
  expanded: boolean
  onToggle: () => void
  setField: (id: string, f: Partial<Opportunity>) => void
  toggleGoal: (id: string, g: Goal) => void
  onDelete: () => void
}) {
  const cd = countdownOf(o)
  return (
    <div>
      <div
        onClick={onToggle}
        className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-secondary/30 ${expanded ? 'bg-secondary/20' : ''}`}
      >
        <div className="min-w-0 flex-1 basis-52">
          <p className="truncate text-sm font-medium text-foreground">{o.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {o.host || eligibilityOf(o.eligibility)}
            {o.location ? ` · ${o.location}` : ''}
          </p>
        </div>
        <Chip size="sm">{categoryOf(o.category).label}</Chip>
        <Chip size="sm" variant={cd.variant} className={cd.outline ? 'bg-transparent' : undefined} title={cd.title}>{cd.text}</Chip>
        {o.amountUsd != null && (
          <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">{fmtAmount(o.amountUsd)}</span>
        )}
        {o.requires18Plus === true && (
          <Chip size="sm" variant="danger" className="bg-transparent" title="Requires 18+ — check eligibility">18+</Chip>
        )}
        <LeverageDots score={o.leverageScore} />
        <select
          value={statusConfig[o.status] ? o.status : 'new'}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setField(o.id, { status: e.target.value as OppStatus })}
          aria-label="Status"
          className={`h-7 w-24 shrink-0 cursor-pointer rounded-md border border-input bg-input/20 px-1.5 font-mono text-2xs outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${statusOf(o.status).text}`}
        >
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}
        </select>
        <div className="flex shrink-0 items-center gap-0.5">
          {o.url && (
            <a
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Open link"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Delete opportunity" onClick={(e) => { e.stopPropagation(); onDelete() }}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border/60 bg-secondary/10 px-4 py-4">
          <EditForm o={o} setField={setField} toggleGoal={toggleGoal} onDelete={onDelete} />
        </div>
      )}
    </div>
  )
}

// ── Edit form (shared desktop + mobile) ───────────────────────────────────────

const labelCls = 'text-2xs text-muted-foreground'

function EditForm({ o, setField, toggleGoal, onDelete }: {
  o: Opportunity
  setField: (id: string, f: Partial<Opportunity>) => void
  toggleGoal: (id: string, g: Goal) => void
  onDelete: () => void
}) {
  const dt = deadlineTypeOf(o)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Col 1 — identity */}
      <div className="flex flex-col gap-2">
        <div>
          <label className={labelCls}>Title</label>
          <Input value={o.title} onChange={(e) => setField(o.id, { title: e.target.value })} className="h-7 text-xs font-medium" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Host</label>
            <Input value={o.host} onChange={(e) => setField(o.id, { host: e.target.value })} className="h-7 text-xs" />
          </div>
          <div>
            <label className={labelCls}>Location</label>
            <Input value={o.location} onChange={(e) => setField(o.id, { location: e.target.value })} className="h-7 text-xs" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Category</label>
            <select value={categoryConfig[o.category] ? o.category : 'other'} onChange={(e) => setField(o.id, { category: e.target.value as OpportunityCategory })} className={`${selectCls} h-7`}>
              {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{categoryConfig[c].label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Modality</label>
            <select value={modalityOf(o)} onChange={(e) => setField(o.id, { modality: e.target.value as Modality })} className={`${selectCls} h-7`}>
              {(Object.keys(modalityConfig) as Modality[]).map((m) => <option key={m} value={m}>{modalityConfig[m].label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Eligibility</label>
            <select value={eligibilityConfig[o.eligibility] ? o.eligibility : 'unknown'} onChange={(e) => setField(o.id, { eligibility: e.target.value as Eligibility })} className={`${selectCls} h-7`}>
              {(Object.keys(eligibilityConfig) as Eligibility[]).map((el) => <option key={el} value={el}>{eligibilityConfig[el]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Effort to apply</label>
            <select
              value={o.effort && effortConfig[o.effort] ? o.effort : ''}
              onChange={(e) => setField(o.id, { effort: (e.target.value || null) as Effort | null })}
              className={`${selectCls} h-7`}
            >
              <option value="">Unknown</option>
              {ALL_EFFORTS.map((e) => <option key={e} value={e}>{effortConfig[e]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Apply / discovery link</label>
          <Input value={o.url} onChange={(e) => setField(o.id, { url: e.target.value })} placeholder="https://…" className="h-7 font-mono text-xs" />
        </div>
        <div>
          <label className={labelCls}>Official program page</label>
          <Input value={o.officialUrl ?? ''} onChange={(e) => setField(o.id, { officialUrl: e.target.value })} placeholder="https://…" className="h-7 font-mono text-xs" />
        </div>
      </div>

      {/* Col 2 — status / deadline intelligence / money */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Status</label>
            <select value={statusConfig[o.status] ? o.status : 'new'} onChange={(e) => setField(o.id, { status: e.target.value as OppStatus })} className={`${selectCls} h-7`}>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Priority</label>
            <select value={priorityConfig[o.priority] ? o.priority : 'medium'} onChange={(e) => setField(o.id, { priority: e.target.value as Opportunity['priority'] })} className={`${selectCls} h-7`}>
              {(['high', 'medium', 'low'] as const).map((p) => <option key={p} value={p}>{priorityConfig[p].label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Deadline type</label>
            {/* Replaces the old "Rolling" checkbox — writing it keeps the legacy boolean in sync. */}
            <select
              value={dt}
              onChange={(e) => {
                const v = e.target.value as DeadlineType
                setField(o.id, { deadlineType: v, rolling: v === 'rolling' || v === 'always-open' })
              }}
              className={`${selectCls} h-7`}
            >
              {ALL_DEADLINE_TYPES.map((d) => <option key={d} value={d}>{deadlineTypeConfig[d].label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Deadline</label>
            <Input type="date" value={o.deadline ?? ''} onChange={(e) => setField(o.id, { deadline: e.target.value || null })} className="h-7 cursor-pointer font-mono text-xs" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Recurrence</label>
            <Input value={o.recurrence ?? ''} onChange={(e) => setField(o.id, { recurrence: e.target.value || null })} placeholder="annual, 2 batches/yr…" className="h-7 text-xs" />
          </div>
          <div>
            <label className={labelCls}>Next window expected</label>
            <Input value={o.nextWindowExpected ?? ''} onChange={(e) => setField(o.id, { nextWindowExpected: e.target.value || null })} placeholder="~Sep 2026 (estimate)" className="h-7 text-xs" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Amount (USD)</label>
            <Input
              type="number"
              min={0}
              value={o.amountUsd ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim()
                const n = Number(v)
                setField(o.id, { amountUsd: v === '' || !Number.isFinite(n) ? null : Math.max(0, Math.round(n)) })
              }}
              placeholder="50000"
              className="h-7 font-mono text-xs tabular-nums"
            />
          </div>
          <div>
            <label className={labelCls}>Age rule</label>
            <select
              value={o.requires18Plus === true ? 'yes' : o.requires18Plus === false ? 'no' : ''}
              onChange={(e) => setField(o.id, { requires18Plus: e.target.value === '' ? null : e.target.value === 'yes' })}
              className={`${selectCls} h-7`}
            >
              <option value="">Unstated</option>
              <option value="yes">Requires 18+</option>
              <option value="no">Minors OK</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Reward / prize</label>
          <Input value={o.reward} onChange={(e) => setField(o.id, { reward: e.target.value })} placeholder="$5k, stipend, credits…" className="h-7 text-xs" />
        </div>
        <div>
          <label className={labelCls}>Leverage: <span className="font-mono tabular-nums">{o.leverageScore}/5</span></label>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={o.leverageScore}
            onChange={(e) => setField(o.id, { leverageScore: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
            style={{ accentColor: 'var(--accent)' }}
          />
        </div>
        <div>
          <label className={labelCls}>Leverage note (what it unlocks)</label>
          <Input value={o.leverageNote} onChange={(e) => setField(o.id, { leverageNote: e.target.value })} placeholder="e.g. funding + press + investor intros" className="h-7 text-xs" />
        </div>
      </div>

      {/* Col 3 — goals / notes / tags */}
      <div className="flex flex-col gap-2">
        <label className={labelCls}>Goals it serves</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_GOALS.map((g) => (
            <Chip key={g} selectable selected={o.goals.includes(g)} onClick={() => toggleGoal(o.id, g)}>
              {goalConfig[g]}
            </Chip>
          ))}
        </div>
        <label className={labelCls}>Notes</label>
        <textarea
          value={o.notes}
          onChange={(e) => setField(o.id, { notes: e.target.value })}
          rows={4}
          placeholder="Why it matters, what to prepare, source excerpt…"
          className="w-full resize-none rounded-md border border-input bg-input/20 px-2.5 py-2 text-xs text-foreground outline-none transition-colors duration-150 placeholder:text-foreground-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <label className={labelCls}>Tags (comma-separated)</label>
        <Input
          value={(o.tags || []).join(', ')}
          onChange={(e) => setField(o.id, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
          placeholder="remote, ai, latam…"
          className="h-7 font-mono text-xs"
        />
        <div className="mt-1 flex items-center gap-2">
          <Chip size="sm" title="Where the radar found it">{sourceOf(o).label}</Chip>
          {o.sourceRef && (
            <a href={o.sourceRef} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-2xs text-muted-foreground transition-colors hover:text-foreground">
              <ExternalLink className="size-3" /> Source post
            </a>
          )}
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>
    </div>
  )
}
