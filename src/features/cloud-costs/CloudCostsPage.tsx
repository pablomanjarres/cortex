import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, Gauge, History, RefreshCw, WalletCards } from 'lucide-react'
import type {
  CloudCostSourceStatus,
  CloudProvider,
  CloudProviderFilter,
} from '../../../electron/cloud-cost-types.ts'
import { PageShell } from '@/components/shared/PageShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatTile } from '@/components/shared/StatTile'
import { TrendBadge } from '@/components/shared/TrendBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Progress } from '@/components/ui/progress'
import { useStore } from '@/lib/store'
import { useUtcToday } from '@/lib/use-today'
import {
  cloudCostSummary,
  accountEstimate,
  dailyCumulativeSeries,
  monthKey,
  monthlyProjectSeries,
  monthlySeries,
  previousMonth,
} from './analytics'
import { projectRanking, resourceRanking, spendDrivers, topServices } from './breakdowns'
import { CloudCostSettings } from './CloudCostSettings'
import { DailyBurnChart, MonthlyProjectChart, MonthlySpendChart, ServiceMixChart } from './CloudCostCharts'
import { AccountEstimateCard, ProjectRankingCard, ResourceRankingCard, SpendDriversCard } from './CloudCostBreakdowns'
import { DEFAULT_CLOUD_COST_SETTINGS, EMPTY_CLOUD_COST_CACHE } from './cloud-cost-store'
import { fmtUsd } from './format'

const PROVIDERS: Array<{ value: CloudProviderFilter; label: string }> = [
  { value: 'all', label: 'All providers' },
  { value: 'aws', label: 'AWS' },
  { value: 'gcp', label: 'GCP' },
]

function SourceChip({ provider, sourceId, status }: {
  provider: CloudProvider
  sourceId: string
  status: CloudCostSourceStatus
}) {
  const configured = sourceId.trim().length > 0
  const live = status.ok && status.sourceId === sourceId.trim()
  const variant = live ? 'success' : configured ? 'warning' : 'neutral'
  const label = live ? 'Live' : configured ? 'Needs refresh' : 'Off'
  return <Chip variant={variant} size="sm">{provider.toUpperCase()} · {label}</Chip>
}

export function CloudCostsPage() {
  const today = useUtcToday()
  const now = useMemo(() => new Date(`${today}T12:00:00Z`), [today])
  const [rawCache] = useStore('cortex-cloud-costs', EMPTY_CLOUD_COST_CACHE)
  const cache = rawCache.version === 2 && Array.isArray(rawCache.usageItems) && Array.isArray(rawCache.accountAdjustments)
    ? rawCache : EMPTY_CLOUD_COST_CACHE
  const [settings, updateSettings] = useStore('cortex-cloud-cost-settings', DEFAULT_CLOUD_COST_SETTINGS)
  const [provider, setProvider] = useState<CloudProviderFilter>('all')
  const [projectSelection, setProjectSelection] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const currentMonth = monthKey(now)
  const hasConfiguredSource = Boolean(settings.awsProfile.trim() || settings.gcpBillingTable.trim())
  const canRefresh = Boolean(window.electronAPI?.cloudCosts) && hasConfiguredSource

  const monthly = useMemo(() => monthlySeries(cache.usageItems, provider, now), [cache.usageItems, provider, now])
  const daily = useMemo(() => dailyCumulativeSeries(cache.usageItems, provider, currentMonth), [cache.usageItems, provider, currentMonth])
  const summary = useMemo(
    () => cloudCostSummary(cache.usageItems, provider, now, settings.monthlyBudgetUsd),
    [cache.usageItems, provider, now, settings.monthlyBudgetUsd],
  )
  const services = useMemo(() => topServices(cache.usageItems, provider, currentMonth), [cache.usageItems, provider, currentMonth])
  const projects = useMemo(() => projectRanking(cache.usageItems, provider, currentMonth), [cache.usageItems, provider, currentMonth])
  const drivers = useMemo(
    () => spendDrivers(cache.usageItems, provider, currentMonth, previousMonth(currentMonth)),
    [cache.usageItems, provider, currentMonth],
  )
  const estimate = useMemo(
    () => accountEstimate(cache.usageItems, cache.accountAdjustments, provider, currentMonth),
    [cache.usageItems, cache.accountAdjustments, provider, currentMonth],
  )
  const projectNames = useMemo(() => [...new Set(cache.usageItems.filter((item) => item.provider === 'gcp').map((item) => item.project))].sort(), [cache.usageItems])
  const selectedProject = projectNames.includes(projectSelection) ? projectSelection : projectNames[0] ?? ''
  const projectMonthly = useMemo(() => monthlyProjectSeries(cache.usageItems, selectedProject, now), [cache.usageItems, selectedProject, now])
  const projectServices = useMemo(() => topServices(cache.usageItems, 'gcp', currentMonth, selectedProject), [cache.usageItems, currentMonth, selectedProject])
  const projectResources = useMemo(() => resourceRanking(cache.usageItems, selectedProject, currentMonth), [cache.usageItems, currentMonth, selectedProject])

  const refresh = async () => {
    if (!window.electronAPI?.cloudCosts || refreshing) return
    setRefreshing(true)
    try { await window.electronAPI.cloudCosts.refresh(settings) } finally { setRefreshing(false) }
  }

  const errors = (['aws', 'gcp'] as CloudProvider[])
    .map((source) => cache.sources[source].error)
    .filter((error): error is string => Boolean(error))

  return (
    <PageShell>
      <PageHeader
        kicker="Founder finance"
        title="Infrastructure ledger"
        subtitle="Actual AWS and GCP usage, normalized to USD and kept private on this Mac."
        actions={(
          <Button variant="secondary" size="sm" onClick={refresh} disabled={!canRefresh || refreshing}>
            <RefreshCw />
            {refreshing ? 'Refreshing' : 'Refresh'}
          </Button>
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        {PROVIDERS.map((option) => (
          <Chip key={option.value} selectable selected={provider === option.value} onClick={() => setProvider(option.value)}>
            {option.label}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <SourceChip provider="aws" sourceId={settings.awsProfile} status={cache.sources.aws} />
        <SourceChip provider="gcp" sourceId={settings.gcpBillingTable} status={cache.sources.gcp} />
        {cache.fetchedAt ? (
          <span className="ml-auto font-mono text-2xs text-foreground-faint">
            Updated {new Date(cache.fetchedAt).toLocaleString()}
          </span>
        ) : null}
      </div>

      {errors.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{[...new Set(errors)].join(' ') } Last successful values remain visible.</span>
        </div>
      ) : null}

      {!hasConfiguredSource ? (
        <EmptyState
          message="Connect a cloud account to begin the ledger."
          hint="Use the read-only connection fields below, then run the first refresh."
        />
      ) : (
        <>
          <div className={`grid gap-3 sm:grid-cols-2 ${summary.budgetPct === null ? 'xl:grid-cols-4' : 'xl:grid-cols-5'}`}>
            <StatTile label="Month to date usage" value={fmtUsd(summary.currentMonth)} icon={<WalletCards />} delta={summary.changePct === null ? undefined : <TrendBadge value={summary.changePct} invert />} />
            <StatTile label="Prior month usage" value={fmtUsd(summary.previousMonth)} icon={<CalendarRange />} />
            <StatTile label="Projected usage" value={fmtUsd(summary.projectedMonth)} icon={<Gauge />} sub="At the current daily pace" />
            <StatTile label="13-month usage" value={fmtUsd(summary.total13Months)} icon={<History />} />
            {summary.budgetPct !== null ? (
              <StatTile
                label="Budget used"
                value={`${summary.budgetPct.toFixed(1)}%`}
                sub={`${fmtUsd(summary.currentMonth)} of ${fmtUsd(settings.monthlyBudgetUsd)}`}
                icon={<Progress value={Math.min(100, summary.budgetPct)} className="w-16" />}
              />
            ) : null}
          </div>

          <AccountEstimateCard estimate={estimate} scope={provider === 'all' ? 'AWS + GCP accounts' : `${provider.toUpperCase()} accounts`} />

          {cache.usageItems.length === 0 ? (
            <EmptyState message="Usage unavailable." hint="Refresh to load usage before credits from the configured sources." />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-4">
                <MonthlySpendChart data={monthly} provider={provider} />
                <ServiceMixChart data={services} />
                <ProjectRankingCard projects={projects} />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <DailyBurnChart data={daily} provider={provider} />
                <SpendDriversCard drivers={drivers} />
              </div>
              {provider !== 'aws' && projectNames.length > 0 ? (
                <section className="space-y-3" aria-label="GCP project costs">
                  <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor="cloud-project" className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">GCP project</label>
                    <select id="cloud-project" value={selectedProject} onChange={(event) => setProjectSelection(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground">
                      {projectNames.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <span className="font-mono text-xs tabular-nums text-foreground">Current month {fmtUsd(projectMonthly.at(-1)?.total ?? 0)} before credits</span>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-3">
                    <MonthlyProjectChart data={projectMonthly} project={selectedProject} />
                    <ServiceMixChart data={projectServices} title={`${selectedProject} services`} />
                  </div>
                  <ResourceRankingCard project={selectedProject} resources={projectResources} />
                </section>
              ) : null}
            </>
          )}
        </>
      )}

      <CloudCostSettings settings={settings} onChange={updateSettings} />
    </PageShell>
  )
}
