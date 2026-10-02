import { StatTile } from '@/components/shared/StatTile'
import { billingCycleSummary, chargeableWork } from '../../../electron/work-hours-billing'
import type { WorkHoursState, WorkProject } from '../../../electron/work-hours-model'
import { copAmount, duration, includedTimeDisplay } from './work-hours-ui'

export function WorkBillingSummary({ state, project, now }: { state: WorkHoursState; project: WorkProject; now: string }) {
  if (!project.billing) {
    const savedMs = [...chargeableWork(state, project).values()].reduce((sum, value) => sum + value, 0)
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <StatTile label="Saved billable time" value={duration(Math.round(savedMs / 60_000) * 60_000)} sub="All saved sessions marked billable. Running time is separate." className="p-4" />
        <StatTile label="Cost" value={project.ratePerHour === null ? 'Rate not set' : copAmount(savedMs / 3_600_000 * project.ratePerHour)} className="p-4" />
      </div>
    )
  }
  const cycle = billingCycleSummary(state, project, now)
  const date = new Intl.DateTimeFormat('en-US', { timeZone: project.billing.timeZone, month: 'short', day: 'numeric' })
  const display = includedTimeDisplay(cycle.qualifyingMs, project.billing.includedHours)
  const additional = cycle.chargeableMs < 60_000
    ? `${Math.ceil(cycle.chargeableMs / 1_000)}s`
    : duration(Math.round(cycle.chargeableMs / 60_000) * 60_000)
  return (
    <div aria-label="Billing cycle" className="space-y-3">
      <div className="text-sm text-muted-foreground">
        <p className="font-medium">{date.format(new Date(cycle.start))} to {date.format(new Date(cycle.end))}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <StatTile label="Included hours used" value={`${display.used} of ${display.included}`} className="p-4" />
        <StatTile label="Hours left" value={display.remaining} className="p-4" />
        <StatTile label="Additional cost" value={project.ratePerHour === null ? 'Rate not set' : copAmount(cycle.chargeableMs / 3_600_000 * project.ratePerHour)} className="p-4" />
      </div>
      <p className="text-xs text-muted-foreground">Saved billable sessions · time rounded to the nearest minute.{cycle.chargeableMs > 0 && ` Additional work: ${additional}.`}</p>
    </div>
  )
}
