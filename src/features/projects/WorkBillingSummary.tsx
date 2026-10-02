import { StatTile } from '@/components/shared/StatTile'
import { billingCycleSummary } from '../../../electron/work-hours-billing'
import type { WorkHoursState, WorkProject } from '../../../electron/work-hours-model'
import { duration, money } from './work-hours-ui'

export function WorkBillingSummary({ state, project, now }: { state: WorkHoursState; project: WorkProject; now: string }) {
  if (!project.billing) return null
  const cycle = billingCycleSummary(state, project, now)
  const date = new Intl.DateTimeFormat('en-US', { timeZone: project.billing.timeZone, month: 'short', day: 'numeric' })
  return (
    <div aria-label="Billing cycle" className="space-y-3 rounded-lg border border-border/70 p-4">
      <div className="text-sm">
        <p className="font-medium">{date.format(new Date(cycle.start))} to {date.format(new Date(cycle.end))}</p>
        <p className="mt-1 text-muted-foreground">{project.billing.includedHours} hours included each cycle. Reviewed qualifying work: {duration(cycle.qualifyingMs)}. Unused hours reset each cycle.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Included time remaining" value={duration(cycle.remainingMs)} className="p-3" />
        <StatTile label="Additional work" value={duration(cycle.chargeableMs)} className="p-3" />
        <StatTile label="Additional cost" value={project.ratePerHour === null ? 'Rate not set' : money(cycle.chargeableMs / 3600000 * project.ratePerHour)} className="p-3" />
      </div>
    </div>
  )
}
