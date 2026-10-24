import { useState, useEffect, useMemo, useCallback } from 'react'
import { useStore, readStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import { useToday } from '@/lib/use-today'
import { useDailyHabits } from '@/lib/use-daily-habits'
import type { Habit } from '@/lib/habits'
import { DEFAULT_HABITS } from '@/features/habits/habit-defaults'
import { useSprintTimer, type SprintSession } from '@/lib/sprint-context'
import { useNavigate } from 'react-router-dom'
import { PageShell } from '@/components/shared/PageShell'
import { FocusHero } from './components/FocusHero'
import { FactGrid } from './components/HomeFacts'
import { WeeklyRhythm } from './components/WeeklyRhythm'
import { UpNext } from './components/UpNext'
import { WeekMap } from './components/WeekMap'
import { DailyShortcuts, NeedsAttention } from './components/HomeExtras'
import { buildFacts, buildShortcutHabits, homeCalendarState } from './components/homePanelUtils'
import {
  activeHabitSummary,
  independentCalendarEvents,
  overdueAssignments,
  upNextItems,
  withLiveDaySessions,
  weekDates,
  weeklyFocusMinutes,
  type HomeCalendarEvent,
} from './home-model'
import type { Assignment, Course } from '@/features/student/student-types'
import { useWeeklyAuditAutoTrigger } from './use-weekly-audit'

// ─── PAGE ─────────────────────────────────────────────────

export function DailyPage() {
  const navigate = useNavigate()

  // Date key for daily persistence (local date, not UTC).
  // Reactive: rolls over at midnight so habit toggles land on the new day.
  const today = useToday()

  // Sprint timer — from global context (survives page navigation)
  const {
    isRunning, isPaused, timeLeft, task: timerTask, duration: timerDuration,
    sessions: sprintSessions, sessionCount, totalDeepWorkMin,
    setTask: setTimerTask, setDuration, start, pause, resume, reset: resetTimer,
  } = useSprintTimer()

  // Habits (from shared store — same as HabitsPage)
  const [habits] = useStore<Habit[]>('cortex-habits', DEFAULT_HABITS)

  // Habits — single source of truth via shared hook
  const { completedCount: habitsCompleted, isCompleted: isHabitDone, toggle: toggleHabit } = useDailyHabits(today, habits)
  const completedHabits = useMemo(
    () => Object.fromEntries(habits.map((habit) => [habit.id, isHabitDone(habit.id)])),
    [habits, isHabitDone],
  )
  const habitSummary = useMemo(
    () => activeHabitSummary(habits, completedHabits),
    [habits, completedHabits],
  )

  const [assignments] = useStore<Assignment[]>('cortex-student-assignments', [])
  const [courses] = useStore<Course[]>('cortex-student-courses', [])
  const courseNames = useMemo(
    () => new Map((courses || []).filter((course) => course?.id).map((course) => [course.id, course.name || course.id])),
    [courses],
  )

  const week = useMemo(() => weekDates(new Date(`${today}T12:00:00`)), [today])
  const [selectedDay, setSelectedDay] = useState(today)
  const [sessionsByDay, setSessionsByDay] = useState<Record<string, SprintSession[]>>({})

  // Calendar — read a seven-day range; Vite preview has no /api proxy, so
  // failed JSON reads are surfaced as source states instead of counted as zero.
  const [calendarEvents, setCalendarEvents] = useState<HomeCalendarEvent[]>([])
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarError, setCalendarError] = useState<string | null>(null)

  const fetchCalendar = useCallback(async () => {
    const startDay = week[0]
    const afterEnd = new Date(`${week[6]}T12:00:00`)
    afterEnd.setDate(afterEnd.getDate() + 1)
    const endDay = localDate(afterEnd)
    setCalendarLoading(true)
    setCalendarError(null)
    try {
      if (window.electronAPI?.calendar) {
        setCalendarEvents(await window.electronAPI.calendar.getEventsInRange(startDay, endDay))
      } else {
        const res = await fetch(`/api/calendar/events?start=${startDay}&end=${endDay}`)
        if (!res.ok) throw new Error(`Calendar returned ${res.status}`)
        const body = await res.json()
        if (!Array.isArray(body)) throw new Error('Calendar returned a non-event response')
        setCalendarEvents(body)
      }
    } catch {
      setCalendarEvents([])
      setCalendarError('Calendar could not be loaded.')
    } finally {
      setCalendarLoading(false)
    }
  }, [week])

  useEffect(() => {
    const initial = window.setTimeout(() => { void fetchCalendar() }, 0)
    const interval = setInterval(fetchCalendar, 5 * 60 * 1000) // every 5 min
    const onFocus = () => fetchCalendar()
    window.addEventListener('focus', onFocus)
    return () => { clearTimeout(initial); clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [fetchCalendar])

  useEffect(() => {
    Promise.all(week.map((date) => readStore<SprintSession[]>(`cortex-daily-sessions-${date}`, [])))
      .then((results) => {
        setSessionsByDay(Object.fromEntries(week.map((date, index) => [date, results[index] || []])))
      })
  }, [week])

  const liveSessionsByDay = useMemo(() => withLiveDaySessions(sessionsByDay, today, sprintSessions), [sessionsByDay, today, sprintSessions])
  const focusMinutes = useMemo(() => weeklyFocusMinutes(week, liveSessionsByDay), [week, liveSessionsByDay])
  const effectiveSelectedDay = week.includes(selectedDay) ? selectedDay : today
  const overdue = useMemo(() => overdueAssignments(assignments || [], new Date(`${today}T12:00:00`)), [assignments, today])
  const independentEvents = useMemo(() => independentCalendarEvents(calendarEvents, assignments || []), [calendarEvents, assignments])
  const calendarState = homeCalendarState(calendarLoading, calendarError, calendarEvents)
  const facts = buildFacts({
    focusMinutes: totalDeepWorkMin,
    focusWeekMinutes: focusMinutes,
    weekDays: week,
    today,
    habitsDone: habitSummary.done,
    habitsTotal: habitSummary.total,
    assignments: assignments || [],
    calendarState,
    calendarEvents,
  })
  const nextItems = useMemo(
    () => upNextItems({ events: independentEvents, assignments: assignments || [], courseNames, now: new Date() }),
    [independentEvents, assignments, courseNames],
  )
  const hour = new Date().getHours()
  const greeting = (() => {
    if (hour < 12) return 'Good morning, Pablo'
    if (hour < 18) return 'Good afternoon, Pablo'
    return 'Good evening, Pablo'
  })()

  // ─── Tray navigation ────────────────────────────────────
  useEffect(() => {
    if (window.electronAPI?.onNavigate) {
      window.electronAPI.onNavigate((route) => navigate(route))
    }
  }, [navigate])

  // ─── Tray stats ──────────────────────────────────────────
  // Deps matter: without them this rebuilt the full tray menu on every
  // render (i.e. every timer second).
  useEffect(() => {
    if (window.electronAPI?.tray) {
      window.electronAPI.tray.updateStats({
        tasks: `${sessionCount} sessions`,
        habits: `${habitsCompleted}/${habitSummary.total}`,
        score: '',
      })
    }
  }, [sessionCount, habitsCompleted, habitSummary.total])

  useWeeklyAuditAutoTrigger(today)

  return (
    <PageShell>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{greeting}</h1>
        <p className="text-sm font-medium text-muted-foreground">
          {new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="min-w-0 xl:order-1 xl:col-span-6 2xl:col-span-5">
          <FocusHero
            isRunning={isRunning}
            isPaused={isPaused}
            timeLeft={timeLeft}
            task={timerTask}
            duration={timerDuration}
            sessions={sprintSessions}
            sessionCount={sessionCount}
            totalMinutes={totalDeepWorkMin}
            onTaskChange={setTimerTask}
            onDurationChange={setDuration}
            onStart={start}
            onPause={pause}
            onResume={resume}
            onReset={resetTimer}
          />
        </div>

        <div className="min-w-0 xl:order-3 2xl:order-4 xl:col-span-12">
          <DailyShortcuts
            habits={buildShortcutHabits(habits, isHabitDone, toggleHabit)}
            onOpenStudent={() => navigate('/student')}
            onOpenCalendar={() => navigate('/calendar')}
          />
        </div>

        <div className="min-w-0 xl:order-2 xl:col-span-6 2xl:col-span-3">
          <FactGrid facts={facts} />
        </div>

        <div className="min-w-0 xl:order-4 2xl:order-3 xl:col-span-12 2xl:col-span-4">
          <WeeklyRhythm days={week} minutes={focusMinutes} />
        </div>

        <div className="min-w-0 xl:order-5 xl:col-span-8">
          <WeekMap
            days={week}
            today={today}
            selectedDay={effectiveSelectedDay}
            onSelectedDay={setSelectedDay}
            sessionsByDay={liveSessionsByDay}
            events={independentEvents}
            assignments={assignments || []}
            courseNames={courseNames}
            calendarState={calendarState}
            onOpenCalendar={() => navigate('/calendar')}
            onOpenStudent={() => navigate('/student')}
          />
        </div>

        <div className="min-w-0 xl:order-6 xl:col-span-4">
          <UpNext
            items={nextItems}
            calendarState={calendarState}
            calendarError={calendarError}
            onOpenCalendar={() => navigate('/calendar')}
            onOpenStudent={() => navigate('/student')}
            onRetryCalendar={fetchCalendar}
          />
        </div>
      </div>

      <NeedsAttention
        overdue={overdue}
        calendarError={calendarError}
        onOpenStudent={() => navigate('/student')}
        onRetryCalendar={fetchCalendar}
      />
    </PageShell>
  )
}
