import { useState, useMemo } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import {
  Search, Star, GitFork, RefreshCw, Loader2, ExternalLink, TrendingUp,
  ArrowUp, ArrowDown, ArrowUpDown, FlameKindling,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────
// A snapshot-tracked GitHub repo. "Fastest growing" is DETERMINISTIC: the GitHub search
// API surfaces high-star recently-created repos, and we diff each refresh against the last
// stored snapshot to get true stars/forks GAINED — no AI, no Apify token (GitHub's REST
// search API is public + CORS-enabled, exactly how the radar's github lane already works).

export interface GrowthRepo {
  id: string          // owner/name
  name: string
  fullName: string
  owner: string
  url: string
  description: string
  language: string | null
  category: string    // which query bucket surfaced it
  topics: string[]
  stars: number
  forks: number
  createdAt: string   // repo creation
  pushedAt: string
  firstSeen: string   // when we first tracked it
  lastRefreshed: string
  starsDelta: number  // stars gained since the previous snapshot
  forksDelta: number
  history: { t: string; stars: number; forks: number }[]
}

interface GrowthData {
  repos: GrowthRepo[]
  lastRefresh: string | null
}

const DEFAULT_DATA: GrowthData = { repos: [], lastRefresh: null }

// ── Query config ─────────────────────────────────────────────────────────────
// Specific buckets first so a repo gets a meaningful category before the catch-all "all".
const CATEGORIES: { key: string; label: string; q: string; color: string }[] = [
  { key: 'ai',       label: 'AI / ML',   q: 'topic:ai',                color: 'bg-violet-500/15 text-violet-400' },
  { key: 'llm',      label: 'LLM',       q: 'topic:llm',               color: 'bg-fuchsia-500/15 text-fuchsia-400' },
  { key: 'agents',   label: 'Agents',    q: 'topic:agents',            color: 'bg-blue-500/15 text-blue-400' },
  { key: 'devtools', label: 'Dev tools', q: 'topic:developer-tools',   color: 'bg-orange-500/15 text-orange-400' },
  { key: 'web',      label: 'Web',       q: 'topic:frontend',          color: 'bg-teal-500/15 text-teal-400' },
  { key: 'data',     label: 'Data',      q: 'topic:data-science',      color: 'bg-emerald-500/15 text-emerald-400' },
  { key: 'all',      label: 'All',       q: '',                        color: 'bg-secondary text-muted-foreground' },
]
const CAT_META: Record<string, { label: string; color: string }> = Object.fromEntries(
  [...CATEGORIES.map((c) => [c.key, { label: c.label, color: c.color }]),
   ['other', { label: 'Other', color: 'bg-secondary text-muted-foreground' }]]
)

const WINDOWS: { key: string; label: string; days: number }[] = [
  { key: '30d', label: 'Born last 30d', days: 30 },
  { key: '90d', label: 'Born last 90d', days: 90 },
  { key: '1y',  label: 'Born last year', days: 365 },
]

const STARS_FLOOR = 10        // query floor so buckets return signal, not noise
const PER_PAGE = 50
const MAX_TRACKED = 400       // cap stored repos (prune by staleness)
const MAX_HISTORY = 12

type SortKey = 'starsDelta' | 'stars' | 'forksDelta' | 'forks' | 'createdAt'

// ── Helpers ──────────────────────────────────────────────────────────────────
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}
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

async function ghSearch(q: string, perPage = PER_PAGE): Promise<any[]> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perPage}`
  const res = await fetch(url, { headers: { accept: 'application/vnd.github+json' } })
  if (res.status === 403 || res.status === 429) throw new Error('GitHub rate limit hit — wait a minute and refresh again.')
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const body = await res.json()
  return Array.isArray(body.items) ? body.items : []
}

// ── Component ────────────────────────────────────────────────────────────────
export function GrowthProjectsPanel() {
  const [data, updateData] = useStore<GrowthData>('cortex-growth-projects', DEFAULT_DATA)
  const repos = data.repos || []

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [progress, setProgress] = useState('')
  const [windowKey, setWindowKey] = useState('90d')

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [langFilter, setLangFilter] = useState<string | null>(null)
  const [minStars, setMinStars] = useState(0)
  const [minForks, setMinForks] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('starsDelta')
  const [sortAsc, setSortAsc] = useState(false)

  const windowDays = WINDOWS.find((w) => w.key === windowKey)?.days ?? 90

  const refresh = async () => {
    if (busy) return
    setBusy(true); setErr(''); setProgress('')
    try {
      const since = isoDaysAgo(windowDays)
      const found = new Map<string, { it: any; category: string }>()
      for (const cat of CATEGORIES) {
        setProgress(`Scanning ${cat.label}…`)
        const q = `${cat.q} stars:>${STARS_FLOOR} created:>${since}`.trim()
        let items: any[] = []
        try { items = await ghSearch(q) } catch (e) {
          // rate-limit or transient: stop early but keep what we have
          if (String((e as Error).message).includes('rate limit')) throw e
          continue
        }
        for (const it of items) {
          const fn = it.full_name
          if (!fn) continue
          const specific = cat.key === 'all' ? 'other' : cat.key
          const cur = found.get(fn)
          if (!cur) found.set(fn, { it, category: specific })
          else if (cur.category === 'other' && specific !== 'other') cur.category = specific
        }
      }
      const now = new Date().toISOString()
      updateData((prev) => mergeSnapshots(prev, found, now))
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally {
      setBusy(false); setProgress('')
    }
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
          <div><p className="text-lg font-bold tabular-nums">{hottest ? `+${fmtNum(hottest.starsDelta)}` : '—'}</p><p className="text-[10px] text-muted-foreground truncate max-w-[9rem]">{hottest && hottest.starsDelta > 0 ? hottest.name : 'Top gain'}</p></div>
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
        <select value={windowKey} onChange={(e) => setWindowKey(e.target.value)}
          className="cursor-pointer h-8 rounded-lg border border-border bg-input px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
          {WINDOWS.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
        </select>
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
          <button onClick={refresh} disabled={busy}
            title="Query GitHub for the fastest-growing repos and diff against the last snapshot"
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${busy ? 'text-muted-foreground bg-secondary cursor-default' : 'cursor-pointer text-foreground bg-orange-500/15 hover:bg-orange-500/25'}`}>
            {busy ? <><Loader2 className="h-3 w-3 animate-spin" /> {progress || 'Scanning…'}</> : <><RefreshCw className="h-3 w-3" /> Refresh</>}
          </button>
        </div>
      </div>
      {err && <p className="text-[11px] text-red-400/80 -mt-2">{err}</p>}

      {/* Category chips */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map((c) => {
          const key = c.key === 'all' ? 'other' : c.key
          return (
            <button key={c.key} onClick={() => setCatFilter(catFilter === key ? null : key)}
              className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${catFilter === key ? `${c.color} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <WidgetCard
        title="Fastest growing projects"
        description={data.lastRefresh
          ? `${filtered.length} shown · last refreshed ${new Date(data.lastRefresh).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${hasDeltas ? '' : ' · refresh again to measure growth'}`
          : 'Deterministic GitHub scan — hit Refresh to pull the hottest new repos by stars & forks.'}
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
              {repos.length === 0 ? 'No projects yet — hit Refresh to scan GitHub for the fastest-growing repos.' : 'No projects match your filters.'}
            </p>
          )}
        </div>
      </WidgetCard>
    </div>
  )
}

// ── Snapshot merge (pure) ─────────────────────────────────────────────────────
// Diff a fresh GitHub pull against stored snapshots to compute true stars/forks gained,
// preserve per-repo history, keep previously-tracked repos, and prune to MAX_TRACKED.
function mergeSnapshots(prev: GrowthData, found: Map<string, { it: any; category: string }>, now: string): GrowthData {
  const prevById = new Map((prev.repos || []).map((r) => [r.id, r]))
  const out: GrowthRepo[] = []

  for (const [fn, { it, category }] of found) {
    const stars = Number(it.stargazers_count) || 0
    const forks = Number(it.forks_count) || 0
    const old = prevById.get(fn)
    const history = [...(old?.history || []), { t: now, stars, forks }].slice(-MAX_HISTORY)
    out.push({
      id: fn,
      name: it.name || fn,
      fullName: fn,
      owner: it.owner?.login || fn.split('/')[0] || '',
      url: it.html_url || `https://github.com/${fn}`,
      description: it.description || '',
      language: it.language || null,
      category,
      topics: Array.isArray(it.topics) ? it.topics.slice(0, 12) : [],
      stars,
      forks,
      createdAt: it.created_at || '',
      pushedAt: it.pushed_at || '',
      firstSeen: old?.firstSeen || now,
      lastRefreshed: now,
      starsDelta: old ? stars - old.stars : 0,
      forksDelta: old ? forks - old.forks : 0,
      history,
    })
  }

  // Keep previously-tracked repos that fell out of this scan (preserve their history).
  for (const r of prev.repos || []) if (!found.has(r.id)) out.push(r)

  out.sort((a, b) => (b.lastRefreshed || '').localeCompare(a.lastRefreshed || ''))
  return { ...prev, repos: out.slice(0, MAX_TRACKED), lastRefresh: now }
}
