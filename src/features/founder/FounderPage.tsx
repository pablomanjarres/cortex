import { useState, useEffect } from 'react'
import type { GitHubStats, LemonStats, VercelStats, SupabaseStats } from '@/types/metrics'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import {
  GitCommit,
  GitPullRequest,
  DollarSign,
  Users,
  Rocket,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  UserPlus,
  UserMinus,
  Globe,
  ArrowUpRight,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ── History type ──────────────────────────────────────────────────────────────

interface HistoryEntry {
  date: string
  commits: number
  users: number
  deploys: number
  mrr: number
  prsOpen: number
  prsMerged: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 11 },
}

function getWoWChange(history: HistoryEntry[], field: keyof Omit<HistoryEntry, 'date'>): number | null {
  if (history.length < 2) return null
  const today = history[history.length - 1]
  const sevenDaysAgo = new Date(today.date)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const target = sevenDaysAgo.toISOString().slice(0, 10)
  const past = history.find((h) => h.date === target)
  if (!past || past[field] === 0) return null
  return ((today[field] - past[field]) / past[field]) * 100
}

function WoWBadge({ value }: { value: number | null }) {
  if (value === null) return null
  const positive = value >= 0
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <span
      className={`ml-auto inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        positive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
      }`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FounderPage() {
  const [github, setGithub] = useState<GitHubStats | null>(null)
  const [lemon, setLemon] = useState<LemonStats | null>(null)
  const [vercel, setVercel] = useState<VercelStats | null>(null)
  const [supabase, setSupabase] = useState<SupabaseStats | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [history, setHistory] = useStore<HistoryEntry[]>('cortex-founder-history', [])
  const isElectron = !!window.electronAPI?.integrations

  const saveSnapshot = (gh: GitHubStats | null, lm: LemonStats | null, vc: VercelStats | null, sb: SupabaseStats | null) => {
    const today = new Date().toISOString().slice(0, 10)
    const entry: HistoryEntry = {
      date: today,
      commits: gh?.commitsToday ?? 0,
      users: sb?.totalUsers ?? 0,
      deploys: vc?.deploymentsToday ?? 0,
      mrr: lm?.mrr ?? 0,
      prsOpen: gh?.prsOpen ?? 0,
      prsMerged: gh?.prsMerged ?? 0,
    }
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.date !== today)
      const combined = [...filtered, entry]
      // Keep last 90 days
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)
      const cutoffStr = cutoff.toISOString().slice(0, 10)
      return combined.filter((h) => h.date >= cutoffStr)
    })
  }

  const fetchAll = async () => {
    if (!window.electronAPI?.integrations) return
    setLoading(true)
    setErrors([])
    const [gh, lm, vc, sb] = await Promise.all([
      window.electronAPI.integrations.github(),
      window.electronAPI.integrations.lemon(),
      window.electronAPI.integrations.vercel(),
      window.electronAPI.integrations.supabase(),
    ])
    const errs: string[] = []
    let ghData: GitHubStats | null = null
    let lmData: LemonStats | null = null
    let vcData: VercelStats | null = null
    let sbData: SupabaseStats | null = null
    if (gh && 'error' in gh && gh.error) { errs.push(gh.error) } else if (gh && !('error' in gh)) { ghData = gh }
    if (lm && 'error' in lm && lm.error) { errs.push(lm.error) } else if (lm && !('error' in lm)) { lmData = lm }
    if (vc && 'error' in vc && vc.error) { errs.push(vc.error) } else if (vc && !('error' in vc)) { vcData = vc }
    if (sb && 'error' in sb && sb.error) { errs.push(sb.error) } else if (sb && !('error' in sb)) { sbData = sb }
    setGithub(ghData)
    setLemon(lmData)
    setVercel(vcData)
    setSupabase(sbData)
    setErrors(errs)
    setLastUpdated(new Date())
    setLoading(false)
    // Save snapshot to history
    saveSnapshot(ghData, lmData, vcData, sbData)
  }

  useEffect(() => { fetchAll() }, [])

  const fmt = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : n.toString()
  const fmtMoney = (n: number) => `$${n.toFixed(0)}`

  const last14 = history.slice(-14)
  const wowCommits = getWoWChange(history, 'commits')
  const wowUsers = getWoWChange(history, 'users')
  const wowDeploys = getWoWChange(history, 'deploys')
  const wowMrr = getWoWChange(history, 'mrr')

  return (
    <PageShell>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : 'Not loaded yet'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchAll} disabled={loading || !isElectron}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.03] px-4 py-3">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-red-400">{err}</p>
          ))}
        </div>
      )}

      {!isElectron ? (
        <WidgetCard title="CONNECT" delay={0}>
          <p className="text-sm text-muted-foreground py-6 text-center">
            Open in the desktop app and add API keys in Settings to see real metrics.
          </p>
        </WidgetCard>
      ) : (
        <>
          {/* Row 1: Top-level KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: 'MRR',
                value: lemon ? fmtMoney(lemon.mrr) : '—',
                icon: DollarSign,
                color: lemon && lemon.mrr > 0 ? 'text-green-400' : 'text-muted-foreground',
                sub: lemon ? `${fmtMoney(lemon.revenueThisMonth)} this month` : 'Connect Lemon Squeezy',
                wow: wowMrr,
              },
              {
                label: 'Users',
                value: supabase ? fmt(supabase.totalUsers) : '—',
                icon: Users,
                color: supabase && supabase.totalUsers > 0 ? 'text-blue-400' : 'text-muted-foreground',
                sub: supabase ? `+${supabase.signupsToday} today` : 'Connect Supabase',
                wow: wowUsers,
              },
              {
                label: 'Commits today',
                value: github ? github.commitsToday.toString() : '—',
                icon: GitCommit,
                color: github && github.commitsToday > 0 ? 'text-foreground' : 'text-muted-foreground',
                sub: github ? `${github.commitsWeek} this week · ${github.repoCount} repos` : 'Connect GitHub',
                wow: wowCommits,
              },
              {
                label: 'Deploys',
                value: vercel ? vercel.deploymentsToday.toString() : '—',
                icon: Rocket,
                color: vercel && vercel.deploymentsToday > 0 ? 'text-foreground' : 'text-muted-foreground',
                sub: vercel ? `${vercel.deploymentsWeek} this week` : 'Connect Vercel',
                wow: wowDeploys,
              },
            ].map((kpi) => (
              <div key={kpi.label} className="liquid-glass flex flex-col gap-1 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
                  <WoWBadge value={kpi.wow} />
                </div>
                <p className="text-2xl font-bold tabular-nums">{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Row 2: Detail cards */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Dev Output */}
            <WidgetCard title="DEV OUTPUT" description="GitHub activity" delay={0.1}>
              {github ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitCommit className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Commits today</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{github.commitsToday}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitCommit className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Commits this week</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{github.commitsWeek}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">PRs open</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{github.prsOpen}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitPullRequest className="h-4 w-4 text-green-400" />
                      <span className="text-sm">PRs merged (week)</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{github.prsMerged}</span>
                  </div>
                  {github.latestCommit && (
                    <div className="mt-1 rounded-lg bg-secondary/50 px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Latest commit</p>
                      <p className="text-xs truncate">{github.latestCommit}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Add GitHub token in Settings</p>
              )}
            </WidgetCard>

            {/* Revenue */}
            <WidgetCard title="REVENUE" description="Lemon Squeezy" delay={0.15}>
              {lemon ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-400" />
                      <span className="text-sm">MRR</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{fmtMoney(lemon.mrr)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Revenue this month</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{fmtMoney(lemon.revenueThisMonth)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Active customers</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{lemon.totalCustomers}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-green-400" />
                      <span className="text-sm">New this month</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums">+{lemon.newThisMonth}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserMinus className="h-4 w-4 text-red-400" />
                      <span className="text-sm">Churned</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{lemon.churnedThisMonth}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Add Lemon Squeezy keys in Settings</p>
              )}
            </WidgetCard>

            {/* Product & Infra */}
            <WidgetCard title="PRODUCT" description="Users & deploys" delay={0.2}>
              <div className="flex flex-col gap-3">
                {supabase ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-400" />
                        <span className="text-sm">Total users</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums">{fmt(supabase.totalUsers)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-green-400" />
                        <span className="text-sm">Signups today</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums">+{supabase.signupsToday}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Signups this week</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums">+{supabase.signupsWeek}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-2 text-center">Add Supabase keys in Settings</p>
                )}

                {vercel ? (
                  <>
                    <div className="border-t border-border/50 pt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Rocket className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Deploys today</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums">{vercel.deploymentsToday}</span>
                    </div>
                    {vercel.latestDeployment && (
                      <div className="rounded-lg bg-secondary/50 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground">Latest deploy</p>
                        <p className="text-xs">
                          <span className={vercel.latestDeployment.state === 'READY' ? 'text-green-400' : 'text-yellow-400'}>
                            {vercel.latestDeployment.state}
                          </span>
                          {' · '}
                          {new Date(vercel.latestDeployment.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    )}
                    {vercel.pageviews !== null && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Pageviews today</span>
                        </div>
                        <span className="text-sm font-bold tabular-nums">{fmt(vercel.pageviews)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-2 text-center">Add Vercel token in Settings</p>
                )}
              </div>
            </WidgetCard>
          </div>

          {/* Row 3: Trend charts */}
          {history.length > 1 && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <WidgetCard title="COMMITS (14D)" description="Daily commit count" delay={0.25}>
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={last14}>
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d: string) => d.slice(5)}
                        tick={{ fontSize: 10, fill: '#888' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: '#888' }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                      />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Bar dataKey="commits" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </WidgetCard>

              <WidgetCard title="USERS GROWTH" description="Total users over time" delay={0.3}>
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={last14}>
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d: string) => d.slice(5)}
                        tick={{ fontSize: 10, fill: '#888' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#888' }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Line
                        type="monotone"
                        dataKey="users"
                        stroke="#34d399"
                        strokeWidth={2}
                        dot={{ r: 2, fill: '#34d399' }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </WidgetCard>
            </div>
          )}

          {/* Deploys (14d) mini chart */}
          {history.length > 1 && vercel && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <WidgetCard title="DEPLOYS (14D)" description="Daily deployments" delay={0.35}>
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={last14}>
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d: string) => d.slice(5)}
                        tick={{ fontSize: 10, fill: '#888' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: '#888' }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                      />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Bar dataKey="deploys" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </WidgetCard>
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
