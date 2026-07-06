import { useState, useEffect } from 'react'
import { useStore, readStore, writeStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import { useDailyHabits } from '@/lib/use-daily-habits'
import { useSprintTimer, type SprintSession } from '@/lib/sprint-context'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import {
  Play,
  Pause,
  RotateCcw,
  Calendar,
  RefreshCw,
} from 'lucide-react'

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

  // Date key for daily persistence (local date, not UTC)
  const today = localDate()

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
  useEffect(() => {
    if (window.electronAPI?.tray) {
      window.electronAPI.tray.updateStats({
        tasks: `${sessionCount} sessions`,
        habits: `${habitsCompleted}/${habits.length}`,
        score: '',
      })
    }
  })

  // ─── Weekly Audit Auto-Trigger ───────────────────────────
  useEffect(() => {
    const now = new Date()
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
      ]).then((results) => {
        const sessionsByDay = results.slice(0, 7) as SprintSession[][]
        const habitHistory = results[7] as Record<string, Record<string, boolean>>
        const founderHistory = results[8] as HistoryEntry[]

        const allSessions = sessionsByDay.flat()
        const totalSessions = allSessions.length
        const totalDeepWork = allSessions.reduce((s, x) => s + x.duration, 0)

        const dayCounts = sessionsByDay.map((s, i) => ({ date: weekDates[i], sessions: s.length }))
        const bestDay = dayCounts.reduce((best, dc) => dc.sessions > best.sessions ? dc : best, { date: '', sessions: 0 })

        // Habit stats — weekly cadence only (monthly habits are scored over the month)
        const weeklyHabitIds = new Set(
          habits.filter(h => ((h as any).cadence ?? 'weekly') !== 'monthly').map(h => h.id)
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
  }, [])

  return (
    <PageShell>
      {/* ─── HEADER ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </motion.div>

      {/* ─── SPRINT TIMER ───────────────────────────────── */}
      <WidgetCard title="SPRINT" description={`${sessionCount} sessions · ${Math.floor(totalDeepWorkMin / 60)}h ${totalDeepWorkMin % 60}m deep work`} delay={0.05}>
        <div className="flex flex-col gap-4">
          <Input
            value={timerTask}
            onChange={(e) => setTimerTask(e.target.value)}
            placeholder="What are you working on?"
            className="h-9 bg-input text-sm font-medium"
          />
          <div className="flex items-center justify-between">
            <span className={`font-mono text-4xl md:text-5xl font-bold tabular-nums tracking-tight ${isRunning ? 'text-foreground' : 'text-muted-foreground'}`}>
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (isRunning) {
                    pause()
                  } else if (isPaused) {
                    resume()
                  } else {
                    start()
                  }
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-80"
              >
                {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
              </button>
              <button
                onClick={resetTimer}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* Duration presets */}
          <div className="flex gap-1.5">
            {timerPresets.map((m) => (
              <button
                key={m}
                onClick={() => { setDuration(m); setShowCustomTime(false) }}
                disabled={isRunning || isPaused}
                className={`flex-1 rounded-md py-1 text-xs font-medium transition-all ${
                  timerDuration === m && !showCustomTime
                    ? 'bg-foreground text-background'
                    : 'bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30'
                }`}
              >
                {m}m
              </button>
            ))}
            <button
              onClick={() => setShowCustomTime(!showCustomTime)}
              disabled={isRunning || isPaused}
              className={`flex-1 rounded-md py-1 text-xs font-medium transition-all ${
                showCustomTime || !timerPresets.includes(timerDuration)
                  ? 'bg-foreground text-background'
                  : 'bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30'
              }`}
            >
              {!timerPresets.includes(timerDuration) ? `${timerDuration}m` : '...'}
            </button>
          </div>
          {showCustomTime && (
            <div className="flex gap-1.5 items-center">
              <input
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
                className="flex-1 h-7 rounded-md bg-input px-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <button
                onClick={() => {
                  const val = parseInt(customTimeInput)
                  if (val > 0 && val <= 240) { setDuration(val); setShowCustomTime(false) }
                }}
                className="h-7 rounded-md bg-foreground px-3 text-xs font-medium text-background"
              >
                Set
              </button>
            </div>
          )}
          {/* Session history */}
          {sprintSessions.length > 0 && (
            <div className="border-t border-border/30 pt-3 mt-1">
              <p className="text-[10px] text-muted-foreground/60 mb-1.5">{sprintSessions.length} session{sprintSessions.length !== 1 ? 's' : ''} today</p>
              <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                {[...sprintSessions].reverse().map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground/50 font-mono tabular-nums shrink-0">
                      {new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="truncate text-muted-foreground">{s.task}</span>
                    <span className="ml-auto text-muted-foreground/50 shrink-0">{s.duration}m</span>
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
          title="SCHEDULE"
          description={isElectron ? `${calendarEvents.length} events` : '—'}
          delay={0.15}
          compact
        >
          {isElectron && calendarEvents.length > 0 ? (
            <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto">
              {calendarEvents.map((evt, i) => {
                const isClass = evt.calendar === 'Classes (Cortex)' || evt.title.startsWith('Class:')
                return (
                  <div key={`${evt.title}-${i}`} className="flex items-center gap-2 py-1">
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground w-10 shrink-0">
                      {evt.isAllDay ? 'ALL' : evt.startTime}
                    </span>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isClass ? 'bg-purple-400' : 'bg-muted-foreground/25'}`} />
                    <span className="text-xs truncate">{isClass ? evt.title.replace(/^Class:\s*/, '') : evt.title}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {isElectron ? 'No events today' : 'Desktop app only'}
              </p>
              {isElectron && (
                <button onClick={fetchCalendar} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                  <RefreshCw className={`h-3 w-3 ${calendarLoading ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          )}
        </WidgetCard>

        {/* Compact Habits */}
        <WidgetCard title="HABITS" description={`${habitsCompleted}/${habits.length}`} delay={0.2} compact>
          <div className="flex items-center justify-between">
            {habits.map((h) => (
              <button
                key={h.id}
                onClick={() => toggleHabit(h.id)}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-base transition-all ${
                  isHabitDone(h.id)
                    ? 'bg-foreground/10 ring-1 ring-foreground/20'
                    : 'bg-secondary/80 opacity-40 hover:opacity-70'
                }`}
              >
                {h.emoji}
              </button>
            ))}
          </div>
        </WidgetCard>
      </div>

      {/* ─── TODAY STATS ────────────────────────────────── */}
      <WidgetCard title="TODAY" compact delay={0.25}>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-xl sm:text-2xl font-bold tabular-nums">{sessionCount}</p>
            <p className="text-[10px] text-muted-foreground">Sessions</p>
          </div>
          <div className="text-center">
            <p className="text-xl sm:text-2xl font-bold tabular-nums">{totalDeepWorkMin >= 60 ? `${Math.floor(totalDeepWorkMin / 60)}h${totalDeepWorkMin % 60 > 0 ? `${totalDeepWorkMin % 60}m` : ''}` : `${totalDeepWorkMin}m`}</p>
            <p className="text-[10px] text-muted-foreground">Deep work</p>
          </div>
          <div className="text-center">
            <p className="text-xl sm:text-2xl font-bold tabular-nums">{habitsCompleted}/{habits.length}</p>
            <p className="text-[10px] text-muted-foreground">Habits</p>
          </div>
        </div>
      </WidgetCard>
    </PageShell>
  )
}
