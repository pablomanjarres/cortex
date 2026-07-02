import { useState, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import {
  Search,
  Plus,
  Trash2,
  ExternalLink,
  Target,
  CalendarClock,
  Flame,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export type OpportunityCategory =
  | 'hackathon' | 'grant' | 'accelerator' | 'fellowship' | 'internship'
  | 'exchange' | 'competition' | 'pitch' | 'speaking' | 'scholarship'
  | 'community' | 'launch' | 'trending' | 'other'

export type Goal = 'internship' | 'exchange' | 'funding' | 'social-growth' | 'users'

export type Eligibility = 'remote-global' | 'latam' | 'us-eu' | 'other' | 'unknown'

export type OppStatus = 'new' | 'pursuing' | 'applied' | 'won' | 'lost' | 'archived'

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
  rolling: boolean
  location: string
  eligibility: Eligibility
  reward: string
  url: string
  source: 'x' | 'linkedin' | 'reddit' | 'instagram' | 'github' | 'manual'
  sourceRef: string
  discoveredAt: string
  /** Which radar run surfaced this item (ISO stamp). 'manual' for hand-added. */
  runId?: string
  notes: string
  tags: string[]
}

interface OppData {
  items: Opportunity[]
  lastRun: string | null
  /** Id (== timestamp) of the latest radar run, for the "this run" filter. */
  lastRunId?: string
  /** Markdown digest written by the weekly routine: what landed + what to look at. */
  report?: string
}

const DEFAULT_DATA: OppData = { items: [], lastRun: null }

// ── Config ───────────────────────────────────────────────────────────────────

const categoryConfig: Record<OpportunityCategory, { label: string; color: string }> = {
  hackathon: { label: 'Hackathon', color: 'bg-violet-500/15 text-violet-400' },
  grant: { label: 'Grant', color: 'bg-green-500/15 text-green-400' },
  accelerator: { label: 'Accelerator', color: 'bg-orange-500/15 text-orange-400' },
  fellowship: { label: 'Fellowship', color: 'bg-teal-500/15 text-teal-400' },
  internship: { label: 'Internship', color: 'bg-blue-500/15 text-blue-400' },
  exchange: { label: 'Exchange', color: 'bg-cyan-500/15 text-cyan-400' },
  competition: { label: 'Competition', color: 'bg-fuchsia-500/15 text-fuchsia-400' },
  pitch: { label: 'Pitch', color: 'bg-pink-500/15 text-pink-400' },
  speaking: { label: 'Speaking', color: 'bg-amber-500/15 text-amber-400' },
  scholarship: { label: 'Scholarship', color: 'bg-emerald-500/15 text-emerald-400' },
  community: { label: 'Community', color: 'bg-indigo-500/15 text-indigo-400' },
  launch: { label: 'Launch', color: 'bg-rose-500/15 text-rose-400' },
  trending: { label: 'Trending', color: 'bg-lime-500/15 text-lime-400' },
  other: { label: 'Other', color: 'bg-secondary text-muted-foreground' },
}
const ALL_CATEGORIES = Object.keys(categoryConfig) as OpportunityCategory[]

const priorityConfig: Record<Opportunity['priority'], { label: string; color: string; rank: number }> = {
  high: { label: 'High', color: 'bg-red-500/15 text-red-400', rank: 0 },
  medium: { label: 'Medium', color: 'bg-yellow-500/15 text-yellow-400', rank: 1 },
  low: { label: 'Low', color: 'bg-secondary text-muted-foreground', rank: 2 },
}

const statusConfig: Record<OppStatus, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-500/15 text-blue-400' },
  pursuing: { label: 'Pursuing', color: 'bg-violet-500/15 text-violet-400' },
  applied: { label: 'Applied', color: 'bg-amber-500/15 text-amber-400' },
  won: { label: 'Won', color: 'bg-green-500/15 text-green-400' },
  lost: { label: 'Lost', color: 'bg-red-500/15 text-red-400' },
  archived: { label: 'Archived', color: 'bg-secondary text-muted-foreground' },
}
const ALL_STATUSES = Object.keys(statusConfig) as OppStatus[]

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

const sourceConfig: Record<Opportunity['source'], { label: string; color: string }> = {
  x: { label: 'X', color: 'bg-neutral-500/15 text-neutral-300' },
  linkedin: { label: 'LinkedIn', color: 'bg-sky-500/15 text-sky-400' },
  reddit: { label: 'Reddit', color: 'bg-orange-500/15 text-orange-400' },
  instagram: { label: 'Instagram', color: 'bg-pink-500/15 text-pink-400' },
  github: { label: 'GitHub', color: 'bg-purple-500/15 text-purple-400' },
  manual: { label: 'Manual', color: 'bg-secondary text-muted-foreground' },
}

type SortKey = 'deadline' | 'priority' | 'leverageScore' | 'discoveredAt' | 'title'

type DueBucket = 'all' | 'overdue' | 'week' | 'twoWeeks' | 'month' | 'rolling'
const dueBucketLabel: Record<DueBucket, string> = {
  all: 'Any deadline',
  overdue: 'Overdue',
  week: 'Next week',
  twoWeeks: 'Next 2 weeks',
  month: 'Next month',
  rolling: 'Rolling / open',
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
function deadlineLabel(o: Opportunity): { text: string; tone: string } {
  if (o.rolling) return { text: 'Rolling', tone: 'text-muted-foreground' }
  if (!o.deadline) return { text: '—', tone: 'text-muted-foreground' }
  const d = daysUntil(o.deadline)
  if (d === null) return { text: '—', tone: 'text-muted-foreground' }
  if (d < 0) return { text: `${fmtDate(o.deadline)} (past)`, tone: 'text-red-400/70' }
  if (d <= 7) return { text: `${fmtDate(o.deadline)} · ${d}d`, tone: 'text-red-400' }
  if (d <= 14) return { text: `${fmtDate(o.deadline)} · ${d}d`, tone: 'text-yellow-400' }
  return { text: fmtDate(o.deadline), tone: 'text-muted-foreground' }
}
function matchesDueBucket(o: Opportunity, bucket: DueBucket): boolean {
  if (bucket === 'all') return true
  if (bucket === 'rolling') return o.rolling
  if (o.rolling || !o.deadline) return false
  const d = daysUntil(o.deadline)
  if (d === null) return false
  if (bucket === 'overdue') return d < 0
  if (d < 0) return false
  if (bucket === 'week') return d <= 7
  if (bucket === 'twoWeeks') return d <= 14
  if (bucket === 'month') return d <= 30
  return true
}
function Leverage({ score }: { score: number }) {
  const n = Math.max(0, Math.min(5, Math.round(score)))
  return (
    <span className="inline-flex gap-0.5" title={`Leverage ${n}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < n ? 'text-amber-400' : 'text-muted-foreground/25'}>★</span>
      ))}
    </span>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function OpportunitiesPage() {
  const [data, updateData] = useStore<OppData>('cortex-opportunities', DEFAULT_DATA)
  const items = data.items || []

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<OpportunityCategory | null>(null)
  const [statusFilter, setStatusFilter] = useState<OppStatus | null>(null)
  const [goalFilter, setGoalFilter] = useState<Goal | null>(null)
  const [sourceFilter, setSourceFilter] = useState<Opportunity['source'] | null>(null)
  const [dueBucket, setDueBucket] = useState<DueBucket>('all')
  const [thisRunOnly, setThisRunOnly] = useState(false)
  const [hideArchived, setHideArchived] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('deadline')
  const [sortAsc, setSortAsc] = useState(true)

  const setItems = (fn: (prev: Opportunity[]) => Opportunity[]) =>
    updateData((p) => ({ ...p, items: fn(p.items || []) }))

  const setField = (id: string, f: Partial<Opportunity>) =>
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, ...f } : o)))

  const deleteOpp = (id: string) => {
    setItems((prev) => prev.filter((o) => o.id !== id))
    if (expanded === id) setExpanded(null)
  }

  const addOpp = () => {
    const now = new Date().toISOString()
    const o: Opportunity = {
      id: `opp-${Date.now()}`, title: 'New opportunity', host: '',
      category: 'other', goals: [], priority: 'medium', leverageScore: 3,
      leverageNote: '', status: 'new', deadline: null, rolling: false,
      location: '', eligibility: 'unknown', reward: '', url: '',
      source: 'manual', sourceRef: '', discoveredAt: now, notes: '', tags: [],
    }
    setItems((prev) => [o, ...prev])
    setExpanded(o.id)
  }

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((p) => !p)
    else { setSortKey(k); setSortAsc(k === 'deadline' || k === 'title') }
  }
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />

  const toggleGoal = (id: string, g: Goal) =>
    setItems((prev) => prev.map((o) => o.id === id
      ? { ...o, goals: o.goals.includes(g) ? o.goals.filter((x) => x !== g) : [...o.goals, g] }
      : o))

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const list = items.filter((o) =>
      (!hideArchived || o.status !== 'archived') &&
      (!catFilter || o.category === catFilter) &&
      (!statusFilter || o.status === statusFilter) &&
      (!goalFilter || o.goals.includes(goalFilter)) &&
      (!sourceFilter || o.source === sourceFilter) &&
      (!thisRunOnly || (data.lastRunId != null && o.runId === data.lastRunId)) &&
      matchesDueBucket(o, dueBucket) &&
      (!search || o.title.toLowerCase().includes(q) || o.host.toLowerCase().includes(q) ||
        o.notes.toLowerCase().includes(q) || o.tags.some((t) => t.toLowerCase().includes(q)))
    )
    list.sort((a, b) => {
      let v = 0
      switch (sortKey) {
        case 'deadline': {
          // rolling / null sink to the bottom regardless of direction
          const av = a.rolling || !a.deadline ? Infinity : new Date(a.deadline).getTime()
          const bv = b.rolling || !b.deadline ? Infinity : new Date(b.deadline).getTime()
          if (av === Infinity && bv === Infinity) return 0
          if (av === Infinity) return 1
          if (bv === Infinity) return -1
          v = av - bv
          break
        }
        case 'priority': v = priorityConfig[a.priority].rank - priorityConfig[b.priority].rank; break
        case 'leverageScore': v = a.leverageScore - b.leverageScore; break
        case 'discoveredAt': v = (a.discoveredAt || '').localeCompare(b.discoveredAt || ''); break
        case 'title': v = a.title.localeCompare(b.title); break
      }
      return sortAsc ? v : -v
    })
    return list
  }, [items, search, catFilter, statusFilter, goalFilter, sourceFilter, dueBucket, thisRunOnly, hideArchived, sortKey, sortAsc, data.lastRunId])

  // Stats (over non-archived)
  const live = items.filter((o) => o.status !== 'archived')
  const openCount = live.filter((o) => o.status === 'new' || o.status === 'pursuing').length
  const dueSoonCount = live.filter((o) => !o.rolling && o.deadline && (daysUntil(o.deadline) ?? 999) <= 14 && (daysUntil(o.deadline) ?? -1) >= 0).length
  const highCount = live.filter((o) => o.priority === 'high').length
  const newThisWeek = live.filter((o) => o.discoveredAt && (Date.now() - new Date(o.discoveredAt).getTime()) < 7 * 86_400_000).length
  const thisRunCount = data.lastRunId ? items.filter((o) => o.runId === data.lastRunId).length : 0

  // "What you should see" — highest priority, then leverage, then soonest deadline.
  const topPicks = useMemo(() => {
    return [...live]
      .filter((o) => o.status === 'new' || o.status === 'pursuing')
      .sort((a, b) => {
        const p = priorityConfig[a.priority].rank - priorityConfig[b.priority].rank
        if (p !== 0) return p
        if (a.leverageScore !== b.leverageScore) return b.leverageScore - a.leverageScore
        const ad = a.rolling || !a.deadline ? Infinity : new Date(a.deadline).getTime()
        const bd = b.rolling || !b.deadline ? Infinity : new Date(b.deadline).getTime()
        return ad - bd
      })
      .slice(0, 5)
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageShell>
      {/* Radar report — what landed + what to look at first */}
      {(data.report || data.lastRun || topPicks.length > 0) && (
        <WidgetCard
          title="This week's radar"
          description={data.lastRun ? `Ran ${new Date(data.lastRun).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${thisRunCount ? ` · ${thisRunCount} new` : ''}` : 'Not run yet — add opportunities manually or trigger the radar routine.'}
          variant="success"
        >
          <div className="flex flex-col gap-4">
            {data.report && (
              <div className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">{data.report}</div>
            )}
            {topPicks.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">What you should see first</p>
                <div className="flex flex-col gap-1.5">
                  {topPicks.map((o) => {
                    const dl = deadlineLabel(o)
                    return (
                      <button key={o.id} onClick={() => { setExpanded(o.id); setThisRunOnly(false) }}
                        className="cursor-pointer flex items-center gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-secondary/40 transition-colors">
                        <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full ${priorityConfig[o.priority].color}`}>{priorityConfig[o.priority].label}</span>
                        <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full ${categoryConfig[o.category].color}`}>{categoryConfig[o.category].label}</span>
                        <span className="text-xs font-medium truncate">{o.title}</span>
                        {o.leverageNote && <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">— {o.leverageNote}</span>}
                        <span className={`ml-auto shrink-0 text-[11px] ${dl.tone}`}>{dl.text}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </WidgetCard>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="liquid-glass flex items-center gap-3 rounded-xl px-4 py-3">
          <Target className="h-5 w-5 text-blue-400" />
          <div>
            <p className="text-lg font-bold tabular-nums">{openCount}</p>
            <p className="text-[10px] text-muted-foreground">Open</p>
          </div>
        </div>
        <div className="liquid-glass flex items-center gap-3 rounded-xl px-4 py-3">
          <CalendarClock className="h-5 w-5 text-yellow-400" />
          <div>
            <p className="text-lg font-bold tabular-nums">{dueSoonCount}</p>
            <p className="text-[10px] text-muted-foreground">Due ≤14d</p>
          </div>
        </div>
        <div className="liquid-glass flex items-center gap-3 rounded-xl px-4 py-3">
          <Flame className="h-5 w-5 text-red-400" />
          <div>
            <p className="text-lg font-bold tabular-nums">{highCount}</p>
            <p className="text-[10px] text-muted-foreground">High priority</p>
          </div>
        </div>
        <div className="liquid-glass flex items-center gap-3 rounded-xl px-4 py-3">
          <Sparkles className="h-5 w-5 text-violet-400" />
          <div>
            <p className="text-lg font-bold tabular-nums">{newThisWeek}</p>
            <p className="text-[10px] text-muted-foreground">New this week</p>
          </div>
        </div>
      </div>

      {/* Search + primary controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input placeholder="Search opportunities..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
        </div>
        <select value={dueBucket} onChange={(e) => setDueBucket(e.target.value as DueBucket)}
          className="cursor-pointer h-8 rounded-lg border border-border bg-input px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
          {(Object.keys(dueBucketLabel) as DueBucket[]).map((b) => <option key={b} value={b}>{dueBucketLabel[b]}</option>)}
        </select>
        {data.lastRunId && (
          <button onClick={() => setThisRunOnly((v) => !v)}
            className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${thisRunOnly ? 'bg-violet-500/15 text-violet-400 border-current/20' : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
            This run
          </button>
        )}
        <button onClick={() => setHideArchived((v) => !v)}
          className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${hideArchived ? 'border-border text-muted-foreground/40 hover:text-muted-foreground' : 'bg-secondary text-foreground border-current/20'}`}>
          {hideArchived ? 'Hiding archived' : 'Showing archived'}
        </button>
        {/* Goal filter */}
        <select value={goalFilter ?? ''} onChange={(e) => setGoalFilter((e.target.value || null) as Goal | null)}
          className="cursor-pointer h-8 rounded-lg border border-border bg-input px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="">All goals</option>
          {ALL_GOALS.map((g) => <option key={g} value={g}>{goalConfig[g]}</option>)}
        </select>
        {/* Source filter */}
        <select value={sourceFilter ?? ''} onChange={(e) => setSourceFilter((e.target.value || null) as Opportunity['source'] | null)}
          className="cursor-pointer h-8 rounded-lg border border-border bg-input px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="">All sources</option>
          {(Object.keys(sourceConfig) as Opportunity['source'][]).map((s) => <option key={s} value={s}>{sourceConfig[s].label}</option>)}
        </select>
        <button onClick={addOpp} className="cursor-pointer ml-auto flex items-center gap-1 text-xs text-foreground bg-foreground/10 px-3 py-1.5 rounded-lg hover:bg-foreground/20 transition-colors">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {/* Category chips */}
      <div className="flex gap-1.5 flex-wrap">
        {ALL_CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCatFilter(catFilter === c ? null : c)}
            className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${catFilter === c ? `${categoryConfig[c].color} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
            {categoryConfig[c].label}
          </button>
        ))}
      </div>

      {/* Status chips */}
      <div className="flex gap-1.5 flex-wrap">
        {ALL_STATUSES.map((s) => (
          <button key={s} onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${statusFilter === s ? `${statusConfig[s].color} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
            {statusConfig[s].label}
          </button>
        ))}
      </div>

      {/* Mobile: cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {items.length === 0 ? 'No opportunities yet. The radar fills this weekly — or click Add.' : 'No opportunities match your filters.'}
          </p>
        ) : filtered.map((o) => {
          const dl = deadlineLabel(o)
          return (
            <div key={o.id} className="liquid-glass rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-2" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{o.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{o.host || eligibilityConfig[o.eligibility]}</p>
                </div>
                <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full ${priorityConfig[o.priority].color}`}>{priorityConfig[o.priority].label}</span>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${categoryConfig[o.category].color}`}>{categoryConfig[o.category].label}</span>
                <Leverage score={o.leverageScore} />
                <span className={dl.tone}>{dl.text}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${sourceConfig[o.source].color}`}>{sourceConfig[o.source].label}</span>
              </div>
              {expanded === o.id && <EditForm o={o} setField={setField} toggleGoal={toggleGoal} onDelete={() => deleteOpp(o.id)} />}
            </div>
          )
        })}
      </div>

      {/* Desktop: table */}
      <WidgetCard title="Opportunities" description={`${filtered.length} shown${data.lastRun ? ` · radar last ran ${new Date(data.lastRun).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}`} delay={0.1} className="hidden md:block">
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-5 py-2 text-left font-medium min-w-[220px]">
                  <button onClick={() => toggleSort('title')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Opportunity <SortIcon k="title" /></button>
                </th>
                <th className="py-2 text-left font-medium">Category</th>
                <th className="py-2 text-left font-medium">Goals</th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('priority')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Priority <SortIcon k="priority" /></button>
                </th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('leverageScore')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Leverage <SortIcon k="leverageScore" /></button>
                </th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('deadline')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Deadline <SortIcon k="deadline" /></button>
                </th>
                <th className="py-2 text-left font-medium">Source</th>
                <th className="py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const dl = deadlineLabel(o)
                return (
                  <>
                    <tr key={o.id} onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                      className={`cursor-pointer border-b border-border/20 transition-colors hover:bg-secondary/30 group ${expanded === o.id ? 'bg-secondary/20' : ''}`}>
                      <td className="px-5 py-2.5">
                        <span className="font-medium">{o.title}</span>
                        {o.host && <span className="text-muted-foreground"> · {o.host}</span>}
                      </td>
                      <td className="py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full ${categoryConfig[o.category].color}`}>{categoryConfig[o.category].label}</span></td>
                      <td className="py-2.5 text-muted-foreground">{o.goals.length ? o.goals.map((g) => goalConfig[g]).join(', ') : '—'}</td>
                      <td className="py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full ${priorityConfig[o.priority].color}`}>{priorityConfig[o.priority].label}</span></td>
                      <td className="py-2.5"><Leverage score={o.leverageScore} /></td>
                      <td className={`py-2.5 ${dl.tone}`}>{dl.text}</td>
                      <td className="py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full ${sourceConfig[o.source].color}`}>{sourceConfig[o.source].label}</span></td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                          {o.url && (
                            <a href={o.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground/40 hover:text-foreground" title="Open link">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); deleteOpp(o.id) }} className="cursor-pointer text-muted-foreground/40 hover:text-red-400" title="Delete">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === o.id && (
                      <tr key={`${o.id}-edit`}>
                        <td colSpan={8} className="px-5 py-4 border-b border-border/20 bg-foreground/[0.02]">
                          <EditForm o={o} setField={setField} toggleGoal={toggleGoal} onDelete={() => deleteOpp(o.id)} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {items.length === 0 ? 'No opportunities yet. The radar fills this weekly — or click Add.' : 'No opportunities match your filters.'}
            </p>
          )}
        </div>
      </WidgetCard>
    </PageShell>
  )
}

// ── Edit form (shared desktop + mobile) ───────────────────────────────────────

function EditForm({ o, setField, toggleGoal, onDelete }: {
  o: Opportunity
  setField: (id: string, f: Partial<Opportunity>) => void
  toggleGoal: (id: string, g: Goal) => void
  onDelete: () => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 mt-3 lg:mt-0">
      {/* Col 1 — identity */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] text-muted-foreground">Title</label>
        <input value={o.title} onChange={(e) => setField(o.id, { title: e.target.value })} className="bg-transparent outline-none text-sm font-semibold border-b border-border/30 pb-1" />
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[10px] text-muted-foreground">Host</label><input value={o.host} onChange={(e) => setField(o.id, { host: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
          <div><label className="text-[10px] text-muted-foreground">Location</label><input value={o.location} onChange={(e) => setField(o.id, { location: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[10px] text-muted-foreground">Category</label>
            <select value={o.category} onChange={(e) => setField(o.id, { category: e.target.value as OpportunityCategory })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">
              {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{categoryConfig[c].label}</option>)}
            </select>
          </div>
          <div><label className="text-[10px] text-muted-foreground">Eligibility</label>
            <select value={o.eligibility} onChange={(e) => setField(o.id, { eligibility: e.target.value as Eligibility })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">
              {(Object.keys(eligibilityConfig) as Eligibility[]).map((el) => <option key={el} value={el}>{eligibilityConfig[el]}</option>)}
            </select>
          </div>
        </div>
        <div><label className="text-[10px] text-muted-foreground">Link</label>
          <input value={o.url} onChange={(e) => setField(o.id, { url: e.target.value })} placeholder="https://..." className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 placeholder:text-muted-foreground/30" />
        </div>
      </div>

      {/* Col 2 — status / priority / dates */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[10px] text-muted-foreground">Status</label>
            <select value={o.status} onChange={(e) => setField(o.id, { status: e.target.value as OppStatus })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}
            </select>
          </div>
          <div><label className="text-[10px] text-muted-foreground">Priority</label>
            <select value={o.priority} onChange={(e) => setField(o.id, { priority: e.target.value as Opportunity['priority'] })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">
              {(['high', 'medium', 'low'] as const).map((p) => <option key={p} value={p}>{priorityConfig[p].label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 items-end">
          <div><label className="text-[10px] text-muted-foreground">Deadline</label>
            <input type="date" value={o.deadline ?? ''} onChange={(e) => setField(o.id, { deadline: e.target.value || null })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 cursor-pointer" />
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground pb-1 cursor-pointer">
            <input type="checkbox" checked={o.rolling} onChange={(e) => setField(o.id, { rolling: e.target.checked })} className="cursor-pointer" /> Rolling
          </label>
        </div>
        <div><label className="text-[10px] text-muted-foreground">Reward / prize</label>
          <input value={o.reward} onChange={(e) => setField(o.id, { reward: e.target.value })} placeholder="$5k, stipend, credits…" className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 placeholder:text-muted-foreground/30" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Leverage: {o.leverageScore}/5</label>
          <input type="range" min={1} max={5} step={1} value={o.leverageScore} onChange={(e) => setField(o.id, { leverageScore: parseInt(e.target.value) })} className="w-full cursor-pointer accent-amber-400" />
        </div>
        <div><label className="text-[10px] text-muted-foreground">Leverage note (what it unlocks)</label>
          <input value={o.leverageNote} onChange={(e) => setField(o.id, { leverageNote: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 placeholder:text-muted-foreground/30" placeholder="e.g. funding + press + investor intros" />
        </div>
      </div>

      {/* Col 3 — goals / notes / tags */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] text-muted-foreground">Goals it serves</label>
        <div className="flex gap-1.5 flex-wrap">
          {ALL_GOALS.map((g) => (
            <button key={g} onClick={() => toggleGoal(o.id, g)}
              className={`cursor-pointer text-[10px] px-2 py-0.5 rounded-full border transition-all ${o.goals.includes(g) ? 'bg-foreground/10 text-foreground border-current/20' : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
              {goalConfig[g]}
            </button>
          ))}
        </div>
        <label className="text-[10px] text-muted-foreground">Notes</label>
        <textarea value={o.notes} onChange={(e) => setField(o.id, { notes: e.target.value })} className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none" rows={4} placeholder="Why it matters, what to prepare, source excerpt…" />
        <label className="text-[10px] text-muted-foreground">Tags (comma-separated)</label>
        <input value={o.tags.join(', ')} onChange={(e) => setField(o.id, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" placeholder="remote, ai, latam…" />
        {o.sourceRef && (
          <a href={o.sourceRef} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground/60 hover:text-foreground inline-flex items-center gap-1 mt-1">
            <ExternalLink className="h-3 w-3" /> Source post
          </a>
        )}
        <div className="flex justify-end pt-2">
          <button onClick={onDelete} className="cursor-pointer flex items-center gap-1.5 text-xs text-red-400/60 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-red-400/20 hover:border-red-400/40 hover:bg-red-400/5">
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}
