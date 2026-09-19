import { cn } from '@/lib/utils'
import { dayName, formatMinutes, type FactItem, type FactVisual } from './homePanelUtils'

function WeekBars({ visual }: { visual: Extract<FactVisual, { kind: 'bars' }> }) {
  const max = Math.max(1, ...visual.values)
  const isFocus = visual.unit === 'minutes'
  const label = `${isFocus ? 'Deep work' : 'Events'} this week: ${visual.days.map((day, index) =>
    `${dayName(day)} ${isFocus ? formatMinutes(visual.values[index] ?? 0) : visual.values[index] ?? 0}`,
  ).join(', ')}`

  return (
    <div className="w-full" role="img" aria-label={label}>
      <div className="grid h-10 grid-cols-7 items-end gap-1">
        {visual.days.map((day, index) => {
          const value = Math.max(0, visual.values[index] ?? 0)
          return (
            <span key={day} className="flex h-full min-w-0 items-end rounded-md bg-muted/70" aria-hidden="true">
              <span
                className={cn('w-full rounded-md', isFocus ? 'bg-accent' : 'bg-info')}
                style={{ height: value > 0 ? `${Math.max(10, value / max * 100)}%` : 0 }}
              />
            </span>
          )
        })}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 text-center text-[0.65rem] font-medium text-muted-foreground" aria-hidden="true">
        {visual.days.map((day) => <span key={day}>{dayName(day).slice(0, 1)}</span>)}
      </div>
    </div>
  )
}

function HabitRing({ visual }: { visual: Extract<FactVisual, { kind: 'habits' }> }) {
  const percent = visual.total > 0 ? Math.round(visual.done / visual.total * 100) : 0

  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${visual.done} of ${visual.total} habits completed today`}>
      <span
        className="relative grid size-12 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(var(--success) ${percent}%, var(--muted) 0)` }}
        aria-hidden="true"
      >
        <span className="grid size-9 place-items-center rounded-full bg-card font-mono text-[0.65rem] font-semibold text-success">
          {visual.total > 0 ? `${percent}%` : '—'}
        </span>
      </span>
      <span className="text-[0.65rem] leading-tight text-muted-foreground">
        {visual.total > 0 ? 'complete today' : 'No active habits'}
      </span>
    </div>
  )
}

function WorkComposition({ visual }: { visual: Extract<FactVisual, { kind: 'work' }> }) {
  const { overdue, thisWeek, later, undated } = visual.breakdown
  const segments = [
    { label: 'Late', value: overdue, color: 'bg-warning' },
    { label: 'Week', value: thisWeek, color: 'bg-accent' },
    { label: 'Later', value: later, color: 'bg-info' },
    { label: 'No date', value: undated, color: 'bg-muted-foreground' },
  ]
  const total = overdue + thisWeek + later + undated

  return (
    <div
      className="w-full"
      role="img"
      aria-label={`Open assignments: ${overdue} overdue, ${thisWeek} due this week, ${later} later, ${undated} without date`}
    >
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted/70" aria-hidden="true">
        {segments.filter((segment) => segment.value > 0).map((segment) => (
          <span key={segment.label} className={segment.color} style={{ width: `${segment.value / total * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-1 gap-y-1 text-[0.65rem] leading-none text-muted-foreground" aria-hidden="true">
        {segments.map((segment) => (
          <span key={segment.label} className="flex min-w-0 items-center gap-1 whitespace-nowrap">
            <span className={cn('size-1.5 shrink-0 rounded-full', segment.color)} />
            <span>{segment.label}</span>
            <span className="font-mono font-semibold text-foreground">{segment.value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function FactChart({ visual }: { visual: FactVisual }) {
  if (visual.kind === 'bars') return <WeekBars visual={visual} />
  if (visual.kind === 'habits') return <HabitRing visual={visual} />
  if (visual.kind === 'work') return <WorkComposition visual={visual} />
  return <p className="text-[0.65rem] leading-tight text-muted-foreground">{visual.message}</p>
}

export function FactGrid({ facts }: { facts: FactItem[] }) {
  const toneClass = {
    focus: 'text-accent bg-accent/10',
    habit: 'text-success bg-success/10',
    deadline: 'text-warning bg-warning/10',
    calendar: 'text-info bg-info/10',
  }

  return (
    <section className="grid h-full grid-cols-2 gap-2.5 auto-rows-fr">
      {facts.map((fact) => (
        <article key={fact.label} className="surface flex min-h-40 min-w-0 flex-col rounded-2xl p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">{fact.label}</p>
            <span className={cn('rounded-xl p-1.5 [&>svg]:size-3.5', toneClass[fact.tone])}>{fact.icon}</span>
          </div>
          <div className="my-3 flex min-h-12 flex-1 items-center">
            <FactChart visual={fact.visual} />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">{fact.value}</p>
            <p className="mt-1 text-[0.7rem] leading-tight text-muted-foreground">{fact.detail}</p>
          </div>
        </article>
      ))}
    </section>
  )
}
