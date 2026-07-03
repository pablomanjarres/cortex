import { useState, useEffect, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { useStore, readStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import { useDailyHabits } from '@/lib/use-daily-habits'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Target,
  GitCommit,
  Rocket,
  Users,
  DollarSign,
  Flame,
  MessageSquare,
  MessageCircle,
  Megaphone,
  Dumbbell,
  Droplets,
  Utensils,
  Activity,
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { WorkoutSession, DailyNutrition } from '@/types/gym'
import { PROTEIN_TARGET, CALORIE_TARGET, WATER_TARGET } from '@/types/gym'

// --- Types ------------------------------------------------

interface SprintSession {
  id: string
  task: string
  duration: number
  startedAt: string
  completedAt: string
}

interface HabitDef {
  id: string
  name: string
  emoji: string
}

interface HistoryEntry {
  date: string
  commits: number
  users: number
  deploys: number
  mrr: number
  prsOpen: number
  prsMerged: number
}

interface GtmDailyLog {
  date: string
  dmsSent: number
  dmResponses: number
  demoCalls: number
  xReplies: number
  xFollowers: number
  redditComments: number
  linkedinMessages: number
  channelOfSignup: string
  notes: string
}

interface WeeklyAudit {
  weekId: string
  weekStart: string
  weekEnd: string
  sprintStats: { totalSessions: number; totalDeepWork: number; avgPerDay: number; bestDay: { date: string; sessions: number } }
  habitStats: { consistency: number; perHabit: { id: string; name: string; completed: number; total: number }[] }
  founderStats: { commits: number; users: number; mrr: number; deploys: number }
  generatedAt: string
}

// --- Helpers ----------------------------------------------

const TOOLTIP_STYLE = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 11 },
}

function getWeekDates(isoDate: string): string[] {
  const d = new Date(isoDate + 'T00:00:00')
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7))
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const wd = new Date(monday)
    wd.setDate(monday.getDate() + i)
    dates.push(localDate(wd))
  }
  return dates
}

function getISOWeek(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatWeekLabel(startDate: string): string {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${mins}m`
}

const weekDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const GYM_COLORS: Record<string, string> = { PUSH: '#60a5fa', PULL: '#34d399', LEGS: '#fbbf24', SWIM: '#22d3ee' }

function getNutritionTotals(n: DailyNutrition) {
  let protein = 0, calories = 0
  for (const m of n.meals) for (const f of m.foods) { protein += f.protein; calories += f.calories }
  return { protein, calories, water: n.waterLiters }
}

function getSessionStats(s: WorkoutSession) {
  const sets = s.exercises.reduce((sum, ex) => sum + ex.sets.filter(set => set.completed).length, 0)
  const volume = s.exercises.reduce((sum, ex) => sum + ex.sets.filter(set => set.completed).reduce((v, set) => v + set.weight * set.reps, 0), 0)
  return { sets, volume }
}

// Gym sessions are persisted as a 1-element array (`[session]`); collapse to a
// single WorkoutSession so `.exercises` access is always valid.
function firstWorkout(raw: unknown): WorkoutSession | null {
  if (Array.isArray(raw)) return (raw[0] as WorkoutSession) ?? null
  if (raw && typeof raw === 'object' && 'workoutDayId' in raw) return raw as WorkoutSession
  return null
}

// --- Component --------------------------------------------

export function StatsPage() {
  const [view, setView] = useState<'day' | 'week'>('day')
  const [selectedDate, setSelectedDate] = useState(localDate())

  // Shared stores
  const [habits] = useStore<HabitDef[]>('cortex-habits', [])
  const [founderHistory] = useStore<HistoryEntry[]>('cortex-founder-history', [])

  // Habits — single source of truth via shared hook (reactive, stays in sync)
  const { completedCount: habitsCompletedToday, isCompleted: isHabitDone, habitHistory } = useDailyHabits(selectedDate)

  // --- GTM Data -------------------------------------------
  const [dayGtm, setDayGtm] = useState<GtmDailyLog | null>(null)
  const [todayGtm] = useStore<GtmDailyLog | null>(`cortex-gtm-log-${localDate()}`, null)

  // --- Gym Data -------------------------------------------
  const [dayWorkout, setDayWorkout] = useState<WorkoutSession | null>(null)
  const [dayNutrition, setDayNutrition] = useState<DailyNutrition | null>(null)
  const [todayWorkoutRaw] = useStore<unknown>(`cortex-gym-session-${localDate()}`, null)
  const todayWorkout = useMemo(() => firstWorkout(todayWorkoutRaw), [todayWorkoutRaw])
  const [todayNutrition] = useStore<DailyNutrition | null>(`cortex-nutrition-${localDate()}`, null)

  // --- Day View Data --------------------------------------
  const [daySessions, setDaySessions] = useState<SprintSession[]>([])

  // Use useStore for today's data (reactive), readStore for past dates
  const todayStr = useMemo(() => localDate(), [])
  const isToday = selectedDate === todayStr
  const [todaySessions] = useStore<SprintSession[]>(`cortex-daily-sessions-${todayStr}`, [])

  useEffect(() => {
    if (view !== 'day') return
    if (isToday) {
      setDaySessions(todaySessions)
      setDayGtm(todayGtm)
      setDayWorkout(todayWorkout)
      setDayNutrition(todayNutrition)
      return
    }
    Promise.all([
      readStore<SprintSession[]>(`cortex-daily-sessions-${selectedDate}`, []),
      readStore<GtmDailyLog | null>(`cortex-gtm-log-${selectedDate}`, null),
      readStore<WorkoutSession | null>(`cortex-gym-session-${selectedDate}`, null),
      readStore<DailyNutrition | null>(`cortex-nutrition-${selectedDate}`, null),
    ]).then(([sessions, gtm, workout, nutrition]) => {
      setDaySessions(sessions)
      setDayGtm(gtm)
      setDayWorkout(firstWorkout(workout))
      setDayNutrition(nutrition)
    })
  }, [selectedDate, view, isToday, todaySessions, todayGtm, todayWorkout, todayNutrition])

  const mergedHabitsCount = habitsCompletedToday

  const dayFounder = useMemo(() => founderHistory.find(h => h.date === selectedDate), [founderHistory, selectedDate])

  // --- Week View Data -------------------------------------
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate])
  const weekId = useMemo(() => getISOWeek(weekDates[0]), [weekDates])

  const [weekSessions, setWeekSessions] = useState<{ date: string; sessions: number; minutes: number }[]>([])
  const [weekGtm, setWeekGtm] = useState<GtmDailyLog[]>([])
  const [weekWorkouts, setWeekWorkouts] = useState<WorkoutSession[]>([])
  const [weekNutrition, setWeekNutrition] = useState<DailyNutrition[]>([])
  const [weeklyAudit] = useStore<WeeklyAudit | null>(`cortex-weekly-audit-${weekId}`, null)

  useEffect(() => {
    if (view !== 'week') return
    Promise.all([
      ...weekDates.map(d => readStore<SprintSession[]>(`cortex-daily-sessions-${d}`, [])),
      ...weekDates.map(d => readStore<GtmDailyLog | null>(`cortex-gtm-log-${d}`, null)),
      ...weekDates.map(d => readStore<WorkoutSession | null>(`cortex-gym-session-${d}`, null)),
      ...weekDates.map(d => readStore<DailyNutrition | null>(`cortex-nutrition-${d}`, null)),
    ]).then((results) => {
      const sessions = results.slice(0, 7) as SprintSession[][]
      const gtmLogs = results.slice(7, 14) as (GtmDailyLog | null)[]
      const workouts = results.slice(14, 21) as (WorkoutSession | null)[]
      const nutrition = results.slice(21, 28) as (DailyNutrition | null)[]

      setWeekSessions(sessions.map((s, i) => ({
        date: weekDates[i],
        sessions: s.length,
        minutes: s.reduce((sum, x) => sum + x.duration, 0),
      })))
      setWeekGtm(gtmLogs.filter((g): g is GtmDailyLog => g !== null && (g.dmsSent > 0 || g.xReplies > 0 || g.demoCalls > 0)))
      setWeekWorkouts(workouts.map(firstWorkout).filter((w): w is WorkoutSession => w !== null))
      setWeekNutrition(nutrition.filter((n): n is DailyNutrition => n !== null && n.meals.some(m => m.foods.length > 0)))
    })
  }, [weekDates, view])

  const weekFounder = useMemo(
    () => founderHistory.filter(h => weekDates.includes(h.date)),
    [founderHistory, weekDates]
  )

  // Week habit data — respects per-habit goals
  const weekHabitData = useMemo(() => {
    return habits.map(h => {
      const goal = (h as any).weeklyGoal ?? 7
      const completed = weekDates.filter(d => habitHistory[d]?.[h.id]).length
      return { name: h.emoji + ' ' + h.name, completed, goal }
    })
  }, [habits, habitHistory, weekDates])

  const weekHabitConsistency = useMemo(() => {
    if (habits.length === 0) return 0
    const avgPct = weekHabitData.reduce((s, h) => s + Math.min(h.completed / h.goal, 1), 0) / habits.length
    return Math.round(avgPct * 100)
  }, [weekHabitData, habits])

  // --- Navigation -----------------------------------------
  const navigate = (dir: number) => {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + (view === 'day' ? dir : dir * 7))
    setSelectedDate(localDate(d))
  }

  const goToToday = () => setSelectedDate(localDate())

  return (
    <PageShell>
      {/* Header with view toggle and date navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('day')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              view === 'day' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setView('week')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              view === 'week' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            Week
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={goToToday} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            Today
          </button>
          <button onClick={() => navigate(1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Date label */}
      <p className="text-sm font-medium text-muted-foreground">
        {view === 'day'
          ? formatDate(selectedDate)
          : `Week of ${formatWeekLabel(weekDates[0])}`}
      </p>

      {/* --- DAY VIEW -------------------------------------- */}
      {view === 'day' && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Sessions', value: daySessions.length.toString(), icon: Clock },
              { label: 'Deep work', value: formatMinutes(daySessions.reduce((s, x) => s + x.duration, 0)), icon: Zap },
              { label: 'Habits', value: `${mergedHabitsCount}/${habits.length}`, icon: Target },
            ].map((stat) => (
              <div key={stat.label} className="liquid-glass flex flex-col gap-1 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{stat.label}</span>
                </div>
                <p className="text-xl font-bold tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Sprint sessions */}
          <WidgetCard title="SPRINT SESSIONS" description={`${daySessions.length} sessions`} delay={0.05}>
            {daySessions.length > 0 ? (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {daySessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 rounded-lg bg-secondary/30 px-3 py-2">
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">
                      {new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-xs truncate flex-1">{s.task}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{s.duration}m</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 py-4 text-center">No sprint sessions</p>
            )}
          </WidgetCard>

          {/* Habits for the day */}
          <WidgetCard title="HABITS" description={`${mergedHabitsCount}/${habits.length}`} delay={0.15} compact>
            <div className="flex flex-wrap gap-2">
              {habits.map((h) => (
                <div
                  key={h.id}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${
                    isHabitDone(h.id)
                      ? 'bg-foreground/10 text-foreground'
                      : 'bg-secondary/50 text-muted-foreground/40'
                  }`}
                >
                  <span>{h.emoji}</span>
                  <span>{h.name}</span>
                </div>
              ))}
            </div>
          </WidgetCard>

          {/* Founder snapshot */}
          {dayFounder && (
            <WidgetCard title="FOUNDER SNAPSHOT" delay={0.25} compact>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Commits', value: dayFounder.commits, icon: GitCommit },
                  { label: 'Deploys', value: dayFounder.deploys, icon: Rocket },
                  { label: 'Users', value: dayFounder.users, icon: Users },
                  { label: 'MRR', value: `$${dayFounder.mrr}`, icon: DollarSign },
                ].map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">{m.label}</span>
                    <span className="ml-auto text-sm font-bold tabular-nums">{m.value}</span>
                  </div>
                ))}
              </div>
            </WidgetCard>
          )}

          {/* GTM snapshot */}
          {dayGtm && (dayGtm.dmsSent > 0 || dayGtm.xReplies > 0 || dayGtm.demoCalls > 0) && (
            <WidgetCard title="GTM SNAPSHOT" delay={0.3} compact>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'DMs sent', value: dayGtm.dmsSent, icon: MessageSquare, color: 'text-blue-400' },
                  { label: 'Responses', value: dayGtm.dmResponses, icon: MessageCircle, color: 'text-green-400' },
                  { label: 'Demo calls', value: dayGtm.demoCalls, icon: Megaphone, color: 'text-purple-400' },
                  { label: 'X replies', value: dayGtm.xReplies, icon: MessageCircle, color: 'text-blue-400' },
                  { label: 'X followers', value: dayGtm.xFollowers, icon: Users, color: 'text-blue-400' },
                  { label: 'Reddit', value: dayGtm.redditComments, icon: MessageSquare, color: 'text-orange-400' },
                  { label: 'LinkedIn', value: dayGtm.linkedinMessages, icon: MessageSquare, color: 'text-blue-300' },
                ].map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <m.icon className={`h-3.5 w-3.5 ${m.color}`} />
                    <span className="text-[10px] text-muted-foreground">{m.label}</span>
                    <span className="ml-auto text-sm font-bold tabular-nums">{m.value}</span>
                  </div>
                ))}
              </div>
              {dayGtm.notes && (
                <div className="mt-3 rounded-lg bg-secondary/30 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Notes</p>
                  <p className="text-xs text-foreground/80">{dayGtm.notes}</p>
                </div>
              )}
            </WidgetCard>
          )}

          {/* Gym snapshot */}
          {(dayWorkout || (dayNutrition && dayNutrition.meals.some(m => m.foods.length > 0))) && (() => {
            const workout = dayWorkout
            const stats = workout ? getSessionStats(workout) : null
            const nutrition = dayNutrition && dayNutrition.meals.some(m => m.foods.length > 0) ? getNutritionTotals(dayNutrition) : null
            return (
              <WidgetCard title="GYM SNAPSHOT" delay={0.35} compact>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {workout && (
                    <>
                      <div className="flex items-center gap-2">
                        <Dumbbell className="h-3.5 w-3.5 text-blue-400" />
                        <span className="text-[10px] text-muted-foreground">Workout</span>
                        <span className="ml-auto text-sm font-bold" style={{ color: GYM_COLORS[workout.workoutName] || '#888' }}>{workout.workoutName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">Sets</span>
                        <span className="ml-auto text-sm font-bold tabular-nums">{stats!.sets}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3.5 w-3.5 text-yellow-400" />
                        <span className="text-[10px] text-muted-foreground">Volume</span>
                        <span className="ml-auto text-sm font-bold tabular-nums">{stats!.volume > 0 ? `${Math.round(stats!.volume / 1000)}K kg` : '0'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Target className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-[10px] text-muted-foreground">Exercises</span>
                        <span className="ml-auto text-sm font-bold tabular-nums">{workout.exercises.length}</span>
                      </div>
                    </>
                  )}
                  {nutrition && (
                    <>
                      <div className="flex items-center gap-2">
                        <Utensils className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-[10px] text-muted-foreground">Protein</span>
                        <span className={`ml-auto text-sm font-bold tabular-nums ${nutrition.protein >= PROTEIN_TARGET ? 'text-green-400' : ''}`}>{nutrition.protein}g</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Flame className="h-3.5 w-3.5 text-orange-400" />
                        <span className="text-[10px] text-muted-foreground">Calories</span>
                        <span className={`ml-auto text-sm font-bold tabular-nums ${nutrition.calories >= CALORIE_TARGET ? 'text-green-400' : ''}`}>{nutrition.calories}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Droplets className="h-3.5 w-3.5 text-blue-400" />
                        <span className="text-[10px] text-muted-foreground">Water</span>
                        <span className={`ml-auto text-sm font-bold tabular-nums ${nutrition.water >= WATER_TARGET ? 'text-blue-400' : ''}`}>{nutrition.water}L</span>
                      </div>
                    </>
                  )}
                </div>
                {workout && workout.exercises.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {workout.exercises.map((ex, i) => {
                      const completedSets = ex.sets.filter(s => s.completed).length
                      const maxWeight = ex.sets.filter(s => s.completed).reduce((max, s) => Math.max(max, s.weight), 0)
                      return (
                        <div key={i} className="flex items-center gap-1.5 rounded-lg bg-foreground/5 px-2.5 py-1.5 text-[10px]">
                          <span className="text-foreground/80">{ex.exerciseName}</span>
                          <span className="text-muted-foreground/50">{completedSets}s{maxWeight > 0 ? ` · ${maxWeight}kg` : ''}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </WidgetCard>
            )
          })()}
        </>
      )}

      {/* --- WEEK VIEW ------------------------------------- */}
      {view === 'week' && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Sessions', value: weekSessions.reduce((s, d) => s + d.sessions, 0).toString() },
              { label: 'Deep work', value: formatMinutes(weekSessions.reduce((s, d) => s + d.minutes, 0)) },
              { label: 'Habit score', value: `${weekHabitConsistency}%` },
            ].map((stat) => (
              <div key={stat.label} className="liquid-glass flex flex-col gap-1 rounded-xl px-4 py-3">
                <span className="text-[10px] text-muted-foreground">{stat.label}</span>
                <p className="text-xl font-bold tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Sprint trend */}
            <WidgetCard title="SPRINT SESSIONS" description={`${weekSessions.reduce((s, d) => s + d.sessions, 0)} sessions · avg ${(weekSessions.reduce((s, d) => s + d.sessions, 0) / 7).toFixed(1)}/day`} delay={0.05}>
              <div className="h-[140px] sm:h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weekSessions.map((d, i) => ({ day: weekDayNames[i], sessions: d.sessions }))}>
                    <defs>
                      <linearGradient id="sessionGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={25} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="sessions" stroke="#60a5fa" strokeWidth={2} fill="url(#sessionGrad)" dot={{ r: 3, fill: '#60a5fa', strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </WidgetCard>

            {/* Deep work trend */}
            <WidgetCard title="DEEP WORK" description={`${formatMinutes(weekSessions.reduce((s, d) => s + d.minutes, 0))} total · avg ${(weekSessions.reduce((s, d) => s + d.minutes, 0) / 7 / 60).toFixed(1)}h/day`} delay={0.1}>
              <div className="h-[140px] sm:h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weekSessions.map((d, i) => ({ day: weekDayNames[i], hours: Math.round(d.minutes / 60 * 10) / 10 }))}>
                    <defs>
                      <linearGradient id="deepWorkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={30} unit="h" />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(value) => [`${value}h`, 'Deep work']} />
                    <Area type="monotone" dataKey="hours" stroke="#34d399" strokeWidth={2} fill="url(#deepWorkGrad)" dot={{ r: 3, fill: '#34d399', strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </WidgetCard>

            {/* Habit consistency */}
            <WidgetCard title="HABIT CONSISTENCY" description={`${weekHabitConsistency}% this week`} delay={0.15}>
              <div className="flex flex-col gap-1.5">
                {weekHabitData.map((h) => {
                  const pct = Math.min(h.completed / h.goal, 1) * 100
                  const met = h.completed >= h.goal
                  return (
                    <div key={h.name} className="flex items-center gap-2">
                      <span className="text-xs w-32 sm:w-40 truncate">{h.name}</span>
                      <div className="flex-1 h-4 rounded bg-secondary/50 overflow-hidden">
                        <div
                          className={`h-full rounded ${met ? 'bg-green-500/30' : 'bg-foreground/20'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-mono tabular-nums w-8 text-right ${met ? 'text-green-400' : 'text-muted-foreground'}`}>{h.completed}/{h.goal}</span>
                    </div>
                  )
                })}
              </div>
            </WidgetCard>

            {/* Founder weekly */}
            {weekFounder.length > 0 && (
              <WidgetCard title="FOUNDER METRICS" description="This week" delay={0.2}>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Commits', value: weekFounder.reduce((s, h) => s + h.commits, 0), icon: GitCommit },
                    { label: 'Deploys', value: weekFounder.reduce((s, h) => s + h.deploys, 0), icon: Rocket },
                    { label: 'Users (latest)', value: weekFounder[weekFounder.length - 1]?.users ?? 0, icon: Users },
                    { label: 'MRR (latest)', value: `$${weekFounder[weekFounder.length - 1]?.mrr ?? 0}`, icon: DollarSign },
                  ].map((m) => (
                    <div key={m.label} className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2.5">
                      <m.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">{m.label}</p>
                        <p className="text-lg font-bold tabular-nums">{m.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </WidgetCard>
            )}

            {/* GTM weekly */}
            {weekGtm.length > 0 && (() => {
              const totalDms = weekGtm.reduce((s, g) => s + g.dmsSent, 0)
              const totalResponses = weekGtm.reduce((s, g) => s + g.dmResponses, 0)
              const responseRate = totalDms > 0 ? ((totalResponses / totalDms) * 100).toFixed(0) + '%' : '\u2014'
              return (
                <WidgetCard title="GTM METRICS" description="This week" delay={0.25}>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'DMs sent', value: totalDms, icon: MessageSquare, color: 'text-blue-400' },
                      { label: 'Response rate', value: responseRate, icon: MessageCircle, color: totalDms > 0 && totalResponses / totalDms >= 0.1 ? 'text-green-400' : 'text-red-400' },
                      { label: 'Demo calls', value: weekGtm.reduce((s, g) => s + g.demoCalls, 0), icon: Megaphone, color: 'text-purple-400' },
                      { label: 'X replies', value: weekGtm.reduce((s, g) => s + g.xReplies, 0), icon: MessageCircle, color: 'text-blue-400' },
                      { label: 'Reddit', value: weekGtm.reduce((s, g) => s + g.redditComments, 0), icon: MessageSquare, color: 'text-orange-400' },
                      { label: 'LinkedIn', value: weekGtm.reduce((s, g) => s + g.linkedinMessages, 0), icon: MessageSquare, color: 'text-blue-300' },
                    ].map((m) => (
                      <div key={m.label} className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2.5">
                        <m.icon className={`h-4 w-4 shrink-0 ${m.color}`} />
                        <div>
                          <p className="text-[10px] text-muted-foreground">{m.label}</p>
                          <p className="text-lg font-bold tabular-nums">{m.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </WidgetCard>
              )
            })()}

            {/* Gym weekly */}
            {(weekWorkouts.length > 0 || weekNutrition.length > 0) && (() => {
              const totalSets = weekWorkouts.reduce((s, w) => s + getSessionStats(w).sets, 0)
              const totalVolume = weekWorkouts.reduce((s, w) => s + getSessionStats(w).volume, 0)
              const avgNutrition = weekNutrition.length > 0
                ? {
                    protein: Math.round(weekNutrition.reduce((s, n) => s + getNutritionTotals(n).protein, 0) / weekNutrition.length),
                    calories: Math.round(weekNutrition.reduce((s, n) => s + getNutritionTotals(n).calories, 0) / weekNutrition.length),
                    water: Math.round(weekNutrition.reduce((s, n) => s + getNutritionTotals(n).water, 0) / weekNutrition.length * 10) / 10,
                  }
                : null

              // Build workout schedule for the week bar chart
              const weekGymChart = weekDates.map((d, i) => {
                const w = weekWorkouts.find(s => s.date === d)
                return { day: weekDayNames[i], type: w?.workoutName || '', sets: w ? getSessionStats(w).sets : 0, fill: w ? (GYM_COLORS[w.workoutName] || '#888') : '#333' }
              })

              return (
                <WidgetCard title="GYM METRICS" description={`${weekWorkouts.length}/4 sessions this week`} delay={0.3}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2.5">
                      <Dumbbell className="h-4 w-4 text-blue-400 shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Sessions</p>
                        <p className="text-lg font-bold tabular-nums">{weekWorkouts.length}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2.5">
                      <TrendingUp className="h-4 w-4 text-yellow-400 shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Volume</p>
                        <p className="text-lg font-bold tabular-nums">{totalVolume > 0 ? `${Math.round(totalVolume / 1000)}K kg` : `${totalSets} sets`}</p>
                      </div>
                    </div>
                    {avgNutrition && (
                      <>
                        <div className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2.5">
                          <Utensils className="h-4 w-4 text-green-400 shrink-0" />
                          <div>
                            <p className="text-[10px] text-muted-foreground">Avg Protein</p>
                            <p className={`text-lg font-bold tabular-nums ${avgNutrition.protein >= PROTEIN_TARGET ? 'text-green-400' : ''}`}>{avgNutrition.protein}g</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2.5">
                          <Droplets className="h-4 w-4 text-blue-400 shrink-0" />
                          <div>
                            <p className="text-[10px] text-muted-foreground">Avg Water</p>
                            <p className={`text-lg font-bold tabular-nums ${avgNutrition.water >= WATER_TARGET ? 'text-blue-400' : ''}`}>{avgNutrition.water}L</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Weekly workout schedule chart */}
                  {weekWorkouts.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] text-muted-foreground mb-2">Workout Schedule</p>
                      <div className="h-[120px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={weekGymChart}>
                            <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={25} />
                            <Tooltip
                              {...TOOLTIP_STYLE}
                              formatter={(value, _name, props) => [value as number, ((props as unknown as { payload?: { type?: string } }).payload?.type) || 'Rest']}
                            />
                            <Bar dataKey="sets" radius={[3, 3, 0, 0]}>
                              {weekGymChart.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex gap-3 mt-2 justify-center">
                        {Object.entries(GYM_COLORS).map(([name, color]) => (
                          <div key={name} className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-[10px] text-muted-foreground">{name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </WidgetCard>
              )
            })()}
          </div>

          {/* Weekly Audit (if generated) */}
          {weeklyAudit && (
            <WidgetCard title="WEEKLY AUDIT" description={`Generated ${new Date(weeklyAudit.generatedAt).toLocaleDateString()}`} delay={0.3}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Sprint Summary</p>
                  <p className="text-sm">{weeklyAudit.sprintStats.totalSessions} sessions, {formatMinutes(weeklyAudit.sprintStats.totalDeepWork)} deep work</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Avg {weeklyAudit.sprintStats.avgPerDay} sessions/day</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Habits</p>
                  <p className="text-sm">{weeklyAudit.habitStats.consistency}% consistency</p>
                </div>
              </div>
            </WidgetCard>
          )}
        </>
      )}
    </PageShell>
  )
}
