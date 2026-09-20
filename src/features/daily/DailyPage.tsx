import { useState, useEffect, useMemo, useCallback } from 'react'
import { useStore, readStore, writeStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import { useToday } from '@/lib/use-today'
import { useDailyHabits } from '@/lib/use-daily-habits'
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

// ─── FOUNDER HISTORY ──────────────────────────────────────

interface HistoryEntry {
  date: string
  commits: number
  users: number
  deploys: number
  mrr: number
  prsOpen: number
  prsMerged: number
}

// ─── HABITS (read from same store as HabitsPage) ─────────

interface HabitDef {
  id: string
  name: string
  emoji: string
  onHold?: boolean
  cadence?: 'weekly' | 'monthly'
}

const defaultHabits: HabitDef[] = [
  { id: '1', name: 'Workout', emoji: '💪' },
  { id: '2', name: 'Read 30min', emoji: '📖' },
  { id: '3', name: 'Meditate', emoji: '🧘' },
  { id: '4', name: 'Journal', emoji: '✍️' },
  { id: '5', name: 'No social media before noon', emoji: '📵' },
  { id: '6', name: 'Drink 2L water', emoji: '💧' },
  { id: '7', name: 'Sleep by 11pm', emoji: '🌙' },
]

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
  const [habits] = useStore<HabitDef[]>('cortex-habits', defaultHabits)

  // Habits — single source of truth via shared hook
  const { completedCount: habitsCompleted, isCompleted: isHabitDone, toggle: toggleHabit } = useDailyHabits(today)
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
        habits: `${habitsCompleted}/${habits.length}`,
        score: '',
      })
    }
  }, [sessionCount, habitsCompleted, habits.length])

  // ─── Weekly Audit Auto-Trigger ───────────────────────────
  // Keyed to the reactive day so it re-checks after a midnight rollover
  // (Sunday -> Monday while the app stays open). The existing-audit guard
  // below prevents double-writing.
  useEffect(() => {
    const now = new Date(today + 'T00:00:00')
    if (now.getDay() !== 1) return // Only on Mondays

    const lastMonday = new Date(now)
    lastMonday.setDate(lastMonday.getDate() - 7)

    // Get ISO week number
    const d = new Date(lastMonday)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
    const week1 = new Date(d.getFullYear(), 0, 4)
    const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
    const weekId = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`

    readStore(`cortex-weekly-audit-${weekId}`, null).then((existing) => {
      if (existing) return // Already generated

      // Generate audit for last week
      const weekDates: string[] = []
      for (let i = 0; i < 7; i++) {
        const wd = new Date(lastMonday)
        wd.setDate(wd.getDate() + i)
        weekDates.push(localDate(wd))
      }

      Promise.all([
        ...weekDates.map(date => readStore<SprintSession[]>(`cortex-daily-sessions-${date}`, [])),
        readStore<Record<string, Record<string, boolean>>>('cortex-habits-history', {}),
        readStore<HistoryEntry[]>('cortex-founder-history', []),
        // Read habits fresh from the store — the `habits` hook value can still
        // be the synchronous fallback (phantom ids '1'..'7') when this effect
        // runs, which would score consistency against habits that don't exist.
        readStore<HabitDef[]>('cortex-habits', defaultHabits),
      ]).then((results) => {
        const sessionsByDay = results.slice(0, 7) as SprintSession[][]
        const habitHistory = results[7] as Record<string, Record<string, boolean>>
        const founderHistory = results[8] as HistoryEntry[]
        const storedHabits = results[9] as HabitDef[]

        const allSessions = sessionsByDay.flat()
        const totalSessions = allSessions.length
        const totalDeepWork = allSessions.reduce((s, x) => s + x.duration, 0)

        const dayCounts = sessionsByDay.map((s, i) => ({ date: weekDates[i], sessions: s.length }))
        const bestDay = dayCounts.reduce((best, dc) => dc.sessions > best.sessions ? dc : best, { date: '', sessions: 0 })

        // Habit stats — weekly cadence only (monthly habits are scored over the month)
        const weeklyHabitIds = new Set(
          storedHabits.filter(h => (h.cadence ?? 'weekly') !== 'monthly').map(h => h.id)
        )
        const weekHabits = weekDates.map(wd => habitHistory[wd] || {})
        const totalHabitChecks = weekHabits.reduce(
          (s, day) => s + Object.keys(day).filter(id => day[id] && weeklyHabitIds.has(id)).length,
          0
        )
        const totalHabitPossible = weeklyHabitIds.size * 7
        const habitConsistency = totalHabitPossible > 0 ? Math.round((totalHabitChecks / totalHabitPossible) * 100) : 0

        // Founder stats for the week
        const weekFounder = founderHistory.filter(h => weekDates.includes(h.date))
        const totalCommits = weekFounder.reduce((s, h) => s + h.commits, 0)
        const totalDeploys = weekFounder.reduce((s, h) => s + h.deploys, 0)
        const lastUsers = weekFounder.length > 0 ? weekFounder[weekFounder.length - 1].users : 0
        const lastMrr = weekFounder.length > 0 ? weekFounder[weekFounder.length - 1].mrr : 0

        const audit = {
          weekId,
          weekStart: weekDates[0],
          weekEnd: weekDates[6],
          sprintStats: { totalSessions, totalDeepWork, avgPerDay: Math.round(totalSessions / 7 * 10) / 10, bestDay },
          habitStats: { consistency: habitConsistency },
          founderStats: { commits: totalCommits, users: lastUsers, mrr: lastMrr, deploys: totalDeploys },
          generatedAt: new Date().toISOString(),
        }

        writeStore(`cortex-weekly-audit-${weekId}`, audit)
      })
    })
  }, [today])

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
