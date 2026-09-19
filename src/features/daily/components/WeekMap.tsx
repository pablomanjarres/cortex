import { CalendarDays } from 'lucide-react'
import { Skeleton } from '@/components/shared/Skeleton'
import { cn } from '@/lib/utils'
import type { SprintSession } from '@/lib/sprint-context'
import type { Assignment } from '@/features/student/student-types'
import type { HomeCalendarEvent } from '../home-model'
import type { CalendarState } from './homePanelUtils'
import { assignmentDay, dayName, dayNumber, eventOverlapsDay, formatMinutes, weekRangeLabel } from './homePanelUtils'

export function WeekMap({
  days,
  today,
  selectedDay,
  onSelectedDay,
  sessionsByDay,
  events,
  assignments,
  courseNames,
  calendarState,
  onOpenCalendar,
  onOpenStudent,
}: {
  days: string[]
  today: string
  selectedDay: string
  onSelectedDay: (day: string) => void
  sessionsByDay: Record<string, SprintSession[]>
  events: HomeCalendarEvent[]
  assignments: Assignment[]
  courseNames: Map<string, string>
  calendarState: CalendarState
  onOpenCalendar: () => void
  onOpenStudent: () => void
}) {
  const selectedEvents = events.filter((event) => eventOverlapsDay(event, selectedDay))
  const selectedSessions = sessionsByDay[selectedDay] ?? []
  const selectedDeadlines = assignments.filter((assignment) => assignmentDay(assignment) === selectedDay && !assignment.done)

  return (
    <section className="surface rounded-[1.75rem] p-4 shadow-card md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-5 text-accent" />
          <h2 className="text-lg font-semibold text-foreground">Week map</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {weekRangeLabel(days)}
        </p>
      </div>
      {(calendarState === 'error' || calendarState === 'ambiguous') && (
        <p className="mb-3 rounded-2xl border border-info/20 bg-info/10 px-3 py-2 text-xs text-muted-foreground">
          {calendarState === 'error'
            ? 'Calendar could not be loaded, so this map is showing known focus sessions and deadlines only.'
            : 'Calendar returned no events. Retry before treating the week as clear.'}
        </p>
      )}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="grid min-w-[44rem] grid-cols-7 gap-2 md:min-w-0">
          {days.map((day) => {
            const dayEvents = events.filter((event) => eventOverlapsDay(event, day))
            const daySessions = sessionsByDay[day] ?? []
            const dayDeadlines = assignments.filter((assignment) => assignmentDay(assignment) === day && !assignment.done)
            const selected = day === selectedDay
            return (
              <button
                key={day}
                type="button"
                onClick={() => onSelectedDay(day)}
                aria-current={day === today ? 'date' : undefined}
                aria-pressed={selected}
                className={cn(
                  'min-h-44 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                  selected ? 'border-accent bg-accent/10' : 'border-border bg-card/60 hover:bg-secondary/60',
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{dayName(day)}</p>
                    <p className="font-mono text-lg font-semibold text-foreground">{dayNumber(day)}</p>
                  </div>
                  <div className="flex gap-1">
                    {dayEvents.length > 0 && <span className="size-2 rounded-full bg-info" />}
                    {daySessions.length > 0 && <span className="size-2 rounded-full bg-accent" />}
                    {dayDeadlines.length > 0 && <span className="size-2 rounded-full bg-warning" />}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {daySessions.slice(0, 1).map((session) => (
                    <div key={session.id} className="rounded-lg bg-accent/15 px-2 py-1 text-xs text-foreground">
                      {formatMinutes(session.duration)} focus
                    </div>
                  ))}
                  {dayEvents.slice(0, 2).map((event) => (
                    <div key={event.id || `${event.title}-${event.startDate}`} className="rounded-lg bg-info/10 px-2 py-1 text-xs text-foreground">
                      {event.title}
                    </div>
                  ))}
                  {dayDeadlines.slice(0, 1).map((assignment) => (
                    <div key={assignment.id} className="rounded-lg bg-warning/10 px-2 py-1 text-xs text-foreground">
                      {assignment.name}
                    </div>
                  ))}
                  {dayEvents.length + daySessions.length + dayDeadlines.length === 0 && (
                    <p className="pt-8 text-center text-xs text-muted-foreground">
                      No focus/deadlines
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-secondary/45 p-3">
        <p className="mb-2 text-sm font-semibold text-foreground">
          <span className="sr-only">Selected day: </span>
          {new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </p>
        {calendarState === 'loading' && selectedEvents.length === 0 ? (
          <Skeleton className="h-10 w-full" />
        ) : selectedEvents.length + selectedSessions.length + selectedDeadlines.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-3">
            {selectedEvents.map((event) => (
              <button key={event.id || `${event.title}-${event.startDate}`} type="button" onClick={onOpenCalendar} className="rounded-xl bg-card p-3 text-left text-sm hover:bg-secondary/70">
                <span className="block font-semibold text-foreground">{event.title}</span>
                <span className="text-xs text-muted-foreground">{event.calendar}</span>
              </button>
            ))}
            {selectedSessions.map((session) => (
              <div key={session.id} className="rounded-xl bg-card p-3 text-sm">
                <span className="block font-semibold text-foreground">{session.task || 'Focus session'}</span>
                <span className="text-xs text-muted-foreground">{formatMinutes(session.duration)} completed</span>
              </div>
            ))}
            {selectedDeadlines.map((assignment) => (
              <button key={assignment.id} type="button" onClick={onOpenStudent} className="rounded-xl bg-card p-3 text-left text-sm hover:bg-secondary/70">
                <span className="block font-semibold text-foreground">{assignment.name}</span>
                <span className="text-xs text-muted-foreground">{courseNames.get(assignment.courseId) || assignment.courseId || 'Student'}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing source-backed on this day yet.</p>
        )}
      </div>
    </section>
  )
}
