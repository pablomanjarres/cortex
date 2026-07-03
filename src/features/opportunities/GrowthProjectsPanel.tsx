import { useState, useMemo } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import {
  Search, Star, GitFork, RefreshCw, Loader2, ExternalLink, TrendingUp,
  ArrowUp, ArrowDown, ArrowUpDown, FlameKindling,
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

// Display metadata (labels + colors). The run's query buckets live in growth-fetch.mjs.
const CATS: { key: string; label: string; color: string }[] = [
  { key: 'ai',       label: 'AI / ML',   color: 'bg-violet-500/15 text-violet-400' },
  { key: 'llm',      label: 'LLM',       color: 'bg-fuchsia-500/15 text-fuchsia-400' },
  { key: 'agents',   label: 'Agents',    color: 'bg-blue-500/15 text-blue-400' },
  { key: 'devtools', label: 'Dev tools', color: 'bg-orange-500/15 text-orange-400' },
  { key: 'web',      label: 'Web',       color: 'bg-teal-500/15 text-teal-400' },
  { key: 'data',     label: 'Data',      color: 'bg-emerald-500/15 text-emerald-400' },
  { key: 'other',    label: 'Other',     color: 'bg-secondary text-muted-foreground' },
]
const CAT_META: Record<string, { label: string; color: string }> =
  Object.fromEntries(CATS.map((c) => [c.key, { label: c.label, color: c.color }]))

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
  const repos = data.repos || []

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [langFilter, setLangFilter] = useState<string | null>(null)
  const [minStars, setMinStars] = useState(0)
  const [minForks, setMinForks] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('starsDelta')
  const [sortAsc, setSortAsc] = useState(false)

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
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />

  // KPIs
  const totalTracked = repos.length
  const totalStars = repos.reduce((s, r) => s + r.stars, 0)
  const hottest = repos.reduce((m, r) => (r.starsDelta > (m?.starsDelta ?? 0) ? r : m), null as GrowthRepo | null)
  const hasDeltas = repos.some((r) => r.starsDelta !== 0)

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="liquid-glass flex items-center gap-3 rounded-xl px-4 py-3">
          <FlameKindling className="h-5 w-5 text-orange-400" />
          <div><p className="text-lg font-bold tabular-nums">{totalTracked}</p><p className="text-[10px] text-muted-foreground">Tracked</p></div>
        </div>
        <div className="liquid-glass flex items-center gap-3 rounded-xl px-4 py-3">
          <Star className="h-5 w-5 text-amber-400" />
          <div><p className="text-lg font-bold tabular-nums">{fmtNum(totalStars)}</p><p className="text-[10px] text-muted-foreground">Total stars</p></div>
        </div>
        <div className="liquid-glass flex items-center gap-3 rounded-xl px-4 py-3">
          <TrendingUp className="h-5 w-5 text-green-400" />
          <div><p className="text-lg font-bold tabular-nums">{hottest && hottest.starsDelta > 0 ? `+${fmtNum(hottest.starsDelta)}` : '—'}</p><p className="text-[10px] text-muted-foreground truncate max-w-[9rem]">{hottest && hottest.starsDelta > 0 ? hottest.name : 'Top gain'}</p></div>
        </div>
        <div className="liquid-glass flex items-center gap-3 rounded-xl px-4 py-3">
          <GitFork className="h-5 w-5 text-sky-400" />
          <div><p className="text-lg font-bold tabular-nums">{fmtNum(repos.reduce((s, r) => s + r.forks, 0))}</p><p className="text-[10px] text-muted-foreground">Total forks</p></div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input placeholder="Search repos, topics…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
        </div>
        <select value={langFilter ?? ''} onChange={(e) => setLangFilter(e.target.value || null)}
          className="cursor-pointer h-8 rounded-lg border border-border bg-input px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="">All languages</option>
          {languages.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Star className="h-3 w-3" />≥
          <input type="number" min={0} value={minStars || ''} onChange={(e) => setMinStars(Number(e.target.value) || 0)} placeholder="0"
            className="w-16 h-8 rounded-lg border border-border bg-input px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <GitFork className="h-3 w-3" />≥
          <input type="number" min={0} value={minForks || ''} onChange={(e) => setMinForks(Number(e.target.value) || 0)} placeholder="0"
            className="w-16 h-8 rounded-lg border border-border bg-input px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </label>
        <div className="ml-auto">
          <button onClick={runScan} disabled={running}
            title={running ? 'Growth scan is running…' : 'Scan GitHub now for the top ~100 growing projects and diff against the last run'}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${running ? 'text-muted-foreground bg-secondary cursor-default' : 'cursor-pointer text-foreground bg-orange-500/15 hover:bg-orange-500/25'}`}>
            {running
              ? <><Loader2 className="h-3 w-3 animate-spin" /> {data.runStatus === 'requested' ? 'Queued…' : 'Running…'}</>
              : <><RefreshCw className="h-3 w-3" /> Run</>}
          </button>
        </div>
      </div>
      {data.runStatus === 'error' && data.runError && (
        <p className="text-[11px] text-red-400/80 -mt-2">Last run failed: {data.runError}</p>
      )}

      {/* Category chips */}
      <div className="flex gap-1.5 flex-wrap">
        {CATS.map((c) => (
          <button key={c.key} onClick={() => setCatFilter(catFilter === c.key ? null : c.key)}
            className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${catFilter === c.key ? `${c.color} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <WidgetCard
        title="Fastest growing projects"
        description={data.lastRefresh
          ? `${filtered.length} shown · last run ${new Date(data.lastRefresh).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${hasDeltas ? '' : ' · run again to measure weekly growth'}`
          : 'Deterministic GitHub scan (runs on the radar worker + weekly on Mondays) — hit Run to post the top ~100 growing projects by stars & forks.'}
      >
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-5 py-2 text-left font-medium min-w-[240px]">Repository</th>
                <th className="py-2 text-left font-medium">Category</th>
                <th className="py-2 text-left font-medium">Language</th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('starsDelta')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Δ Stars <SortIcon k="starsDelta" /></button>
                </th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('stars')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Stars <SortIcon k="stars" /></button>
                </th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('forksDelta')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Δ Forks <SortIcon k="forksDelta" /></button>
                </th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('forks')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Forks <SortIcon k="forks" /></button>
                </th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('createdAt')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Born <SortIcon k="createdAt" /></button>
                </th>
                <th className="py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cat = CAT_META[r.category] || CAT_META.other
                return (
                  <tr key={r.id} className="border-b border-border/20 transition-colors hover:bg-secondary/30 group">
                    <td className="px-5 py-2.5">
                      <div className="flex flex-col">
                        <span className="font-medium">{r.fullName}</span>
                        {r.description && <span className="text-muted-foreground truncate max-w-[36rem]">{r.description}</span>}
                      </div>
                    </td>
                    <td className="py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span></td>
                    <td className="py-2.5 text-muted-foreground">{r.language || '—'}</td>
                    <td className="py-2.5 tabular-nums">{r.starsDelta ? <span className={r.starsDelta > 0 ? 'text-green-400' : 'text-red-400/70'}>{fmtDelta(r.starsDelta)}</span> : <span className="text-muted-foreground/40">—</span>}</td>
                    <td className="py-2.5 tabular-nums"><span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-amber-400/70" />{fmtNum(r.stars)}</span></td>
                    <td className="py-2.5 tabular-nums">{r.forksDelta ? <span className={r.forksDelta > 0 ? 'text-green-400' : 'text-red-400/70'}>{fmtDelta(r.forksDelta)}</span> : <span className="text-muted-foreground/40">—</span>}</td>
                    <td className="py-2.5 tabular-nums"><span className="inline-flex items-center gap-1"><GitFork className="h-3 w-3 text-sky-400/70" />{fmtNum(r.forks)}</span></td>
                    <td className="py-2.5 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                    <td className="py-2.5 pr-4">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/40 hover:text-foreground opacity-0 group-hover:opacity-100 transition-all" title="Open on GitHub">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {repos.length === 0
                ? (running ? 'Scanning GitHub for the fastest-growing repos…' : 'No projects yet — hit Run to scan GitHub for the fastest-growing repos.')
                : 'No projects match your filters.'}
            </p>
          )}
        </div>
      </WidgetCard>
    </div>
  )
}
