import { FilterChips } from '@/components/shared/FilterChips'
import { SearchInput } from '@/components/shared/SearchInput'
import { useState, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStore } from '@/lib/store'
import { useToday } from '@/lib/use-today'
import { isOpportunityActive } from './expiry'
import { CountdownChip } from './CountdownChip'
import { HuntOrders } from './HuntOrders'
import { OpportunityRow } from './OpportunityRow'
import {
  ALL_STATUSES, DEFAULT_DATA, MODALITY_FILTERS, categoryConfig, categoryOf, modalityConfig, modalityOf,
  priorityOf, statusConfig,
  type Goal, type Modality, type Objective, type ObjectiveParsed,
  type OppData, type OppStatus, type Opportunity, type OpportunityCategory,
} from './opportunity-model'
import {
  KIND_GROUPS, REGION_ORDER, isNewThisWeek, isOpen, isOpenWindow, kindGroupFor, regionConfig, regionForText,
  regionOf, sectionOf, topPicks as rankTopPicks, urgencySections, type KindGroup, type Region,
} from './opportunity-radar'
import {
  Plus,
  Target,
  CalendarClock,
  InfinityIcon,
  Sparkles,
  RefreshCw,
} from 'lucide-react'

export function OpportunitiesPage() {
  const [data, updateData] = useStore<OppData>('cortex-opportunities', DEFAULT_DATA)
  const today = useToday()
  const items = useMemo(() => data.items || [], [data.items])
  const live = useMemo(() => items.filter((o) => isOpportunityActive(o, today)), [items, today])

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
  const addObjective = (text: string) => {
    const o: Objective = {
      id: `obj-${Date.now()}`, text, status: 'thinking', active: true,
      createdAt: new Date().toISOString(),
    }
    updateData((p) => ({ ...p, objectives: [...(p.objectives || []), o] }))
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
    return (showArchived ? items : live).filter((o) =>
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
  }, [items, live, search, kindGroup, catFilter, modalityFilter, statusFilter, regionFilter, thisRunOnly, showArchived, data.lastRunId])

  const sections = useMemo(() => urgencySections(filtered, today), [filtered, today])

  // Keep a selected region clearable even if its last opportunity expires.
  const availableRegions = useMemo(() => {
    const present = new Set((showArchived ? items : live).map(regionOf))
    return REGION_ORDER.filter((r) => present.has(r) || r === regionFilter)
  }, [items, live, showArchived, regionFilter])
  const showRegionFilters = availableRegions.length > 1 || regionFilter !== null

  // ── KPIs (over active opportunities) ────────────────────────────────────────
  const openCount = live.filter(isOpen).length
  const closingWeek = live.filter((o) => sectionOf(o, today) === 'week').length
  const rollingCount = live.filter(isOpenWindow).length
  const newThisWeek = live.filter((o) => isNewThisWeek(o)).length
  const thisRunCount = data.lastRunId ? live.filter((o) => o.runId === data.lastRunId).length : 0

  const topPicks = useMemo(() => rankTopPicks(live, today), [live, today])

  return (
    <PageShell>
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
                        {topPicks.map((o, i) => (
                            <Button
                              key={o.id}
                              variant="ghost"
                              aria-label={`Open top pick ${o.title}`}
                              onClick={() => { setExpanded(o.id); setThisRunOnly(false); setShowArchived(false) }}
                              className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-left font-normal active:scale-100"
                            >
                              <span className="w-4 shrink-0 font-mono text-2xs tabular-nums text-foreground-faint">{i + 1}</span>
                              <Chip size="sm" variant={priorityOf(o.priority).chip}>{priorityOf(o.priority).label}</Chip>
                              <Chip size="sm">{categoryOf(o.category).label}</Chip>
                              <span className="truncate text-xs font-medium text-foreground">{o.title}</span>
                              {o.leverageNote && <span className="hidden truncate text-xs text-foreground-faint sm:inline">— {o.leverageNote}</span>}
                              <span className="ml-auto shrink-0">
                                <CountdownChip opportunity={o} today={today} />
                              </span>
                            </Button>
                        ))}
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
              <HuntOrders
                objectives={objectives}
                live={live}
                onAdd={addObjective}
                onPatch={setObjective}
                onDelete={deleteObjective}
                onView={showObjectiveMatches}
              />
            </WidgetCard>

            {/* Filter rail */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <SearchInput label="Search opportunities" containerClassName="max-w-xs flex-1" placeholder="Search opportunities…" value={search} onChange={(e) => setSearch(e.target.value)} className="text-xs" />
                {data.lastRunId && (
                  <Chip selectable selected={thisRunOnly} onClick={() => setThisRunOnly((v) => !v)}>This run</Chip>
                )}
                <Chip selectable selected={showArchived} onClick={() => setShowArchived((v) => !v)}>Show archived / expired</Chip>
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
                <Tabs value={kindGroup} className="min-w-0 max-w-full" onValueChange={(v) => { setKindGroup(v as KindGroup); setCatFilter(null) }}>
                  <TabsList aria-label="Opportunity kinds" className="max-w-full justify-start overflow-x-auto overscroll-x-contain">
                    <TabsTrigger className="min-h-11 shrink-0 sm:min-h-8" value="all">All</TabsTrigger>
                    {(Object.keys(KIND_GROUPS) as Exclude<KindGroup, 'all'>[]).map((g) => (
                      <TabsTrigger className="min-h-11 shrink-0 sm:min-h-8" key={g} value={g}>{KIND_GROUPS[g].label}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                {kindGroup !== 'all' && (
                  <FilterChips label="Filter by category" size="md" value={catFilter} onChange={setCatFilter}
                    options={KIND_GROUPS[kindGroup].categories.map((c) => ({ value: c, label: categoryOf(c).label }))} />
                )}
              </div>

              {/* Status · modality · region chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterChips label="Filter by status" size="md" value={statusFilter} onChange={setStatusFilter}
                  options={ALL_STATUSES.map((s) => ({ value: s, label: statusConfig[s].label, variant: statusConfig[s].chip }))} />
                <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />
                <FilterChips label="Filter by modality" size="md" value={modalityFilter} onChange={setModalityFilter}
                  options={MODALITY_FILTERS.map((m) => ({ value: m, label: modalityConfig[m].label }))} />
                {showRegionFilters && <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />}
                {showRegionFilters && (
                  <FilterChips label="Filter by region" size="md" value={regionFilter} onChange={setRegionFilter}
                    options={availableRegions.map((r) => ({ value: r, label: regionConfig[r].label }))} />
                )}
              </div>
            </div>

            {/* Urgency-grouped list — the core deadline-intelligence view */}
            {filtered.length === 0 ? (
              <EmptyState
                message={items.length === 0 ? 'The radar hasn’t surfaced anything yet.' : !showArchived && live.length === 0 ? 'No active opportunities.' : 'Nothing matches these filters.'}
                hint={items.length === 0 ? 'It fills weekly — or add one yourself.' : !showArchived && live.length === 0 ? 'Use “Show archived / expired” to view past opportunities.' : 'Loosen a chip or two.'}
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
                          <OpportunityRow
                            key={o.id}
                            o={o}
                            today={today}
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
    </PageShell>
  )
}
