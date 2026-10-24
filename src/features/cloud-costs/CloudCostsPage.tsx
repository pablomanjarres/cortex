import { RefreshButton } from '@/components/shared/RefreshButton'
import { Select } from '@/components/ui/select'
import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, Gauge, History, WalletCards } from 'lucide-react'
import type {
  CloudCostCache,
  CloudProvider,
  CloudProviderFilter,
} from '../../../electron/cloud-cost-types.ts'
import { PageShell } from '@/components/shared/PageShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { Notice } from '@/components/shared/Notice'
import { SetupState, SetupStatusRow } from '@/components/shared/SetupState'
import { StatTile } from '@/components/shared/StatTile'
import { TrendBadge } from '@/components/shared/TrendBadge'
import { Chip } from '@/components/ui/chip'
import { Progress } from '@/components/ui/progress'
import { readStore, useStore } from '@/lib/store'
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
import {
  CLOUD_SOURCE_LABELS,
  cloudCostViewState,
  cloudSourceId,
  cloudSourceState,
  cloudUsageEmptyMessage,
  DEFAULT_CLOUD_COST_SETTINGS,
  EMPTY_CLOUD_COST_CACHE,
  type CloudSourceState,
} from './cloud-cost-store'
import { fmtUsd } from './format'

const PROVIDERS: Array<{ value: CloudProviderFilter; label: string }> = [
  { value: 'all', label: 'All providers' },
  { value: 'aws', label: 'AWS' },
  { value: 'gcp', label: 'GCP' },
]

const CLOUD_PROVIDERS: CloudProvider[] = ['aws', 'gcp']

const SOURCE_CHIP: Record<CloudSourceState, { variant: 'success' | 'warning' | 'neutral'; label: string }> = {
  live: { variant: 'success', label: 'Live' },
  stale: { variant: 'warning', label: 'Needs refresh' },
  off: { variant: 'neutral', label: 'Off' },
}

function SourceChip({ provider, state }: { provider: CloudProvider; state: CloudSourceState }) {
  const { variant, label } = SOURCE_CHIP[state]
  return <Chip variant={variant} size="sm">{provider.toUpperCase()} · {label}</Chip>
}

export function CloudCostsPage() {
  const today = useUtcToday()
  const now = useMemo(() => new Date(`${today}T12:00:00Z`), [today])
  const [storedCache] = useStore('cortex-cloud-costs', EMPTY_CLOUD_COST_CACHE)
  const [refreshedCache, setRefreshedCache] = useState<CloudCostCache | null>(null)
  const rawCache = refreshedCache && refreshedCache.fetchedAt > storedCache.fetchedAt
    ? refreshedCache
    : storedCache
  const cache = rawCache.version === 2 && Array.isArray(rawCache.usageItems) && Array.isArray(rawCache.accountAdjustments)
    ? rawCache : EMPTY_CLOUD_COST_CACHE
  const [settings, updateSettings] = useStore('cortex-cloud-cost-settings', DEFAULT_CLOUD_COST_SETTINGS)
  const [provider, setProvider] = useState<CloudProviderFilter>('all')
  const [projectSelection, setProjectSelection] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const currentMonth = monthKey(now)
  const sourceStates: Record<CloudProvider, CloudSourceState> = {
    aws: cloudSourceState(cloudSourceId(settings, 'aws'), cache.sources.aws),
    gcp: cloudSourceState(cloudSourceId(settings, 'gcp'), cache.sources.gcp),
  }
  const hasConfiguredSource = CLOUD_PROVIDERS.some((source) => sourceStates[source] !== 'off')
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
    try {
      await window.electronAPI.cloudCosts.refresh(settings)
      setRefreshedCache(await readStore('cortex-cloud-costs', EMPTY_CLOUD_COST_CACHE))
    } finally { setRefreshing(false) }
  }

  const errors = CLOUD_PROVIDERS
    .map((source) => cache.sources[source].error)
    .filter((error): error is string => Boolean(error))
  const hasLiveSource = Object.values(cache.sources).some((source) => source.ok)
  const selectedState = provider === 'all' ? null : sourceStates[provider]
  const selectedConfigured = selectedState ? selectedState !== 'off' : hasConfiguredSource
  const selectedView = cloudCostViewState(cache, provider, currentMonth)
  const selectedLive = selectedState ? selectedState === 'live' : hasLiveSource
  const selectedFailed = provider === 'all' ? errors.length > 0 : Boolean(cache.sources[provider].error)

  return (
    <PageShell>
      <PageHeader
        kicker="Founder finance"
        title="Infrastructure ledger"
        subtitle="Actual AWS and GCP usage, normalized to USD and kept private on this Mac."
        actions={(
          <RefreshButton onClick={refresh} busy={refreshing} disabled={!canRefresh} busyLabel="Refreshing" />
        )}
      />

      {hasConfiguredSource && (
        <div className="flex flex-wrap items-center gap-2">
          {PROVIDERS.map((option) => (
            <Chip key={option.value} selectable selected={provider === option.value} onClick={() => setProvider(option.value)}>
              {option.label}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          {CLOUD_PROVIDERS.map((source) => <SourceChip key={source} provider={source} state={sourceStates[source]} />)}
          {cache.fetchedAt ? (
            <span className="ml-auto font-mono text-2xs text-foreground-faint">
              Updated {new Date(cache.fetchedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      )}

      {errors.length > 0 ? (
        <Notice tone="warning" icon={<AlertTriangle />} className="text-xs">
          {[...new Set(errors)].join(' ')} {cache.usageItems.length > 0 ? 'Last successful values remain visible.' : 'Usage is unavailable until a refresh succeeds.'}
        </Notice>
      ) : null}

      {!selectedConfigured || !selectedView.showUsageAnalytics ? (
        <>
        <SetupState
          icon={<WalletCards />}
          title={selectedConfigured ? selectedView.showAccountEstimate ? 'Account adjustment available' : cloudUsageEmptyMessage(selectedLive, selectedFailed) : provider === 'all' ? 'Connect your cloud costs' : `Connect ${provider.toUpperCase()} to see its costs`}
          description={selectedConfigured ? selectedView.showAccountEstimate ? 'No usage rows were returned. The current-month account adjustment is shown below; usage charts need usage data.' : 'Check the source status, then refresh after billing data is available. Usage charts appear when a snapshot contains usage.' : 'Set up the source in Connections below. Cortex reads local credentials and keeps the ledger on this Mac.'}
          statusTitle="Billing sources"
          footer={cache.fetchedAt ? `Last snapshot ${new Date(cache.fetchedAt).toLocaleString()}` : undefined}
        >
          {CLOUD_PROVIDERS.map((source) => (
            <SetupStatusRow key={source} label={CLOUD_SOURCE_LABELS[source]}><SourceChip provider={source} state={sourceStates[source]} /></SetupStatusRow>
          ))}
        </SetupState>
        {selectedConfigured && selectedView.showAccountEstimate ? (
          <AccountEstimateCard estimate={estimate} scope={provider === 'all' ? 'AWS + GCP accounts' : `${provider.toUpperCase()} accounts`} />
        ) : null}
        </>
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
                <Select id="cloud-project" value={selectedProject} onChange={(event) => setProjectSelection(event.target.value)} className="w-auto h-8 px-2 text-xs">
                  {projectNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </Select>
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

      <CloudCostSettings settings={settings} onChange={updateSettings} />
    </PageShell>
  )
}
