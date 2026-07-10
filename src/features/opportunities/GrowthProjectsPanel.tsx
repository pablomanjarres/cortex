import { useState, useMemo, type ReactNode } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { ThemedTooltip, axisProps, chartColors, cssVar } from '@/lib/chart-theme'
import { useStore } from '@/lib/store'
import {
  Search, Star, GitFork, RefreshCw, ExternalLink, TrendingUp,
  ArrowUp, ArrowDown, ArrowUpDown, FlameKindling, ChevronDown,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────
// A snapshot-tracked GitHub repo. "Fastest growing" is DETERMINISTIC and runs like the
// radar: the UI "Run" button (and a weekly launchd timer) drive scripts/growth-fetch.mjs
// via the always-on radar-control-watcher — one source of truth, no AI, no Apify. The run
// queries GitHub's public search API and diffs each pull against the last snapshot to get
// true stars/forks GAINED. This panel only sets the run flag and renders stored results.

export interface GrowthRepo {
  id: string          // owner/name
  name: string
  fullName: string
  owner: string
  url: string
  description: string
  language: string | null
  category: string
  topics: string[]
  stars: number
  forks: number
  createdAt: string
  pushedAt: string
  firstSeen: string
  lastRefreshed: string
  starsDelta: number  // stars gained since the previous snapshot
  forksDelta: number
  history: { t: string; stars: number; forks: number }[]
}

interface GrowthData {
  repos: GrowthRepo[]
  lastRefresh: string | null
  // Run control (mirrors the radar run): the watcher executes growth-fetch.mjs when set.
  runRequestedAt?: string
  runStatus?: 'requested' | 'running' | 'done' | 'error'
  runStartedAt?: string
  runFinishedAt?: string
  runError?: string
}

const DEFAULT_DATA: GrowthData = { repos: [], lastRefresh: null }

// Display labels only — categories are identity, not status, so chips stay neutral.
// The run's query buckets live in growth-fetch.mjs.
const CATS: { key: string; label: string }[] = [
  { key: 'ai',       label: 'AI / ML' },
  { key: 'llm',      label: 'LLM' },
  { key: 'agents',   label: 'Agents' },
  { key: 'devtools', label: 'Dev tools' },
  { key: 'web',      label: 'Web' },
  { key: 'data',     label: 'Data' },
  { key: 'other',    label: 'Other' },
]
const CAT_META: Record<string, { label: string }> =
  Object.fromEntries(CATS.map((c) => [c.key, { label: c.label }]))

type SortKey = 'starsDelta' | 'stars' | 'forksDelta' | 'forks' | 'createdAt'

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(n)
}
function fmtDelta(n: number): string {
  if (!n) return ''
  return `${n > 0 ? '+' : ''}${fmtNum(n)}`
}
function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : ''
}

// ── Component ────────────────────────────────────────────────────────────────
export function GrowthProjectsPanel() {
  const [data, updateData] = useStore<GrowthData>('cortex-growth-projects', DEFAULT_DATA)
  const repos = useMemo(() => data.repos || [], [data.repos])

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [langFilter, setLangFilter] = useState<string | null>(null)
  const [minStars, setMinStars] = useState(0)
  const [minForks, setMinForks] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('starsDelta')
  const [sortAsc, setSortAsc] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const running = data.runStatus === 'requested' || data.runStatus === 'running'
  const runScan = () => {
    if (running) return
    updateData((p) => ({ ...p, runRequestedAt: new Date().toISOString(), runStatus: 'requested', runError: undefined }))
  }

  const languages = useMemo(() => {
    const s = new Set<string>()
    repos.forEach((r) => { if (r.language) s.add(r.language) })
    return [...s].sort()
  }, [repos])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const list = repos.filter((r) =>
      (!catFilter || r.category === catFilter) &&
      (!langFilter || r.language === langFilter) &&
      r.stars >= minStars &&
      r.forks >= minForks &&
      (!q || r.fullName.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q) ||
        (r.topics || []).some((t) => t.toLowerCase().includes(q)))
    )
    list.sort((a, b) => {
      let v = 0
      switch (sortKey) {
        case 'starsDelta': v = a.starsDelta - b.starsDelta; break
        case 'forksDelta': v = a.forksDelta - b.forksDelta; break
        case 'stars': v = a.stars - b.stars; break
        case 'forks': v = a.forks - b.forks; break
        case 'createdAt': v = (a.createdAt || '').localeCompare(b.createdAt || ''); break
      }
      return sortAsc ? v : -v
    })
    return list
  }, [repos, search, catFilter, langFilter, minStars, minForks, sortKey, sortAsc])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((p) => !p)
    else { setSortKey(k); setSortAsc(false) }
  }
  // Plain render helper (not a component) so its identity never resets state.
  const sortIcon = (k: SortKey) =>
    sortKey === k ? (sortAsc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-30" />

  // KPIs
  const totalTracked = repos.length
  const totalStars = repos.reduce((s, r) => s + r.stars, 0)
  const hottest = repos.reduce((m, r) => (r.starsDelta > (m?.starsDelta ?? 0) ? r : m), null as GrowthRepo | null)
  const hasDeltas = repos.some((r) => r.starsDelta !== 0)

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Tracked" value={totalTracked} icon={<FlameKindling />} />
        <StatTile label="Total stars" value={fmtNum(totalStars)} icon={<Star />} />
        <StatTile
          label="Top gain"
          value={hottest && hottest.starsDelta > 0 ? `+${fmtNum(hottest.starsDelta)}` : '—'}
          sub={hottest && hottest.starsDelta > 0 ? hottest.name : undefined}
          icon={<TrendingUp />}
        />
        <StatTile label="Total forks" value={fmtNum(repos.reduce((s, r) => s + r.forks, 0))} icon={<GitFork />} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground-faint" />
          <Input placeholder="Search repos, topics…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 text-xs" />
        </div>
        <select
          value={langFilter ?? ''}
          onChange={(e) => setLangFilter(e.target.value || null)}
          aria-label="Language filter"
          className="h-8 cursor-pointer rounded-md border border-input bg-input/20 px-2 text-xs text-foreground outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <option value="">All languages</option>
          {languages.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Star className="size-3" />≥
          <Input
            type="number"
            min={0}
            value={minStars || ''}
            onChange={(e) => setMinStars(Number(e.target.value) || 0)}
            placeholder="0"
            className="w-16 font-mono text-xs tabular-nums"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GitFork className="size-3" />≥
          <Input
            type="number"
            min={0}
            value={minForks || ''}
            onChange={(e) => setMinForks(Number(e.target.value) || 0)}
            placeholder="0"
            className="w-16 font-mono text-xs tabular-nums"
          />
        </label>
        <div className="ml-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={runScan}
            disabled={running}
            title={running ? 'Growth scan is running…' : 'Scan GitHub now for the top ~100 growing projects and diff against the last run'}
          >
            <RefreshCw /> {running ? (data.runStatus === 'requested' ? 'Queued…' : 'Running…') : 'Run'}
          </Button>
        </div>
      </div>
      {data.runStatus === 'error' && data.runError && (
        <p className="-mt-2 text-xs text-destructive">Last run failed: {data.runError}</p>
      )}

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        {CATS.map((c) => (
          <Chip key={c.key} selectable selected={catFilter === c.key} onClick={() => setCatFilter(catFilter === c.key ? null : c.key)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {/* Table */}
      <WidgetCard
        title="Fastest growing projects"
        description={data.lastRefresh
          ? `${filtered.length} shown · last run ${new Date(data.lastRefresh).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${hasDeltas ? '' : ' · run again to measure weekly growth'}`
          : 'Deterministic GitHub scan (runs on the radar worker + weekly on Mondays) — hit Run to post the top ~100 growing projects by stars & forks.'}
      >
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="min-w-[240px] px-4 py-2 text-left font-medium">Repository</th>
                <th className="py-2 text-left font-medium">Category</th>
                <th className="py-2 text-left font-medium">Language</th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('starsDelta')} className="flex cursor-pointer items-center gap-1 hover:text-foreground">Δ Stars {sortIcon('starsDelta')}</button>
                </th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('stars')} className="flex cursor-pointer items-center gap-1 hover:text-foreground">Stars {sortIcon('stars')}</button>
                </th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('forksDelta')} className="flex cursor-pointer items-center gap-1 hover:text-foreground">Δ Forks {sortIcon('forksDelta')}</button>
                </th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('forks')} className="flex cursor-pointer items-center gap-1 hover:text-foreground">Forks {sortIcon('forks')}</button>
                </th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('createdAt')} className="flex cursor-pointer items-center gap-1 hover:text-foreground">Born {sortIcon('createdAt')}</button>
                </th>
                <th className="w-8 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cat = CAT_META[r.category] || CAT_META.other
                const open = expanded === r.id
                return (
                  <>
                    <tr
                      key={r.id}
                      onClick={() => setExpanded(open ? null : r.id)}
                      className={`group cursor-pointer border-b border-border/40 transition-colors hover:bg-secondary/30 ${open ? 'bg-secondary/20' : ''}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <ChevronDown className={`size-3 shrink-0 text-foreground-faint transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
                          <div className="flex min-w-0 flex-col">
                            <span className="font-medium text-foreground">{r.fullName}</span>
                            {r.description && <span className="max-w-[34rem] truncate text-muted-foreground">{r.description}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5"><Chip size="sm">{cat.label}</Chip></td>
                      <td className="py-2.5 text-muted-foreground">{r.language || '—'}</td>
                      <td className="py-2.5 font-mono tabular-nums">
                        {r.starsDelta
                          ? <span className={r.starsDelta > 0 ? 'text-success' : 'text-destructive'}>{fmtDelta(r.starsDelta)}</span>
                          : <span className="text-foreground-faint">—</span>}
                      </td>
                      <td className="py-2.5 font-mono tabular-nums">
                        <span className="inline-flex items-center gap-1"><Star className="size-3 text-foreground-faint" />{fmtNum(r.stars)}</span>
                      </td>
                      <td className="py-2.5 font-mono tabular-nums">
                        {r.forksDelta
                          ? <span className={r.forksDelta > 0 ? 'text-success' : 'text-destructive'}>{fmtDelta(r.forksDelta)}</span>
                          : <span className="text-foreground-faint">—</span>}
                      </td>
                      <td className="py-2.5 font-mono tabular-nums">
                        <span className="inline-flex items-center gap-1"><GitFork className="size-3 text-foreground-faint" />{fmtNum(r.forks)}</span>
                      </td>
                      <td className="py-2.5 font-mono tabular-nums text-muted-foreground">{fmtDate(r.createdAt)}</td>
                      <td className="py-2.5 pr-4">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
                          title="Open on GitHub"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${r.id}-chart`}>
                        <td colSpan={9} className="border-b border-border/40 bg-secondary/10 px-4 py-4">
                          <RepoGrowthDetail repo={r} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <EmptyState
              message={repos.length === 0
                ? (running ? 'Scanning GitHub for the fastest-growing repos…' : 'No projects tracked yet.')
                : 'Nothing matches these filters.'}
              hint={repos.length === 0 && !running ? 'Hit Run to scan GitHub for the fastest-growing repos.' : undefined}
            />
          )}
        </div>
      </WidgetCard>
    </div>
  )
}

// ── Per-repo growth detail (click-to-expand chart + meta) ─────────────────────
function RepoGrowthDetail({ repo }: { repo: GrowthRepo }) {
  const [c1, c2] = chartColors() // stars = accent, forks = green (series order per chart-theme)
  const history = (repo.history || []).slice().sort((a, b) => (a.t || '').localeCompare(b.t || ''))
  const chartData = history.map((h) => ({
    label: new Date(h.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    stars: h.stars,
    forks: h.forks,
  }))
  const first = history[0]
  const starsSinceSeen = first ? repo.stars - first.stars : 0
  const forksSinceSeen = first ? repo.forks - first.forks : 0

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
      {/* Meta */}
      <div className="flex flex-col gap-2 text-xs">
        <a href={repo.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-foreground transition-colors hover:text-accent">
          {repo.fullName} <ExternalLink className="size-3" />
        </a>
        {repo.description && <p className="leading-relaxed text-muted-foreground">{repo.description}</p>}
        <div className="mt-1 grid grid-cols-2 gap-2">
          <Meta label="Stars" value={<span className="inline-flex items-center gap-1"><Star className="size-3 text-foreground-faint" />{repo.stars.toLocaleString()}</span>} />
          <Meta label="Forks" value={<span className="inline-flex items-center gap-1"><GitFork className="size-3 text-foreground-faint" />{repo.forks.toLocaleString()}</span>} />
          <Meta label="Since tracked" value={<span className={starsSinceSeen > 0 ? 'text-success' : 'text-muted-foreground'}>{fmtDelta(starsSinceSeen) || '0'} ★ · {fmtDelta(forksSinceSeen) || '0'} ⑂</span>} />
          <Meta label="Language" value={repo.language || '—'} />
          <Meta label="Born" value={fmtDate(repo.createdAt)} />
          <Meta label="First tracked" value={fmtDate(repo.firstSeen)} />
        </div>
        {repo.topics?.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {repo.topics.slice(0, 8).map((t) => <Chip key={t} size="sm">{t}</Chip>)}
          </div>
        )}
      </div>

      {/* Growth chart */}
      <div className="rounded-md border border-border/60 bg-secondary/10 p-3">
        <div className="mb-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
          Stars &amp; forks over time · {history.length} snapshot{history.length === 1 ? '' : 's'}
        </div>
        {chartData.length < 2 ? (
          <div className="flex h-40 items-center justify-center px-4 text-center text-xs text-foreground-faint">
            Only one snapshot so far — the growth curve fills in after the next run (and each weekly Monday run).
          </div>
        ) : (
          <>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" {...axisProps()} minTickGap={30} />
                  <YAxis yAxisId="stars" width={44} domain={['auto', 'auto']} tickFormatter={(v) => fmtNum(Number(v))} {...axisProps()} />
                  <YAxis yAxisId="forks" orientation="right" width={40} domain={['auto', 'auto']} tickFormatter={(v) => fmtNum(Number(v))} {...axisProps()} />
                  <Tooltip
                    content={<ThemedTooltip formatter={(v, name) => `${Number(v).toLocaleString()}${name === 'stars' ? ' ★' : ' ⑂'}`} />}
                    cursor={{ stroke: cssVar('--border') }}
                  />
                  <Area yAxisId="stars" type="monotone" dataKey="stars" stroke={c1} strokeWidth={1.5} fill={c1} fillOpacity={0.12} />
                  <Line yAxisId="forks" type="monotone" dataKey="forks" stroke={c2} strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-4 font-mono text-2xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c1 }} /> Stars (left)</span>
              <span className="inline-flex items-center gap-1"><span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c2 }} /> Forks (right)</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-3xs uppercase tracking-wider text-foreground-faint">{label}</div>
      <div className="font-mono tabular-nums text-foreground">{value}</div>
    </div>
  )
}
