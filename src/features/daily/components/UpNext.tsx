import { ChevronRight, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/shared/Skeleton'
import { cn } from '@/lib/utils'
import type { UpNextItem } from '../home-model'
import type { CalendarState } from './homePanelUtils'
import { dueDateLabel, shortTime } from './homePanelUtils'

export function UpNext({
  items,
  calendarState,
  calendarError,
  onOpenCalendar,
  onOpenStudent,
  onRetryCalendar,
}: {
  items: UpNextItem[]
  calendarState: CalendarState
  calendarError: string | null
  onOpenCalendar: () => void
  onOpenStudent: () => void
  onRetryCalendar: () => void
}) {
  const emptyMessage = calendarError
    || (calendarState === 'error'
      ? 'Calendar could not be loaded.'
      : calendarState === 'ambiguous'
        ? 'Calendar returned no events. Retry before treating the week as clear.'
        : 'No events or deadlines ahead this week.')

  return (
    <section className="surface rounded-[1.75rem] p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock3 className="size-5 text-accent" />
          <h2 className="text-lg font-semibold text-foreground">Up next</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onOpenCalendar}>
          See all
          <ChevronRight />
        </Button>
      </div>
      {calendarState === 'loading' && items.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-5/6" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-2">
          {items.slice(0, 8).map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={item.kind === 'event' ? onOpenCalendar : onOpenStudent}
              className="group flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-secondary/70 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className={cn('size-2.5 shrink-0 rounded-full', item.kind === 'event' ? 'bg-info' : 'bg-warning')} />
              <span className="w-24 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {item.kind === 'deadline' ? dueDateLabel(item.assignment.deadline!) : item.isAllDay ? 'All day' : shortTime(item.startsAt)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.source}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          className="py-6"
          message={emptyMessage}
          action={calendarState === 'error' || calendarState === 'ambiguous' ? (
            <Button variant="secondary" size="sm" onClick={onRetryCalendar}>Retry calendar</Button>
          ) : undefined}
        />
      )}
    </section>
  )
}
