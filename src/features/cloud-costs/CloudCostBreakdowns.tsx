import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { AccountEstimate } from './analytics.ts'
import type { ProjectCost, RankedCost, SpendDriver } from './breakdowns.ts'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Chip } from '@/components/ui/chip'
import { Progress } from '@/components/ui/progress'
import { fmtUsd } from './format'

export function ProjectRankingCard({ projects }: { projects: ProjectCost[] }) {
  return (
    <WidgetCard title="Projects & accounts" description="Current month · highest spend first" delay={0.25}>
      {projects.length > 0 ? (
        <div className="flex flex-col gap-3">
          {projects.slice(0, 8).map((project) => (
            <div key={`${project.provider}:${project.name}`} className="flex flex-col gap-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <Chip size="sm">{project.provider.toUpperCase()}</Chip>
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{project.name}</span>
                <span className="font-mono text-xs tabular-nums text-foreground">{fmtUsd(project.amount)}</span>
              </div>
              <Progress value={Math.min(100, project.share)} aria-label={`${project.name} share ${project.share}%`} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No project costs yet." />
      )}
    </WidgetCard>
  )
}

export function ResourceRankingCard({ project, resources }: { project: string; resources: RankedCost[] }) {
  return (
    <WidgetCard title="Resource costs" description={`${project} · current month`}>
      {resources.length > 0 ? (
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {resources.map((resource) => (
            <div key={resource.name} className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-foreground" title={resource.name}>{resource.name}</span>
                <span className="shrink-0 font-mono tabular-nums text-foreground">{fmtUsd(resource.amount)}</span>
              </div>
              <Progress value={Math.min(100, resource.share)} aria-label={`${resource.name} share ${resource.share}%`} />
            </div>
          ))}
        </div>
      ) : <EmptyState message="No resource costs for this month." />}
    </WidgetCard>
  )
}

export function AccountEstimateCard({ estimate, scope }: { estimate: AccountEstimate; scope: string }) {
  return (
    <WidgetCard title="Account estimate" description={`${scope} · current month · credits are not assigned to projects`} compact>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><p className="text-2xs text-foreground-faint">Promotional credits</p><p className="font-mono text-sm tabular-nums text-foreground">{fmtUsd(estimate.credits)}</p></div>
        <div><p className="text-2xs text-foreground-faint">Other adjustments</p><p className="font-mono text-sm tabular-nums text-foreground">{fmtUsd(estimate.other)}</p></div>
        <div><p className="text-2xs text-foreground-faint">Estimated net after credits</p><p className="font-mono text-sm tabular-nums text-foreground">{fmtUsd(estimate.estimatedNet)}</p></div>
      </div>
    </WidgetCard>
  )
}

function DriverRow({ driver }: { driver: SpendDriver }) {
  const increased = driver.delta > 0
  const unchanged = driver.delta === 0
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
      <span className={unchanged ? 'text-foreground-faint' : increased ? 'text-destructive' : 'text-success'}>
        {unchanged
          ? <Minus className="h-4 w-4" />
          : increased
            ? <TrendingUp className="h-4 w-4" />
            : <TrendingDown className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{driver.name}</p>
        <p className="font-mono text-3xs tabular-nums text-foreground-faint">
          {fmtUsd(driver.previous)} → {fmtUsd(driver.current)}
        </p>
      </div>
      <span className={`font-mono text-xs tabular-nums ${unchanged ? 'text-foreground-faint' : increased ? 'text-destructive' : 'text-success'}`}>
        {driver.delta > 0 ? '+' : ''}{fmtUsd(driver.delta)}
      </span>
    </div>
  )
}

export function SpendDriversCard({ drivers }: { drivers: SpendDriver[] }) {
  return (
    <WidgetCard title="Spend drivers" description="Largest service changes vs prior month" delay={0.3}>
      {drivers.length > 0 ? (
        <div className="flex flex-col">
          {drivers.map((driver) => <DriverRow key={driver.name} driver={driver} />)}
        </div>
      ) : (
        <EmptyState message="No month-over-month changes yet." />
      )}
    </WidgetCard>
  )
}
