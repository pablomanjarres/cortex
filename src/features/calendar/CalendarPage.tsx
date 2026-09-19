import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  addDays,
  formatLocalDate,
  groupCalendarDays,
  parseEventEnd,
  parseEventStart,
  weekDates,
  type CalendarDayGroup,
  type CalendarEventLike,
} from './calendar-model'

type CalendarEventFull = CalendarEventLike & { id: string; endDate: string; notes: string; lastModified: string; recurrence: string }
type LoadState = 'loading' | 'ready' | 'empty' | 'error'
type ViewMode = 'week' | 'day'

const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const weekFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const eventKey = (event: CalendarEventLike) => event.id || `${event.title}-${event.startDate}`
const dateLabel = (date: string) => dayFmt.format(new Date(`${date}T12:00:00`))

function timeLabel(event: CalendarEventLike) {
  if (event.isAllDay) return 'All day'
  const start = parseEventStart(event)
  const end = parseEventEnd(event)
  if (!start) return 'Time unavailable'
  return end ? `${timeFmt.format(start)} - ${timeFmt.format(end)}` : timeFmt.format(start)
}

async function loadCalendarEvents(start: string, end: string): Promise<CalendarEventFull[]> {
  if (window.electronAPI?.calendar) return window.electronAPI.calendar.getEventsInRange(start, end)
  const res = await fetch(`/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
  if (!res.ok) throw new Error(`Calendar returned ${res.status}`)
  if (!(res.headers.get('content-type') || '').includes('application/json')) throw new Error('Calendar returned a non-JSON response')
  const body = await res.json()
  if (!Array.isArray(body)) throw new Error('Calendar returned a non-event response')
  return body
}

function EventRow({ event, compact = false }: { event: CalendarEventLike; compact?: boolean }) {
  return (
    <article className={cn('rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm', !compact && 'border-l-4 border-l-accent')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{event.title || 'Untitled event'}</h3>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{timeLabel(event)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">{event.calendar || 'Calendar'}</span>
      </div>
    </article>
  )
}

function EventSection({ title, events, empty, compact = false }: { title: string; events: CalendarEventFull[]; empty: string; compact?: boolean }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="mt-2 grid gap-2">
        {events.length ? events.map((event) => <EventRow key={eventKey(event)} event={event} compact={compact} />) : (
          <p className="rounded-2xl bg-secondary/50 p-3 text-sm text-muted-foreground">{empty}</p>
        )}
      </div>
    </div>
  )
}

function DayAgenda({ group, state, error, onRetry }: { group: CalendarDayGroup<CalendarEventFull>; state: LoadState; error: string | null; onRetry: () => void }) {
  const count = group.allDay.length + group.timed.length
  const badge = state === 'loading' ? 'Loading' : state === 'error' ? 'Retry' : state === 'empty' ? 'Check access' : `${count} ${count === 1 ? 'event' : 'events'}`
  return (
    <section className={cn('surface-strong flex min-w-0 flex-col rounded-3xl p-5', state === 'ready' ? 'min-h-[420px]' : 'min-h-[260px]')}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">Selected day</p><h2 className="text-2xl font-semibold tracking-normal text-foreground">{dateLabel(group.date)}</h2></div>
        <span className="rounded-full bg-progress-surface px-3 py-1 text-sm font-semibold text-foreground">{badge}</span>
      </div>
      {state === 'loading' && <div className="mt-6 grid gap-3" aria-live="polite"><div className="skeleton h-16 rounded-2xl" /><div className="skeleton h-20 rounded-2xl" /></div>}
      {state === 'error' && <SourceMessage title="Calendar could not be loaded." body={error || 'Retry after the Calendar service is available.'} onRetry={onRetry} />}
      {state === 'empty' && <SourceMessage title="No events returned." body="This can mean a quiet range, missing Calendar access, or a helper failure. Check Calendar access if events were expected." />}
      {state === 'ready' && (
        <div className="mt-6 grid gap-5">
          <EventSection title="All-day" events={group.allDay} compact empty="No all-day events." />
          <EventSection title="Timed" events={group.timed} empty="No timed events." />
        </div>
      )}
    </section>
  )
}

function SourceMessage({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card/70 p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {onRetry && <Button className="mt-4" variant="secondary" size="sm" onClick={onRetry}><RefreshCw className="size-4" /> Retry</Button>}
    </div>
  )
}

export function CalendarPage() {
  const [anchor, setAnchor] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => formatLocalDate(new Date()))
  const [view, setView] = useState<ViewMode>('week')
  const [events, setEvents] = useState<CalendarEventFull[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const week = useMemo(() => weekDates(anchor), [anchor])
  const groups = useMemo(() => groupCalendarDays(events, week), [events, week])
  const selectedGroup = groups.find((group) => group.date === selectedDay) || groups[0]

  const fetchEvents = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const loaded = await loadCalendarEvents(week[0], addDays(week[6], 1))
      setEvents(loaded)
      setState(loaded.length === 0 ? 'empty' : 'ready')
    } catch (err) {
      setEvents([])
      setState('error')
      setError(err instanceof Error ? err.message : 'Calendar returned an unreadable response.')
    }
  }, [week])

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchEvents() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchEvents])

  const moveWeek = (days: number) => {
    const next = new Date(anchor)
    next.setDate(anchor.getDate() + days)
    setAnchor(next)
    setSelectedDay(addDays(selectedDay, days))
  }
  const goToday = () => {
    const today = new Date()
    setAnchor(today)
    setSelectedDay(formatLocalDate(today))
  }

  return (
    <PageShell>
      <section className="surface flex flex-col gap-4 rounded-3xl p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-focus-surface text-accent"><CalendarDays className="size-5" /></span>
          <div><p className="text-sm text-muted-foreground">Read-only Apple Calendar</p><h1 className="text-2xl font-semibold tracking-normal text-foreground">{dateLabel(week[0])} - {dateLabel(week[6])}</h1></div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:justify-start lg:w-auto lg:flex-nowrap">
          {(['week', 'day'] as const).map((mode) => <Button key={mode} variant={view === mode ? 'default' : 'secondary'} size="sm" onClick={() => setView(mode)} aria-pressed={view === mode}>{mode === 'week' ? 'Week' : 'Day'}</Button>)}
          <Button variant="secondary" size="icon-sm" aria-label="Previous week" onClick={() => moveWeek(-7)}><ChevronLeft /></Button>
          <Button variant="secondary" size="sm" onClick={goToday}>Today</Button>
          <Button variant="secondary" size="icon-sm" aria-label="Next week" onClick={() => moveWeek(7)}><ChevronRight /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Retry Calendar load" onClick={fetchEvents}><RefreshCw /></Button>
        </div>
      </section>
      <div className={cn('grid min-w-0 gap-5', view === 'week' ? 'xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]' : 'xl:grid-cols-[minmax(0,1fr)_220px]')}>
        <section className={cn('surface min-w-0 overflow-hidden rounded-3xl p-4', view === 'day' && 'order-2 xl:order-2')}>
          <div className={cn(
            'grid grid-flow-col auto-cols-[4rem] gap-3 overflow-x-auto pb-1',
            view === 'week' ? 'md:grid-flow-row md:auto-cols-auto md:grid-cols-7 md:overflow-visible xl:grid-cols-1' : 'xl:grid-flow-row xl:auto-cols-auto xl:grid-cols-1 xl:overflow-visible',
          )}>
            {groups.map((group) => <WeekDayButton key={group.date} group={group} selected={group.date === selectedGroup.date} today={group.date === formatLocalDate(new Date())} state={state} compact={view === 'day'} onSelect={() => setSelectedDay(group.date)} />)}
          </div>
        </section>
        <div className={cn('min-w-0', view === 'day' && 'order-1 xl:order-1')}><DayAgenda group={selectedGroup} state={state} error={error} onRetry={fetchEvents} /></div>
      </div>
    </PageShell>
  )
}

function WeekDayButton({ group, selected, today, state, compact, onSelect }: { group: CalendarDayGroup<CalendarEventFull>; selected: boolean; today: boolean; state: LoadState; compact: boolean; onSelect: () => void }) {
  const total = group.allDay.length + group.timed.length
  const summary = state === 'loading' ? 'Loading' : state === 'ready' ? (total ? `${total} ${total === 1 ? 'event' : 'events'}` : 'No events') : 'Check source'
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`${weekFmt.format(new Date(`${group.date}T12:00:00`))} ${group.date.slice(8)} ${summary}`} className={cn(
      'rounded-2xl border p-3 text-left outline-none transition focus-visible:outline-2 focus-visible:outline-ring',
      compact ? 'min-h-16' : 'min-h-16 md:min-h-24',
      selected ? 'border-accent bg-focus-surface text-foreground shadow-card ring-2 ring-progress-surface' : 'border-border bg-card/70 hover:bg-secondary/60',
      today && !selected && 'ring-2 ring-progress-surface',
    )}>
      <div className="flex flex-col gap-0 md:flex-row md:items-center md:justify-between md:gap-2"><span className="font-semibold">{weekFmt.format(new Date(`${group.date}T12:00:00`))}</span><span className="font-mono text-xs text-muted-foreground">{group.date.slice(8)}</span></div>
      <p className={cn('mt-2 text-sm text-muted-foreground', compact ? 'sr-only' : 'sr-only md:not-sr-only')}>{summary}</p>
      <span className={cn('mt-2 block h-1.5 w-8 rounded-full md:hidden', compact && 'xl:block', selected || today ? 'bg-progress-surface' : 'bg-secondary')} aria-hidden="true" />
      {!compact && state === 'ready' && group.timed.slice(0, 2).map((event) => <p key={eventKey(event)} className="mt-1 truncate text-xs text-foreground">{event.title}</p>)}
    </button>
  )
}
