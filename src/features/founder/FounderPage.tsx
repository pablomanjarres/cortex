import { useEffect, useMemo, useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { TrendBadge } from '@/components/shared/TrendBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/shared/Skeleton'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { useStore, readStore } from '@/lib/store'
import { getLastNDays, timeAgo } from '@/lib/date-utils'
import { ThemedTooltip, axisProps, chartColors, cssVar, gridProps } from '@/lib/chart-theme'
import {
  founderApi,
  FOUNDER_SOURCES,
  SOURCE_LABELS,
  type FounderHistoryEntry,
  type FounderSource,
  type FounderStatusMap,
  type GithubCache,
  type LemonCache,
  type SupabaseCache,
  type VercelCache,
} from './founder-api'
import {
  Cloud,
  Database,
  DollarSign,
  Flame,
  GitCommit,
  GitPullRequest,
  Globe,
  RefreshCw,
  Rocket,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// The four cache keys the main-process refresher owns. This page only READS —
// the background refresher fetches, caches, and snapshots history.
const CACHE_KEYS: Record<FounderSource, string> = {
  github: 'cortex-cache-github',
  lemon: 'cortex-cache-lemon',
  vercel: 'cortex-cache-vercel',
  supabase: 'cortex-cache-supabase',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const fmtMoney = (n: number) => `$${n.toFixed(0)}`

/** % change vs the history entry exactly 7 days ago (day-string arithmetic — no UTC shift). */
function deltaVs7d(
  history: FounderHistoryEntry[],
  field: Exclude<keyof FounderHistoryEntry, 'date'>,
  current: number | null | undefined,
): number | null {
  if (current == null) return null
  const sevenDaysAgo = getLastNDays(8)[0]
  const past = history.find((h) => h.date === sevenDaysAgo)
  if (!past) return null
  const base = past[field]
  if (typeof base !== 'number' || base <= 0) return null
  return ((current - base) / base) * 100
}

// ── Chart (single-series = always accent cyan, via chart-theme) ─────────────

interface TimelinePoint { date: string; [k: string]: string | number }

function TimelineArea({ data, dataKey, name, money = false }: {
  data: TimelinePoint[]
  dataKey: string
  name: string
  money?: boolean
}) {
  const [c1] = chartColors()
  return (
    <div className="h-[160px] sm:h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid {...gridProps()} />
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} {...axisProps()} />
          <YAxis
            width={money ? 44 : 34}
            allowDecimals={false}
            tickFormatter={money ? (v: number) => `$${v}` : undefined}
            {...axisProps()}
          />
          <Tooltip content={<ThemedTooltip formatter={money ? (v) => fmtMoney(Number(v)) : undefined} />} cursor={{ stroke: cssVar('--border') }} />
          <Area type="monotone" dataKey={dataKey} name={name} stroke={c1} strokeWidth={2} fill={c1} fillOpacity={0.12} dot={false} activeDot={{ r: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Small row primitive for the detail cards ────────────────────────────────

function MetricRow({ icon: Icon, label, value }: { icon: typeof GitCommit; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <span className="font-mono text-sm tabular-nums text-foreground">{value}</span>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function FounderPage() {
  // Instant paint: the four cache keys + history, live via data:changed pushes.
  const [ghCache] = useStore<GithubCache | null>(CACHE_KEYS.github, null)
  const [lmCache] = useStore<LemonCache | null>(CACHE_KEYS.lemon, null)
  const [vcCache] = useStore<VercelCache | null>(CACHE_KEYS.vercel, null)
  const [sbCache] = useStore<SupabaseCache | null>(CACHE_KEYS.supabase, null)
  const [history] = useStore<FounderHistoryEntry[]>('cortex-founder-history', [])

  const github = ghCache?.data ?? null
  const lemon = lmCache?.data ?? null
  const vercel = vcCache?.data ?? null
  const supabase = sbCache?.data ?? null

  const api = useMemo(() => founderApi(), [])
  const [status, setStatus] = useState<FounderStatusMap | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // First-ever-load probe: skeletons ONLY when no cache exists on disk yet.
  const [probe, setProbe] = useState<'pending' | 'empty' | 'has-data'>('pending')
  useEffect(() => {
    let alive = true
    Promise.all([
      ...FOUNDER_SOURCES.map((s) => readStore<unknown>(CACHE_KEYS[s], null)),
      readStore<FounderHistoryEntry[]>('cortex-founder-history', []),
    ])
      .then((results) => {
        if (!alive) return
        const [g, l, v, s, h] = results
        const any = [g, l, v, s].some((r) => r !== null) || (Array.isArray(h) && h.length > 0)
        setProbe(any ? 'has-data' : 'empty')
      })
      .catch(() => { if (alive) setProbe('empty') })
    return () => { alive = false }
  }, [])

  // Per-source status (configured vs erroring) — electron only.
  useEffect(() => {
    if (!api) return
    let alive = true
    const load = () => { api.status().then((s) => { if (alive) setStatus(s) }).catch(() => { /* main not ready */ }) }
    load()
    const t = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [api, ghCache, lmCache, vcCache, sbCache])

  // Re-render every 30s so "updated Xm ago" stays honest.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const refresh = async () => {
    if (!api || refreshing) return
    setRefreshing(true)
    try { setStatus(await api.refresh()) } catch { /* surfaced via status */ } finally { setRefreshing(false) }
  }

  // "updated Xm ago" = min (oldest) fetch time across sources that have data.
  const updatedAgo = useMemo(() => {
    const times = [ghCache, lmCache, vcCache, sbCache]
      .map((c) => c?.fetchedAt ?? c?.lastUpdated)
      .filter((t): t is string => !!t)
    if (times.length === 0) return null
    return timeAgo(times.reduce((a, b) => (a < b ? a : b)))
  }, [ghCache, lmCache, vcCache, sbCache])

  const hasAnyData = !!(github || lemon || vercel || supabase) || history.length > 0
  const showSkeleton = !hasAnyData && probe !== 'empty'

  // CONNECT lists ONLY genuinely unconfigured sources. Erroring-but-configured
  // sources get a quiet warning chip in the meta row instead of a setup hint.
  const unconfigured = useMemo<FounderSource[]>(() => {
    if (status) return FOUNDER_SOURCES.filter((s) => !status[s].configured)
    if (!api && probe === 'empty') return [...FOUNDER_SOURCES]
    if (!api && probe === 'has-data') {
      const present: Record<FounderSource, boolean> = { github: !!github, lemon: !!lemon, vercel: !!vercel, supabase: !!supabase }
      return FOUNDER_SOURCES.filter((s) => !present[s])
    }
    return []
  }, [status, api, probe, github, lemon, vercel, supabase])

  const erroring = useMemo(
    () => (status ? FOUNDER_SOURCES.filter((s) => status[s].configured && !status[s].ok && status[s].consecutiveFailures > 0) : []),
    [status],
  )

  // Legacy-cache tolerance (pre-rewrite fields) — the refresher replaces these
  // within seconds of app start, but never render undefined meanwhile.
  const prsMergedWeek = github ? github.prsMergedWeek ?? (github as unknown as { prsMerged?: number }).prsMerged ?? 0 : 0
  const followers = github ? github.followers ?? 0 : 0

  // Chart series — from the PERSISTED timelines (charts render from disk).
  const commitSeries = useMemo(() => {
    const src = github?.commitTimeline?.length
      ? github.commitTimeline
      : history.slice(-30).map((h) => ({ date: h.date, commits: h.commits }))
    return src.reduce<{ date: string; total: number }[]>((acc, d) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].total : 0
      acc.push({ date: d.date, total: prev + d.commits })
      return acc
    }, [])
  }, [github, history])

  const userSeries = useMemo(() => (
    supabase?.signupTimeline?.length
      ? supabase.signupTimeline.map((d) => ({ date: d.date, users: d.users }))
      : history.slice(-30).map((h) => ({ date: h.date, users: h.users }))
  ), [supabase, history])

  const hasMrrHistory = history.some((h) => h.mrr > 0)
  const mrrSeries = useMemo(
    () => history.slice(-30).map((h) => ({ date: h.date, mrr: h.mrr })),
    [history],
  )

  // KPI deltas vs 7 days ago, from history.
  const dMrr = deltaVs7d(history, 'mrr', lemon?.mrr)
  const dUsers = deltaVs7d(history, 'users', supabase?.totalUsers)
  const dCommits = deltaVs7d(history, 'commits', github?.commitsToday)
  const dDeploys = deltaVs7d(history, 'deploys', vercel?.deploymentsToday)

  // Activity feed (quiet, semantic-only color).
  const feedItems = useMemo(() => {
    const items: { icon: typeof GitCommit; source: string; text: string; time: string; tone?: 'success' | 'warning' }[] = []
    if (github && github.commitsToday > 0) {
      items.push({ icon: GitCommit, source: 'GitHub', text: `${github.commitsToday} commit${github.commitsToday === 1 ? '' : 's'} today`, time: 'today' })
    }
    if (vercel?.latestDeployment) {
      const ready = vercel.latestDeployment.state === 'READY'
      items.push({
        icon: Cloud,
        source: 'Vercel',
        text: `Deploy ${vercel.latestDeployment.state.toLowerCase()}`,
        time: new Date(vercel.latestDeployment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        tone: ready ? 'success' : 'warning',
      })
    }
    if (supabase && supabase.signupsToday > 0) {
      items.push({ icon: Database, source: 'Supabase', text: `${supabase.signupsToday} new signup${supabase.signupsToday === 1 ? '' : 's'} today`, time: 'today' })
    }
    if (lemon && lemon.newThisMonth > 0) {
      items.push({ icon: DollarSign, source: 'Lemon', text: `${lemon.newThisMonth} new customer${lemon.newThisMonth === 1 ? '' : 's'} this month`, time: 'this month' })
    }
    return items
  }, [github, vercel, supabase, lemon])

  // ── First-ever load (no cache on disk anywhere) ──
  if (showSkeleton) {
    return (
      <PageShell>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      {/* Meta row — freshness + source health + refresh */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {updatedAgo ? `updated ${updatedAgo}` : 'no data fetched yet'}
        </p>
        {erroring.map((s) => (
          <Chip key={s} variant="warning" size="sm">
            {SOURCE_LABELS[s]} · last good {status?.[s].fetchedAt ? timeAgo(status[s].fetchedAt as string) : 'never'}
          </Chip>
        ))}
        {api && (
          <Button variant="secondary" size="sm" className="ml-auto" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'motion-safe:animate-spin' : undefined} />
            Refresh
          </Button>
        )}
      </div>

      {hasAnyData && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              variant="glass"
              label="MRR"
              value={lemon ? fmtMoney(lemon.mrr) : '—'}
              delta={dMrr !== null ? <TrendBadge value={dMrr} /> : undefined}
              sub={lemon ? `${fmtMoney(lemon.revenueThisMonth)} this month` : undefined}
              icon={<DollarSign />}
            />
            <StatTile
              variant="glass"
              label="Users"
              value={supabase ? fmt(supabase.totalUsers) : '—'}
              delta={dUsers !== null ? <TrendBadge value={dUsers} /> : undefined}
              sub={supabase ? `+${supabase.signupsToday} today` : undefined}
              icon={<Users />}
            />
            <StatTile
              variant="glass"
              label="Commits today"
              value={github ? String(github.commitsToday) : '—'}
              delta={dCommits !== null ? <TrendBadge value={dCommits} /> : undefined}
              sub={github ? `${github.commitsWeek} this week` : undefined}
              icon={<GitCommit />}
            />
            <StatTile
              variant="glass"
              label="Deploys today"
              value={vercel ? String(vercel.deploymentsToday) : '—'}
              delta={dDeploys !== null ? <TrendBadge value={dDeploys} /> : undefined}
              sub={vercel ? `${vercel.deploymentsWeek} this week` : undefined}
              icon={<Rocket />}
            />
          </div>

          {/* Persisted timelines */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <WidgetCard title="Commits 30d" description="Cumulative, from the contribution calendar" delay={0.05}>
              {commitSeries.length > 0
                ? <TimelineArea data={commitSeries} dataKey="total" name="commits" />
                : <EmptyState message="No commit data yet." hint="The background refresher fills this in." />}
            </WidgetCard>
            <WidgetCard title="Users growth" description="Cumulative signups by date" delay={0.1}>
              {userSeries.length > 0
                ? <TimelineArea data={userSeries} dataKey="users" name="users" />
                : <EmptyState message="No signups recorded yet." />}
            </WidgetCard>
          </div>

          {/* Detail cards */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <WidgetCard title="Revenue" description="Lemon Squeezy" delay={0.15}>
              {lemon ? (
                <div className="flex flex-col gap-3">
                  <MetricRow icon={DollarSign} label="MRR" value={fmtMoney(lemon.mrr)} />
                  <MetricRow icon={DollarSign} label="Revenue this month" value={fmtMoney(lemon.revenueThisMonth)} />
                  <MetricRow icon={Users} label="Active customers" value={String(lemon.totalCustomers)} />
                  <MetricRow icon={UserPlus} label="New this month" value={`+${lemon.newThisMonth}`} />
                  <MetricRow icon={UserMinus} label="Churned" value={String(lemon.churnedThisMonth)} />
                  {hasMrrHistory && (
                    <div className="border-t border-border/60 pt-3">
                      <TimelineArea data={mrrSeries} dataKey="mrr" name="MRR" money />
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState message="No revenue data." hint={unconfigured.includes('lemon') ? 'Listed under Connect below.' : 'Waiting on the first refresh.'} />
              )}
            </WidgetCard>

            <WidgetCard title="Dev output" description="GitHub" delay={0.2}>
              {github ? (
                <div className="flex flex-col gap-3">
                  <MetricRow icon={GitPullRequest} label="PRs open" value={String(github.prsOpen)} />
                  <MetricRow icon={GitPullRequest} label="PRs merged (week)" value={String(prsMergedWeek)} />
                  <MetricRow icon={Database} label="Repos" value={String(github.repoCount)} />
                  <MetricRow icon={Users} label="Followers" value={String(followers)} />
                  {github.streak > 0 && <MetricRow icon={Flame} label="Commit streak" value={`${github.streak}d`} />}
                </div>
              ) : (
                <EmptyState message="No GitHub data." hint={unconfigured.includes('github') ? 'Listed under Connect below.' : 'Waiting on the first refresh.'} />
              )}
            </WidgetCard>

            <WidgetCard title="Product" description="Users & deploys" delay={0.25}>
              {(supabase || vercel) ? (
                <div className="flex flex-col gap-3">
                  {supabase && (
                    <>
                      <MetricRow icon={Users} label="Total users" value={fmt(supabase.totalUsers)} />
                      <MetricRow icon={UserPlus} label="Signups today" value={`+${supabase.signupsToday}`} />
                      <MetricRow icon={UserPlus} label="Signups this week" value={`+${supabase.signupsWeek}`} />
                    </>
                  )}
                  {vercel && (
                    <>
                      <div className={supabase ? 'border-t border-border/60 pt-3' : ''}>
                        <MetricRow icon={Rocket} label="Deploys today" value={String(vercel.deploymentsToday)} />
                      </div>
                      {vercel.latestDeployment && (
                        <div className="rounded-md bg-secondary/50 px-3 py-2">
                          <p className="font-mono text-2xs uppercase tracking-wider text-foreground-faint">Latest deploy</p>
                          <p className="mt-0.5 text-xs">
                            <span className={vercel.latestDeployment.state === 'READY' ? 'text-success' : 'text-warning'}>
                              {vercel.latestDeployment.state}
                            </span>
                            <span className="font-mono tabular-nums text-muted-foreground">
                              {' · '}{new Date(vercel.latestDeployment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </p>
                        </div>
                      )}
                      {vercel.pageviews !== null && (
                        <MetricRow icon={Globe} label="Pageviews today" value={fmt(vercel.pageviews)} />
                      )}
                    </>
                  )}
                </div>
              ) : (
                <EmptyState message="No product data." hint="Supabase and Vercel land here." />
              )}
            </WidgetCard>
          </div>

          {/* Activity */}
          {feedItems.length > 0 && (
            <WidgetCard title="Activity" description="Recent events across integrations" delay={0.3}>
              <div className="flex flex-col gap-2">
                {feedItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-md bg-secondary/50 px-3 py-2">
                    <item.icon className={`h-4 w-4 shrink-0 ${item.tone === 'success' ? 'text-success' : item.tone === 'warning' ? 'text-warning' : 'text-muted-foreground'}`} />
                    <p className="min-w-0 flex-1 truncate text-xs text-foreground">{item.text}</p>
                    <span className="shrink-0 font-mono text-2xs text-foreground-faint">{item.source}</span>
                    <span className="shrink-0 font-mono text-2xs tabular-nums text-foreground-faint">{item.time}</span>
                  </div>
                ))}
              </div>
            </WidgetCard>
          )}
        </>
      )}

      {/* Connect — ONLY genuinely unconfigured sources */}
      {unconfigured.length > 0 && (
        <WidgetCard title="Connect" description="Sources without credentials" delay={0.35}>
          <div className="flex flex-col gap-2">
            {unconfigured.map((s) => (
              <div key={s} className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2">
                <Chip size="sm">{SOURCE_LABELS[s]}</Chip>
                <span className="text-xs text-foreground-faint">
                  {api ? 'Add credentials in Settings' : 'Configure in the desktop app'}
                </span>
              </div>
            ))}
          </div>
        </WidgetCard>
      )}

      {!hasAnyData && unconfigured.length === 0 && (
        <EmptyState
          message="Nothing measured yet."
          hint={api ? 'The first background refresh is on its way.' : 'Open the desktop app to run the first refresh.'}
        />
      )}
    </PageShell>
  )
}
