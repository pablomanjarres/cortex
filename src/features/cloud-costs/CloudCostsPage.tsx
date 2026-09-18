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
import { useToday } from '@/lib/use-today'
import {
  cloudCostSummary,
  dailyCumulativeSeries,
  monthKey,
  monthlySeries,
  previousMonth,
} from './analytics'
import { projectRanking, spendDrivers, topServices } from './breakdowns'
import { CloudCostSettings } from './CloudCostSettings'
import { DailyBurnChart, MonthlySpendChart, ServiceMixChart } from './CloudCostCharts'
import { ProjectRankingCard, SpendDriversCard } from './CloudCostBreakdowns'
import { DEFAULT_CLOUD_COST_SETTINGS, EMPTY_CLOUD_COST_CACHE } from './cloud-cost-store'
import { fmtUsd } from './format'

const PROVIDERS: Array<{ value: CloudProviderFilter; label: string }> = [
  { value: 'all', label: 'All providers' },
  { value: 'aws', label: 'AWS' },
  { value: 'gcp', label: 'GCP' },
]

function SourceChip({ provider, configured, status }: {
  provider: CloudProvider
  configured: boolean
  status: CloudCostSourceStatus
}) {
  const variant = status.ok ? 'success' : configured ? 'warning' : 'neutral'
  const label = status.ok ? 'Live' : configured ? 'Needs refresh' : 'Off'
  return <Chip variant={variant} size="sm">{provider.toUpperCase()} · {label}</Chip>
}

export function CloudCostsPage() {
  const today = useToday()
  const now = useMemo(() => new Date(`${today}T12:00:00Z`), [today])
  const [cache] = useStore('cortex-cloud-costs', EMPTY_CLOUD_COST_CACHE)
  const [settings, updateSettings] = useStore('cortex-cloud-cost-settings', DEFAULT_CLOUD_COST_SETTINGS)
  const [provider, setProvider] = useState<CloudProviderFilter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const currentMonth = monthKey(now)
  const hasConfiguredSource = Boolean(settings.awsProfile.trim() || settings.gcpBillingTable.trim())
  const canRefresh = Boolean(window.electronAPI?.cloudCosts) && hasConfiguredSource

  const monthly = useMemo(() => monthlySeries(cache.items, provider, now), [cache.items, provider, now])
  const daily = useMemo(() => dailyCumulativeSeries(cache.items, provider, currentMonth), [cache.items, provider, currentMonth])
  const summary = useMemo(
    () => cloudCostSummary(cache.items, provider, now, settings.monthlyBudgetUsd),
    [cache.items, provider, now, settings.monthlyBudgetUsd],
  )
  const services = useMemo(() => topServices(cache.items, provider, currentMonth), [cache.items, provider, currentMonth])
  const projects = useMemo(() => projectRanking(cache.items, provider, currentMonth), [cache.items, provider, currentMonth])
  const drivers = useMemo(
    () => spendDrivers(cache.items, provider, currentMonth, previousMonth(currentMonth)),
    [cache.items, provider, currentMonth],
  )

  const refresh = async () => {
    if (!window.electronAPI?.cloudCosts || refreshing) return
    setRefreshing(true)
    try { await window.electronAPI.cloudCosts.refresh() } finally { setRefreshing(false) }
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
        <SourceChip provider="aws" configured={Boolean(settings.awsProfile.trim())} status={cache.sources.aws} />
        <SourceChip provider="gcp" configured={Boolean(settings.gcpBillingTable.trim())} status={cache.sources.gcp} />
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
            <StatTile label="Month to date" value={fmtUsd(summary.currentMonth)} icon={<WalletCards />} delta={summary.changePct === null ? undefined : <TrendBadge value={summary.changePct} invert />} />
            <StatTile label="Prior month" value={fmtUsd(summary.previousMonth)} icon={<CalendarRange />} />
            <StatTile label="Projected" value={fmtUsd(summary.projectedMonth)} icon={<Gauge />} sub="At the current daily pace" />
            <StatTile label="13-month total" value={fmtUsd(summary.total13Months)} icon={<History />} />
            {summary.budgetPct !== null ? (
              <StatTile
                label="Budget used"
                value={`${summary.budgetPct.toFixed(1)}%`}
                sub={`${fmtUsd(summary.currentMonth)} of ${fmtUsd(settings.monthlyBudgetUsd)}`}
                icon={<Progress value={Math.min(100, summary.budgetPct)} className="w-16" />}
              />
            ) : null}
          </div>

          {cache.items.length === 0 ? (
            <EmptyState message="Waiting for the first billing snapshot." hint="Refresh after local cloud credentials are ready." />
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
            </>
          )}
        </>
      )}

      <CloudCostSettings settings={settings} onChange={updateSettings} />
    </PageShell>
  )
}
