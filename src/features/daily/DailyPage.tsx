import { useState, useEffect } from 'react'
import { useStore, readStore, writeStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import { useToday } from '@/lib/use-today'
import { useDailyHabits } from '@/lib/use-daily-habits'
import { useSprintTimer, type SprintSession } from '@/lib/sprint-context'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/shared/Skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Play, Pause, RotateCcw, RefreshCw } from 'lucide-react'

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
  const timerPresets = [15, 25, 45, 60, 90]
  const [showCustomTime, setShowCustomTime] = useState(false)
  const [customTimeInput, setCustomTimeInput] = useState('')

  // Habits (from shared store — same as HabitsPage)
  const [habits] = useStore<HabitDef[]>('cortex-habits', defaultHabits)

  // Habits — single source of truth via shared hook
  const { completedCount: habitsCompleted, isCompleted: isHabitDone, toggle: toggleHabit } = useDailyHabits(today)

  // Calendar — auto-refresh every 5 min + on window focus
  const [calendarEvents, setCalendarEvents] = useState<{ title: string; startTime: string; endTime: string; calendar: string; isAllDay: boolean }[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const isElectron = !!window.electronAPI

  const fetchCalendar = async () => {
    setCalendarLoading(true)
    try {
      if (window.electronAPI?.calendar) {
        setCalendarEvents(await window.electronAPI.calendar.getTodayEvents())
      } else {
        const res = await fetch('/api/calendar/today')
        if (res.ok) setCalendarEvents(await res.json())
      }
    } catch { /* silent */ }
    finally { setCalendarLoading(false) }
  }

  useEffect(() => {
    fetchCalendar()
    const interval = setInterval(fetchCalendar, 5 * 60 * 1000) // every 5 min
    const onFocus = () => fetchCalendar()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [])

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60

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
          storedHabits.filter(h => ((h as any).cadence ?? 'weekly') !== 'monthly').map(h => h.id)
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
      {/* ─── DATE KICKER ────────────────────────────────── */}
      <p className="font-mono text-2xs uppercase tracking-widest text-muted-foreground">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      {/* ─── SPRINT TIMER ───────────────────────────────── */}
      <WidgetCard title="Sprint" description={`${sessionCount} sessions · ${Math.floor(totalDeepWorkMin / 60)}h ${totalDeepWorkMin % 60}m deep work`} delay={0.05}>
        <div className="flex flex-col gap-4">
          <Input
            value={timerTask}
            onChange={(e) => setTimerTask(e.target.value)}
            placeholder="What are you working on?"
            className="h-9"
          />
          <div className="flex items-center justify-between">
            <span className={cn(
              'font-mono text-4xl font-medium tabular-nums tracking-tight md:text-5xl',
              isRunning ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
            <div className="flex gap-2">
              <Button
                size="icon-lg"
                aria-label={isRunning ? 'Pause sprint' : 'Start sprint'}
                onClick={() => {
                  if (isRunning) {
                    pause()
                  } else if (isPaused) {
                    resume()
                  } else {
                    start()
                  }
                }}
              >
                {isRunning ? <Pause /> : <Play className="ml-0.5" />}
              </Button>
              <Button variant="secondary" size="icon-lg" aria-label="Reset sprint" onClick={resetTimer}>
                <RotateCcw />
              </Button>
            </div>
          </div>
          {/* Duration presets */}
          <div className="flex gap-1.5">
            {timerPresets.map((m) => (
              <Button
                key={m}
                size="xs"
                variant={timerDuration === m && !showCustomTime ? 'default' : 'secondary'}
                disabled={isRunning || isPaused}
                className="flex-1 font-mono"
                onClick={() => { setDuration(m); setShowCustomTime(false) }}
              >
                {m}m
              </Button>
            ))}
            <Button
              size="xs"
              variant={showCustomTime || !timerPresets.includes(timerDuration) ? 'default' : 'secondary'}
              disabled={isRunning || isPaused}
              className="flex-1 font-mono"
              onClick={() => setShowCustomTime(!showCustomTime)}
            >
              {!timerPresets.includes(timerDuration) ? `${timerDuration}m` : '...'}
            </Button>
          </div>
          {showCustomTime && (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                max={240}
                value={customTimeInput}
                onChange={(e) => setCustomTimeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseInt(customTimeInput)
                    if (val > 0 && val <= 240) { setDuration(val); setShowCustomTime(false) }
                  }
                }}
                placeholder="minutes"
                className="h-7 flex-1 text-xs"
                autoFocus
              />
              <Button
                size="sm"
                onClick={() => {
                  const val = parseInt(customTimeInput)
                  if (val > 0 && val <= 240) { setDuration(val); setShowCustomTime(false) }
                }}
              >
                Set
              </Button>
            </div>
          )}
          {/* Session history */}
          {sprintSessions.length > 0 && (
            <div className="mt-1 border-t border-border/60 pt-3">
              <p className="mb-1.5 font-mono text-2xs text-foreground-faint">{sprintSessions.length} session{sprintSessions.length !== 1 ? 's' : ''} today</p>
              <div className="flex max-h-24 flex-col gap-1 overflow-y-auto">
                {[...sprintSessions].reverse().map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="shrink-0 font-mono text-2xs tabular-nums text-foreground-faint">
                      {new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="truncate text-muted-foreground">{s.task}</span>
                    <span className="ml-auto shrink-0 font-mono text-2xs tabular-nums text-foreground-faint">{s.duration}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </WidgetCard>

      {/* ─── SCHEDULE + HABITS ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Schedule */}
        <WidgetCard
          title="Schedule"
          description={isElectron ? `${calendarEvents.length} events` : '—'}
          delay={0.15}
          compact
        >
          {isElectron && calendarLoading && calendarEvents.length === 0 ? (
            <div className="flex flex-col gap-2 py-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : isElectron && calendarEvents.length > 0 ? (
            <div className="flex max-h-36 flex-col gap-0.5 overflow-y-auto">
              {calendarEvents.map((evt, i) => {
                const isClass = evt.calendar === 'Classes (Cortex)' || evt.title.startsWith('Class:')
                return (
                  <div key={`${evt.title}-${i}`} className="flex items-center gap-2 py-1">
                    <span className="w-10 shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
                      {evt.isAllDay ? 'ALL' : evt.startTime}
                    </span>
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', isClass ? 'bg-accent' : 'bg-muted-foreground/25')} />
                    <span className="truncate text-xs">{isClass ? evt.title.replace(/^Class:\s*/, '') : evt.title}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState
              className="py-3"
              message={isElectron ? 'Clear calendar today.' : 'Calendar lives in the desktop app.'}
              action={isElectron ? (
                <Button variant="ghost" size="sm" onClick={fetchCalendar} disabled={calendarLoading}>
                  <RefreshCw />
                  Refresh
                </Button>
              ) : undefined}
            />
          )}
        </WidgetCard>

        {/* Compact Habits */}
        <WidgetCard title="Habits" description={`${habitsCompleted}/${habits.length}`} delay={0.2} compact>
          <div className="flex items-center justify-between">
            {habits.map((h) => (
              <Button
                key={h.id}
                variant="ghost"
                size="icon-lg"
                onClick={() => toggleHabit(h.id)}
                aria-pressed={isHabitDone(h.id)}
                aria-label={h.name}
                className={cn(
                  'size-10 rounded-full text-base',
                  isHabitDone(h.id)
                    ? 'border-success/25 bg-success/10'
                    : 'bg-secondary/80 opacity-40 hover:opacity-70'
                )}
              >
                {h.emoji}
              </Button>
            ))}
          </div>
        </WidgetCard>
      </div>

      {/* ─── TODAY STATS ────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Sessions" value={sessionCount} />
        <StatTile
          label="Deep work"
          value={totalDeepWorkMin >= 60 ? `${Math.floor(totalDeepWorkMin / 60)}h${totalDeepWorkMin % 60 > 0 ? `${totalDeepWorkMin % 60}m` : ''}` : `${totalDeepWorkMin}m`}
        />
        <StatTile label="Habits" value={`${habitsCompleted}/${habits.length}`} />
      </div>
    </PageShell>
  )
}
