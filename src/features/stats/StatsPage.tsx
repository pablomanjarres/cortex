import { useState, useEffect, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ThemedTooltip, axisProps, chartColors, cssVar } from '@/lib/chart-theme'
import { cn } from '@/lib/utils'
import { useStore, readStore } from '@/lib/store'
import { localDate, getISOWeek, getWeekLabel, formatMinutes } from '@/lib/date-utils'
import { useToday } from '@/lib/use-today'
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

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const weekDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const GYM_TYPES = ['PUSH', 'PULL', 'LEGS', 'SWIM'] as const

function getNutritionTotals(n: DailyNutrition) {
  let protein = 0, calories = 0
  for (const m of n.meals ?? []) for (const f of m.foods ?? []) { protein += f.protein; calories += f.calories }
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

  // Chart palette from the live tokens (never inline hex) — workout types map
  // onto the standard 5-color chart family.
  const chartPalette = chartColors()
  const gymColors: Record<string, string> = {
    PUSH: chartPalette[0],
    PULL: chartPalette[1],
    LEGS: chartPalette[2],
    SWIM: chartPalette[3],
  }

  // Reactive "today" — rolls over at midnight so all the today-keyed stores
  // below re-key to the new day while the app stays open.
  const todayStr = useToday()

  // Shared stores
  const [habits] = useStore<HabitDef[]>('cortex-habits', [])
  const [founderHistory] = useStore<HistoryEntry[]>('cortex-founder-history', [])

  // Habits — single source of truth via shared hook (reactive, stays in sync)
  const { completedCount: habitsCompletedToday, isCompleted: isHabitDone, habitHistory } = useDailyHabits(selectedDate)

  // --- GTM Data -------------------------------------------
  const [dayGtm, setDayGtm] = useState<GtmDailyLog | null>(null)
  const [todayGtm] = useStore<GtmDailyLog | null>(`cortex-gtm-log-${todayStr}`, null)

  // --- Gym Data -------------------------------------------
  const [dayWorkout, setDayWorkout] = useState<WorkoutSession | null>(null)
  const [dayNutrition, setDayNutrition] = useState<DailyNutrition | null>(null)
  const [todayWorkoutRaw] = useStore<unknown>(`cortex-gym-session-${todayStr}`, null)
  const todayWorkout = useMemo(() => firstWorkout(todayWorkoutRaw), [todayWorkoutRaw])
  const [todayNutrition] = useStore<DailyNutrition | null>(`cortex-nutrition-${todayStr}`, null)

  // --- Day View Data --------------------------------------
  const [daySessions, setDaySessions] = useState<SprintSession[]>([])

  // Use useStore for today's data (reactive), readStore for past dates
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
      setWeekNutrition(nutrition.filter((n): n is DailyNutrition => n !== null && (n.meals ?? []).some(m => (m.foods?.length ?? 0) > 0)))
    })
  }, [weekDates, view])

  const weekFounder = useMemo(
    () => founderHistory.filter(h => weekDates.includes(h.date)),
    [founderHistory, weekDates]
  )

  // Week habit data — respects per-habit goals. Monthly-cadence habits are tracked
  // over the month, so they're excluded from this weekly view.
  const weekHabitData = useMemo(() => {
    return habits
      .filter(h => ((h as any).cadence ?? 'weekly') !== 'monthly')
      .map(h => {
        const goal = (h as any).weeklyGoal ?? 7
        const completed = weekDates.filter(d => habitHistory[d]?.[h.id]).length
        return { name: h.emoji + ' ' + h.name, completed, goal }
      })
  }, [habits, habitHistory, weekDates])

  const weekHabitConsistency = useMemo(() => {
    // 0-goal habits are "not required this week" — exclude them from the average
    // so they neither divide by zero nor count as a free 100%.
    const scored = weekHabitData.filter(h => h.goal > 0)
    if (scored.length === 0) return 0
    const avgPct = scored.reduce((s, h) => s + Math.min(h.completed / h.goal, 1), 0) / scored.length
    return Math.round(avgPct * 100)
  }, [weekHabitData])

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
        <Tabs value={view} onValueChange={(v) => setView(v as 'day' | 'week')}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon-sm" onClick={() => navigate(-1)} aria-label={view === 'day' ? 'Previous day' : 'Previous week'}>
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="secondary" size="icon-sm" onClick={() => navigate(1)} aria-label={view === 'day' ? 'Next day' : 'Next week'}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      {/* Date label */}
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {view === 'day'
          ? formatDate(selectedDate)
          : `Week of ${getWeekLabel(weekDates[0])}`}
      </p>

      {/* --- DAY VIEW -------------------------------------- */}
      {view === 'day' && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatTile variant="glass" label="Sessions" value={daySessions.length} icon={<Clock />} />
            <StatTile variant="glass" label="Deep work" value={formatMinutes(daySessions.reduce((s, x) => s + x.duration, 0))} icon={<Zap />} />
            <StatTile variant="glass" label="Habits" value={`${mergedHabitsCount}/${habits.length}`} icon={<Target />} />
          </div>

          {/* Sprint sessions */}
          <WidgetCard title="Sprint sessions" description={`${daySessions.length} sessions`} delay={0.05}>
            {daySessions.length > 0 ? (
              <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                {daySessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 rounded-md bg-secondary/30 px-3 py-2">
                    <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
                      {new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="flex-1 truncate text-xs">{s.task}</span>
                    <span className="shrink-0 font-mono text-2xs tabular-nums text-foreground-faint">{s.duration}m</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState className="py-4" message="No sprints this day." />
            )}
          </WidgetCard>

          {/* Habits for the day */}
          <WidgetCard title="Habits" description={`${mergedHabitsCount}/${habits.length}`} delay={0.15} compact>
            <div className="flex flex-wrap gap-2">
              {habits.map((h) => (
                <Chip key={h.id} variant={isHabitDone(h.id) ? 'success' : 'neutral'}>
                  {h.emoji} {h.name}
                </Chip>
              ))}
            </div>
          </WidgetCard>

          {/* Founder snapshot */}
          {dayFounder && (
            <WidgetCard title="Founder snapshot" delay={0.25} compact>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Commits', value: dayFounder.commits, icon: GitCommit },
                  { label: 'Deploys', value: dayFounder.deploys, icon: Rocket },
                  { label: 'Users', value: dayFounder.users, icon: Users },
                  { label: 'MRR', value: `$${dayFounder.mrr}`, icon: DollarSign },
                ].map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-2xs text-muted-foreground">{m.label}</span>
                    <span className="ml-auto font-mono text-sm font-medium tabular-nums">{m.value}</span>
                  </div>
                ))}
              </div>
            </WidgetCard>
          )}

          {/* GTM snapshot */}
          {dayGtm && (dayGtm.dmsSent > 0 || dayGtm.xReplies > 0 || dayGtm.demoCalls > 0) && (
            <WidgetCard title="GTM snapshot" delay={0.3} compact>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'DMs sent', value: dayGtm.dmsSent, icon: MessageSquare },
                  { label: 'Responses', value: dayGtm.dmResponses, icon: MessageCircle },
                  { label: 'Demo calls', value: dayGtm.demoCalls, icon: Megaphone },
                  { label: 'X replies', value: dayGtm.xReplies, icon: MessageCircle },
                  { label: 'X followers', value: dayGtm.xFollowers, icon: Users },
                  { label: 'Reddit', value: dayGtm.redditComments, icon: MessageSquare },
                  { label: 'LinkedIn', value: dayGtm.linkedinMessages, icon: MessageSquare },
                ].map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-2xs text-muted-foreground">{m.label}</span>
                    <span className="ml-auto font-mono text-sm font-medium tabular-nums">{m.value}</span>
                  </div>
                ))}
              </div>
              {dayGtm.notes && (
                <div className="mt-3 rounded-md bg-secondary/30 px-3 py-2">
                  <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Notes</p>
                  <p className="text-xs text-foreground">{dayGtm.notes}</p>
                </div>
              )}
            </WidgetCard>
          )}

          {/* Gym snapshot */}
          {(dayWorkout || (dayNutrition && (dayNutrition.meals ?? []).some(m => (m.foods?.length ?? 0) > 0))) && (() => {
            const workout = dayWorkout
            const stats = workout ? getSessionStats(workout) : null
            const nutrition = dayNutrition && (dayNutrition.meals ?? []).some(m => (m.foods?.length ?? 0) > 0) ? getNutritionTotals(dayNutrition) : null
            return (
              <WidgetCard title="Gym snapshot" delay={0.35} compact>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {workout && (
                    <>
                      <div className="flex items-center gap-2">
                        <Dumbbell className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-2xs text-muted-foreground">Workout</span>
                        <Chip size="sm" className="ml-auto">{workout.workoutName}</Chip>
                      </div>
                      <div className="flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-2xs text-muted-foreground">Sets</span>
                        <span className="ml-auto font-mono text-sm font-medium tabular-nums">{stats!.sets}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-2xs text-muted-foreground">Volume</span>
                        <span className="ml-auto font-mono text-sm font-medium tabular-nums">{stats!.volume > 0 ? `${Math.round(stats!.volume / 1000)}K kg` : '0'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Target className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-2xs text-muted-foreground">Exercises</span>
                        <span className="ml-auto font-mono text-sm font-medium tabular-nums">{workout.exercises.length}</span>
                      </div>
                    </>
                  )}
                  {nutrition && (
                    <>
                      <div className="flex items-center gap-2">
                        <Utensils className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-2xs text-muted-foreground">Protein</span>
                        <span className={cn('ml-auto font-mono text-sm font-medium tabular-nums', nutrition.protein >= PROTEIN_TARGET && 'text-success')}>{nutrition.protein}g</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Flame className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-2xs text-muted-foreground">Calories</span>
                        <span className={cn('ml-auto font-mono text-sm font-medium tabular-nums', nutrition.calories >= CALORIE_TARGET && 'text-success')}>{nutrition.calories}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Droplets className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-2xs text-muted-foreground">Water</span>
                        <span className={cn('ml-auto font-mono text-sm font-medium tabular-nums', nutrition.water >= WATER_TARGET && 'text-success')}>{nutrition.water}L</span>
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
                        <Chip key={i} className="gap-1.5">
                          <span>{ex.exerciseName}</span>
                          <span className="text-foreground-faint">{completedSets}s{maxWeight > 0 ? ` · ${maxWeight}kg` : ''}</span>
                        </Chip>
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
          <div className="grid grid-cols-3 gap-3">
            <StatTile variant="glass" label="Sessions" value={weekSessions.reduce((s, d) => s + d.sessions, 0)} />
            <StatTile variant="glass" label="Deep work" value={formatMinutes(weekSessions.reduce((s, d) => s + d.minutes, 0))} />
            <StatTile variant="glass" label="Habit score" value={`${weekHabitConsistency}%`} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Sprint trend */}
            <WidgetCard title="Sprint sessions" description={`${weekSessions.reduce((s, d) => s + d.sessions, 0)} sessions · avg ${(weekSessions.reduce((s, d) => s + d.sessions, 0) / 7).toFixed(1)}/day`} delay={0.05}>
              <div className="h-[140px] sm:h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weekSessions.map((d, i) => ({ day: weekDayNames[i], sessions: d.sessions }))}>
                    <XAxis dataKey="day" {...axisProps()} />
                    <YAxis allowDecimals={false} {...axisProps()} width={25} />
                    <Tooltip content={<ThemedTooltip />} cursor={{ stroke: cssVar('--border') }} />
                    <Area type="monotone" dataKey="sessions" stroke={chartPalette[0]} strokeWidth={2} fill={chartPalette[0]} fillOpacity={0.12} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </WidgetCard>

            {/* Deep work trend */}
            <WidgetCard title="Deep work" description={`${formatMinutes(weekSessions.reduce((s, d) => s + d.minutes, 0))} total · avg ${(weekSessions.reduce((s, d) => s + d.minutes, 0) / 7 / 60).toFixed(1)}h/day`} delay={0.1}>
              <div className="h-[140px] sm:h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weekSessions.map((d, i) => ({ day: weekDayNames[i], hours: Math.round(d.minutes / 60 * 10) / 10 }))}>
                    <XAxis dataKey="day" {...axisProps()} />
                    <YAxis {...axisProps()} width={30} unit="h" />
                    <Tooltip content={<ThemedTooltip formatter={(value) => `${value}h`} />} cursor={{ stroke: cssVar('--border') }} />
                    <Area type="monotone" dataKey="hours" stroke={chartPalette[0]} strokeWidth={2} fill={chartPalette[0]} fillOpacity={0.12} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </WidgetCard>

            {/* Habit consistency */}
            <WidgetCard title="Habit consistency" description={`${weekHabitConsistency}% this week`} delay={0.15}>
              <div className="flex flex-col gap-1.5">
                {weekHabitData.map((h) => {
                  const pct = h.goal > 0 ? Math.min(h.completed / h.goal, 1) * 100 : 0
                  const met = h.goal > 0 && h.completed >= h.goal
                  return (
                    <div key={h.name} className="flex items-center gap-2">
                      <span className="w-32 truncate text-xs sm:w-40">{h.name}</span>
                      <Progress
                        value={Math.round(pct)}
                        className={cn('flex-1', met && '[&_[data-slot=progress-indicator]]:bg-success')}
                      />
                      <span className={cn('w-8 text-right font-mono text-2xs tabular-nums', met ? 'text-success' : 'text-muted-foreground')}>{h.completed}/{h.goal}</span>
                    </div>
                  )
                })}
              </div>
            </WidgetCard>

            {/* Founder weekly */}
            {weekFounder.length > 0 && (
              <WidgetCard title="Founder metrics" description="This week" delay={0.2}>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Commits', value: weekFounder.reduce((s, h) => s + h.commits, 0), icon: GitCommit },
                    { label: 'Deploys', value: weekFounder.reduce((s, h) => s + h.deploys, 0), icon: Rocket },
                    { label: 'Users (latest)', value: weekFounder[weekFounder.length - 1]?.users ?? 0, icon: Users },
                    { label: 'MRR (latest)', value: `$${weekFounder[weekFounder.length - 1]?.mrr ?? 0}`, icon: DollarSign },
                  ].map((m) => (
                    <div key={m.label} className="flex items-center gap-2.5 rounded-md bg-secondary/30 px-3 py-2.5">
                      <m.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">{m.label}</p>
                        <p className="font-mono text-lg font-medium tabular-nums">{m.value}</p>
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
              const responseRate = totalDms > 0 ? ((totalResponses / totalDms) * 100).toFixed(0) + '%' : '—'
              const rateGood = totalDms > 0 && totalResponses / totalDms >= 0.1
              return (
                <WidgetCard title="GTM metrics" description="This week" delay={0.25}>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'DMs sent', value: totalDms, icon: MessageSquare },
                      { label: 'Response rate', value: responseRate, icon: MessageCircle, valueClass: rateGood ? 'text-success' : 'text-destructive' },
                      { label: 'Demo calls', value: weekGtm.reduce((s, g) => s + g.demoCalls, 0), icon: Megaphone },
                      { label: 'X replies', value: weekGtm.reduce((s, g) => s + g.xReplies, 0), icon: MessageCircle },
                      { label: 'Reddit', value: weekGtm.reduce((s, g) => s + g.redditComments, 0), icon: MessageSquare },
                      { label: 'LinkedIn', value: weekGtm.reduce((s, g) => s + g.linkedinMessages, 0), icon: MessageSquare },
                    ].map((m) => (
                      <div key={m.label} className="flex items-center gap-2.5 rounded-md bg-secondary/30 px-3 py-2.5">
                        <m.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div>
                          <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">{m.label}</p>
                          <p className={cn('font-mono text-lg font-medium tabular-nums', 'valueClass' in m && m.valueClass)}>{m.value}</p>
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
                return {
                  day: weekDayNames[i],
                  type: w?.workoutName || '',
                  sets: w ? getSessionStats(w).sets : 0,
                  fill: w ? (gymColors[w.workoutName] || cssVar('--muted-foreground')) : cssVar('--muted'),
                }
              })

              return (
                <WidgetCard title="Gym metrics" description={`${weekWorkouts.length}/4 sessions this week`} delay={0.3}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2.5 rounded-md bg-secondary/30 px-3 py-2.5">
                      <Dumbbell className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Sessions</p>
                        <p className="font-mono text-lg font-medium tabular-nums">{weekWorkouts.length}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-md bg-secondary/30 px-3 py-2.5">
                      <TrendingUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Volume</p>
                        <p className="font-mono text-lg font-medium tabular-nums">{totalVolume > 0 ? `${Math.round(totalVolume / 1000)}K kg` : `${totalSets} sets`}</p>
                      </div>
                    </div>
                    {avgNutrition && (
                      <>
                        <div className="flex items-center gap-2.5 rounded-md bg-secondary/30 px-3 py-2.5">
                          <Utensils className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div>
                            <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Avg protein</p>
                            <p className={cn('font-mono text-lg font-medium tabular-nums', avgNutrition.protein >= PROTEIN_TARGET && 'text-success')}>{avgNutrition.protein}g</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 rounded-md bg-secondary/30 px-3 py-2.5">
                          <Droplets className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div>
                            <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Avg water</p>
                            <p className={cn('font-mono text-lg font-medium tabular-nums', avgNutrition.water >= WATER_TARGET && 'text-success')}>{avgNutrition.water}L</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Weekly workout schedule chart */}
                  {weekWorkouts.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground">Workout schedule</p>
                      <div className="h-[120px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={weekGymChart}>
                            <XAxis dataKey="day" {...axisProps()} />
                            <YAxis allowDecimals={false} {...axisProps()} width={25} />
                            <Tooltip
                              content={
                                <ThemedTooltip
                                  labelFormatter={(day) => {
                                    const e = weekGymChart.find((x) => x.day === day)
                                    return e?.type ? `${day} · ${e.type}` : `${day} · rest`
                                  }}
                                />
                              }
                              cursor={{ fill: cssVar('--border'), fillOpacity: 0.3 }}
                            />
                            <Bar dataKey="sets" radius={[3, 3, 0, 0]}>
                              {weekGymChart.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-2 flex justify-center gap-3">
                        {GYM_TYPES.map((name) => (
                          <div key={name} className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: gymColors[name] }} />
                            <span className="font-mono text-2xs text-muted-foreground">{name}</span>
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
            <WidgetCard title="Weekly audit" description={`Generated ${new Date(weeklyAudit.generatedAt).toLocaleDateString()}`} delay={0.3}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 font-mono text-2xs uppercase tracking-wider text-muted-foreground">Sprint summary</p>
                  <p className="text-sm">
                    <span className="font-mono tabular-nums">{weeklyAudit.sprintStats.totalSessions}</span> sessions,{' '}
                    <span className="font-mono tabular-nums">{formatMinutes(weeklyAudit.sprintStats.totalDeepWork)}</span> deep work
                  </p>
                  <p className="mt-1 font-mono text-2xs text-foreground-faint">Avg {weeklyAudit.sprintStats.avgPerDay} sessions/day</p>
                </div>
                <div>
                  <p className="mb-1 font-mono text-2xs uppercase tracking-wider text-muted-foreground">Habits</p>
                  <p className="text-sm">
                    <span className="font-mono tabular-nums">{weeklyAudit.habitStats.consistency}%</span> consistency
                  </p>
                </div>
              </div>
            </WidgetCard>
          )}
        </>
      )}
    </PageShell>
  )
}
