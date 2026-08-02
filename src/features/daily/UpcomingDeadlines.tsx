import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import type { Assignment, Course } from '@/features/student/student-types'

/** How far ahead the widget looks. Overdue work always shows, regardless. */
const WINDOW_DAYS = 14
const MAX_ROWS = 6

/** Whole days from today to the deadline. Negative once overdue. */
function daysUntil(todayISO: string, deadlineISO: string): number {
  // Both parsed at local midnight so DST can't round a day away.
  const from = Date.parse(`${todayISO}T00:00:00`)
  const to = Date.parse(`${String(deadlineISO).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(from) || Number.isNaN(to)) return NaN
  return Math.round((to - from) / 86_400_000)
}

function countdown(days: number): string {
  if (days < 0) return `${-days}d late`
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  return `${days} days`
}

/** Overdue and day-of read as danger; the 3-day threshold is the warning line. */
function urgencyClass(days: number): string {
  if (days <= 0) return 'text-destructive'
  if (days <= 3) return 'text-warning'
  return 'text-muted-foreground'
}

export function UpcomingDeadlines() {
  const navigate = useNavigate()
  const [assignments] = useStore<Assignment[]>('cortex-student-assignments', [])
  const [courses] = useStore<Course[]>('cortex-student-courses', [])

  const rows = useMemo(() => {
    const today = localDate()
    const names = new Map((courses || []).filter((c) => c?.id).map((c) => [c.id, c.name || c.id]))
    return (assignments || [])
      .filter((a) => a?.id && a.deadline && !a.done)
      .map((a) => ({
        id: a.id,
        name: a.name || 'Untitled',
        type: a.type,
        course: names.get(a.courseId) || a.courseId || '—',
        left: daysUntil(today, a.deadline as string),
      }))
      .filter((r) => Number.isFinite(r.left) && r.left <= WINDOW_DAYS)
      .sort((x, y) => x.left - y.left || x.name.localeCompare(y.name))
  }, [assignments, courses])

  const overdue = rows.filter((r) => r.left < 0).length
  const urgent = rows.some((r) => r.left <= 0)
  const description = rows.length === 0
    ? 'clear'
    : overdue > 0
      ? `${overdue} overdue · ${rows.length} total`
      : `${rows.length} in ${WINDOW_DAYS}d`

  return (
    <WidgetCard
      title="Upcoming deadlines"
      description={description}
      delay={0.25}
      variant={urgent ? 'urgent' : 'default'}
      compact
    >
      {rows.length === 0 ? (
        <EmptyState className="py-3" message="Nothing due in the next two weeks." />
      ) : (
        <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
          {rows.slice(0, MAX_ROWS).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate('/student')}
              className="flex w-full items-center gap-2 rounded py-1 text-left hover:bg-secondary/60"
            >
              <span className={cn('w-14 shrink-0 font-mono text-2xs tabular-nums', urgencyClass(r.left))}>
                {countdown(r.left)}
              </span>
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  r.left <= 0 ? 'bg-destructive' : r.left <= 3 ? 'bg-warning' : 'bg-muted-foreground/25'
                )}
              />
              <span className="truncate text-xs">{r.name}</span>
              <span className="ml-auto shrink-0 truncate pl-2 text-2xs text-muted-foreground">{r.course}</span>
            </button>
          ))}
          {rows.length > MAX_ROWS && (
            <button
              type="button"
              onClick={() => navigate('/student')}
              className="py-1 text-left text-2xs text-muted-foreground hover:text-foreground"
            >
              +{rows.length - MAX_ROWS} more
            </button>
          )}
        </div>
      )}
    </WidgetCard>
  )
}
