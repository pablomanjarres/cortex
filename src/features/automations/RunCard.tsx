import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { fmtRunDate, runStatusOf, timeAgo, type AutomationRun } from './automation-runs'

/**
 * One clickable run summary. Layouts:
 * history   — a task's run list: date-led, summary + output preview
 * attention — pending approvals: warning-toned, task-led
 * compact   — recent jobs: dense row with a status chip
 */
export type RunCardLayout = 'history' | 'attention' | 'compact'

const shell: Record<RunCardLayout, string> = {
  history: 'surface rounded-xl px-4 py-3 hover:bg-secondary/20',
  attention: 'rounded-md border-warning/25 bg-warning/10 px-4 py-3 hover:bg-warning/15',
  compact: 'group items-center gap-3 rounded-md px-3 py-2.5 hover:bg-secondary/30',
}

export function RunCard({ run, layout, onOpen }: { run: AutomationRun; layout: RunCardLayout; onOpen: (run: AutomationRun) => void }) {
  const st = runStatusOf(run)
  const StatusIcon = st.icon
  const when = <span className="shrink-0 font-mono text-2xs font-normal text-foreground-faint">{timeAgo(run.timestamp)}</span>

  return (
    <Button
      variant="ghost"
      onClick={() => onOpen(run)}
      className={cn(
        'h-auto w-full items-start justify-start gap-3 whitespace-normal text-left font-normal text-foreground active:scale-100',
        shell[layout],
      )}
    >
      {layout === 'compact' && <StatusIcon className={cn('size-4', st.text)} />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('flex min-w-0 items-center gap-2', layout === 'history' && 'mb-1')}>
          {layout === 'history' && <StatusIcon className={cn('size-3.5', st.text)} />}
          {layout === 'attention' && <StatusIcon className="size-4 text-warning" />}
          {layout === 'history'
            ? <span className="font-mono text-xs font-medium">{fmtRunDate(run.timestamp)}</span>
            : <span className={cn('truncate font-mono font-medium', layout === 'attention' ? 'text-sm' : 'text-xs')}>{run.taskName}</span>}
          {layout === 'compact' ? <Chip variant={st.chip} size="sm">{st.label}</Chip> : when}
        </span>
        {run.summary && (
          <span className={cn('text-muted-foreground', {
            history: 'text-sm',
            attention: 'mt-1 text-xs',
            compact: 'mt-0.5 truncate text-2xs',
          }[layout])}>{run.summary}</span>
        )}
        {layout === 'history' && run.fullOutput && (
          <span className="mt-1 line-clamp-2 text-xs text-foreground-faint">{run.fullOutput.slice(0, 200)}</span>
        )}
      </span>
      {layout === 'compact' && when}
      <ArrowRight
        aria-hidden
        className={cn('shrink-0', {
          history: 'mt-1 size-4 text-foreground-faint',
          attention: 'mt-1 size-4 text-warning',
          compact: 'size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
        }[layout])}
      />
    </Button>
  )
}

/** Status chip + absolute and relative time, for a run's detail header. */
export function RunStatusLine({ run }: { run: AutomationRun }) {
  const st = runStatusOf(run)
  const StatusIcon = st.icon
  return (
    <div className="-mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
      <Chip variant={st.chip} size="sm"><StatusIcon /> {st.label}</Chip>
      <span className="font-mono text-2xs text-muted-foreground">{fmtRunDate(run.timestamp)}</span>
      <span className="font-mono text-2xs text-foreground-faint">{timeAgo(run.timestamp)}</span>
    </div>
  )
}
