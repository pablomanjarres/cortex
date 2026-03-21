import { useState, useEffect } from 'react'
import type { GitHubStats, LemonStats, VercelStats, SupabaseStats } from '@/types/metrics'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Button } from '@/components/ui/button'
import {
  GitCommit,
  GitPullRequest,
  DollarSign,
  Users,
  Rocket,
  RefreshCw,
  TrendingUp,
  UserPlus,
  UserMinus,
  Globe,
  ArrowUpRight,
} from 'lucide-react'

export function FounderPage() {
  const [github, setGithub] = useState<GitHubStats | null>(null)
  const [lemon, setLemon] = useState<LemonStats | null>(null)
  const [vercel, setVercel] = useState<VercelStats | null>(null)
  const [supabase, setSupabase] = useState<SupabaseStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const isElectron = !!window.electronAPI?.integrations

  const fetchAll = async () => {
    if (!window.electronAPI?.integrations) return
    setLoading(true)
    const [gh, lm, vc, sb] = await Promise.all([
      window.electronAPI.integrations.github(),
      window.electronAPI.integrations.lemon(),
      window.electronAPI.integrations.vercel(),
      window.electronAPI.integrations.supabase(),
    ])
    setGithub(gh)
    setLemon(lm)
    setVercel(vc)
    setSupabase(sb)
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const fmt = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : n.toString()
  const fmtMoney = (n: number) => `$${n.toFixed(0)}`

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
              },
              {
                label: 'Users',
                value: supabase ? fmt(supabase.totalUsers) : '—',
                icon: Users,
                color: supabase && supabase.totalUsers > 0 ? 'text-blue-400' : 'text-muted-foreground',
                sub: supabase ? `+${supabase.signupsToday} today` : 'Connect Supabase',
              },
              {
                label: 'Commits today',
                value: github ? github.commitsToday.toString() : '—',
                icon: GitCommit,
                color: github && github.commitsToday > 0 ? 'text-foreground' : 'text-muted-foreground',
                sub: github ? `${github.commitsWeek} this week · ${github.repoCount} repos` : 'Connect GitHub',
              },
              {
                label: 'Deploys',
                value: vercel ? vercel.deploymentsToday.toString() : '—',
                icon: Rocket,
                color: vercel && vercel.deploymentsToday > 0 ? 'text-foreground' : 'text-muted-foreground',
                sub: vercel ? `${vercel.deploymentsWeek} this week` : 'Connect Vercel',
              },
            ].map((kpi) => (
              <div key={kpi.label} className="liquid-glass flex flex-col gap-1 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
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
        </>
      )}
    </PageShell>
  )
}
