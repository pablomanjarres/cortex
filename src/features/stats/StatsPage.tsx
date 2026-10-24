import { DateStepper } from '@/components/shared/DateStepper'
import { useState, useEffect, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Chip } from '@/components/ui/chip'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ThemedTooltip, axisProps, chartColors, cssVar } from '@/lib/chart-theme'
import { cn } from '@/lib/utils'
import { useStore, readStore } from '@/lib/store'
import { localDate, getISOWeek, getWeekDates, getWeekLabel, formatMinutes } from '@/lib/date-utils'
import { useDailyHabits } from '@/lib/use-daily-habits'
import { isActiveHabit, type Habit } from '@/lib/habits'
import { weeklyHabitScore } from '@/features/habits/habit-progress'
import type { FounderHistoryEntry, WeeklyAudit } from '@/features/daily/weekly-audit'
import { WEEKLY_SESSION_TARGET, WORKOUT_TYPES, normalizeSessions, sessionStats, completedSets, formatVolumeK, workoutTypeIndex } from '@/features/gym/domain/workout-sessions'
import { dayNutritionTotals, hasLoggedFood } from '@/features/gym/domain/nutrition'
import { MetricRows, MetricTiles, type StatsMetric } from './components/StatsMetrics'
import {
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

// --- Helpers ----------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const weekDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Gym sessions are persisted as a 1-element array (`[session]`); collapse to a
// single WorkoutSession so `.exercises` access is always valid.
const firstWorkout = (raw: unknown): WorkoutSession | null => normalizeSessions(raw)[0] ?? null

// --- Component --------------------------------------------

export function StatsPage() {
  const [view, setView] = useState<'day' | 'week'>('day')
  const [selectedDate, setSelectedDate] = useState(() => localDate())

  // Chart palette from the live tokens (never inline hex) — workout types map
  // onto the standard 5-color chart family.
  const chartPalette = chartColors()
  const gymColor = (name: string) => {
    const index = workoutTypeIndex(name)
    return index >= 0 ? chartPalette[index] : undefined
  }

  // Shared stores
  const [habits] = useStore<Habit[]>('cortex-habits', [])
  const activeHabits = useMemo(() => habits.filter(isActiveHabit), [habits])
  const [founderHistory] = useStore<FounderHistoryEntry[]>('cortex-founder-history', [])

  // Habits — single source of truth via shared hook (reactive, stays in sync)
  const { completedCount: habitsCompletedToday, isCompleted: isHabitDone, habitHistory } = useDailyHabits(selectedDate, habits)

  // Subscribe to the selected day directly. This keeps today's edits reactive
  // and prevents a late read for the previous day from replacing the new view.
  const [dayGtm] = useStore<GtmDailyLog | null>(`cortex-gtm-log-${selectedDate}`, null)
  const [dayWorkoutRaw] = useStore<unknown>(`cortex-gym-session-${selectedDate}`, null)
  const dayWorkout = useMemo(() => firstWorkout(dayWorkoutRaw), [dayWorkoutRaw])
  const [dayNutrition] = useStore<DailyNutrition | null>(`cortex-nutrition-${selectedDate}`, null)
  const [daySessions] = useStore<SprintSession[]>(`cortex-daily-sessions-${selectedDate}`, [])

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
      setWeekNutrition(nutrition.filter(hasLoggedFood))
    })
  }, [weekDates, view])

  const weekFounder = useMemo(
    () => founderHistory.filter(h => weekDates.includes(h.date)),
    [founderHistory, weekDates]
  )

  // Week habit data — respects per-habit goals. Monthly-cadence habits are tracked
  // over the month, so they're excluded from this weekly view.
  const weekHabits = useMemo(() => weeklyHabitScore(habits, habitHistory, weekDates), [habits, habitHistory, weekDates])
  const weekHabitConsistency = weekHabits.score

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

        <DateStepper label="Today" previousLabel={view === 'day' ? 'Previous day' : 'Previous week'}
          nextLabel={view === 'day' ? 'Next day' : 'Next week'} onPrevious={() => navigate(-1)}
          onNext={() => navigate(1)} onReset={goToToday} />
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
            <StatTile variant="glass" label="Habits" value={`${mergedHabitsCount}/${activeHabits.length}`} icon={<Target />} />
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
          <WidgetCard title="Habits" description={`${mergedHabitsCount}/${activeHabits.length}`} delay={0.15} compact>
            <div className="flex flex-wrap gap-2">
              {activeHabits.map((h) => (
                <Chip key={h.id} variant={isHabitDone(h.id) ? 'success' : 'neutral'}>
                  {h.emoji} {h.name}
                </Chip>
              ))}
            </div>
          </WidgetCard>

          {/* Founder snapshot */}
          {dayFounder && (
            <WidgetCard title="Founder snapshot" delay={0.25} compact>
              <MetricRows metrics={[
                { label: 'Commits', value: dayFounder.commits, icon: GitCommit },
                { label: 'Deploys', value: dayFounder.deploys, icon: Rocket },
                { label: 'Users', value: dayFounder.users, icon: Users },
                { label: 'MRR', value: `$${dayFounder.mrr}`, icon: DollarSign },
              ]} />
            </WidgetCard>
          )}

          {/* GTM snapshot */}
          {dayGtm && (dayGtm.dmsSent > 0 || dayGtm.xReplies > 0 || dayGtm.demoCalls > 0) && (
            <WidgetCard title="GTM snapshot" delay={0.3} compact>
              <MetricRows metrics={[
                { label: 'DMs sent', value: dayGtm.dmsSent, icon: MessageSquare },
                { label: 'Responses', value: dayGtm.dmResponses, icon: MessageCircle },
                { label: 'Demo calls', value: dayGtm.demoCalls, icon: Megaphone },
                { label: 'X replies', value: dayGtm.xReplies, icon: MessageCircle },
                { label: 'X followers', value: dayGtm.xFollowers, icon: Users },
                { label: 'Reddit', value: dayGtm.redditComments, icon: MessageSquare },
                { label: 'LinkedIn', value: dayGtm.linkedinMessages, icon: MessageSquare },
              ]} />
              {dayGtm.notes && (
                <div className="mt-3 rounded-md bg-secondary/30 px-3 py-2">
                  <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Notes</p>
                  <p className="text-xs text-foreground">{dayGtm.notes}</p>
                </div>
              )}
            </WidgetCard>
          )}

          {/* Gym snapshot */}
          {(dayWorkout || hasLoggedFood(dayNutrition)) && (() => {
            const workout = dayWorkout
            const nutrition = hasLoggedFood(dayNutrition) ? dayNutritionTotals(dayNutrition) : null
            const metrics: StatsMetric[] = []
            if (workout) {
              const stats = sessionStats(workout)
              metrics.push(
                { label: 'Workout', value: <Chip size="sm">{workout.workoutName}</Chip>, icon: Dumbbell },
                { label: 'Sets', value: stats.sets, icon: Activity },
                { label: 'Volume', value: stats.volume > 0 ? `${formatVolumeK(stats.volume)} kg` : '0', icon: TrendingUp },
                { label: 'Exercises', value: workout.exercises.length, icon: Target },
              )
            }
            if (nutrition) {
              metrics.push(
                { label: 'Protein', value: `${nutrition.protein}g`, icon: Utensils, valueClassName: nutrition.protein >= PROTEIN_TARGET && 'text-success' },
                { label: 'Calories', value: nutrition.calories, icon: Flame, valueClassName: nutrition.calories >= CALORIE_TARGET && 'text-success' },
                { label: 'Water', value: `${nutrition.water}L`, icon: Droplets, valueClassName: nutrition.water >= WATER_TARGET && 'text-success' },
              )
            }
            return (
              <WidgetCard title="Gym snapshot" delay={0.35} compact>
                <MetricRows metrics={metrics} />
                {workout && workout.exercises.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {workout.exercises.map((ex, i) => {
                      const done = completedSets(ex.sets)
                      const maxWeight = done.reduce((max, s) => Math.max(max, s.weight), 0)
                      return (
                        <Chip key={i} className="gap-1.5">
                          <span>{ex.exerciseName}</span>
                          <span className="text-foreground-faint">{done.length}s{maxWeight > 0 ? ` · ${maxWeight}kg` : ''}</span>
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
                {weekHabits.rows.map(({ habit, done, goal }) => {
                  const pct = goal > 0 ? Math.min(done / goal, 1) * 100 : 0
                  const met = goal > 0 && done >= goal
                  return (
                    <div key={habit.id} className="flex items-center gap-2">
                      <span className="w-32 truncate text-xs sm:w-40">{habit.emoji} {habit.name}</span>
                      <Progress
                        value={Math.round(pct)}
                        className={cn('flex-1', met && '[&_[data-slot=progress-indicator]]:bg-success')}
                      />
                      <span className={cn('w-8 text-right font-mono text-2xs tabular-nums', met ? 'text-success' : 'text-muted-foreground')}>{done}/{goal}</span>
                    </div>
                  )
                })}
              </div>
            </WidgetCard>

            {/* Founder weekly */}
            {weekFounder.length > 0 && (
              <WidgetCard title="Founder metrics" description="This week" delay={0.2}>
                <MetricTiles metrics={[
                  { label: 'Commits', value: weekFounder.reduce((s, h) => s + h.commits, 0), icon: GitCommit },
                  { label: 'Deploys', value: weekFounder.reduce((s, h) => s + h.deploys, 0), icon: Rocket },
                  { label: 'Users (latest)', value: weekFounder[weekFounder.length - 1]?.users ?? 0, icon: Users },
                  { label: 'MRR (latest)', value: `$${weekFounder[weekFounder.length - 1]?.mrr ?? 0}`, icon: DollarSign },
                ]} />
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
                  <MetricTiles metrics={[
                    { label: 'DMs sent', value: totalDms, icon: MessageSquare },
                    { label: 'Response rate', value: responseRate, icon: MessageCircle, valueClassName: rateGood ? 'text-success' : 'text-destructive' },
                    { label: 'Demo calls', value: weekGtm.reduce((s, g) => s + g.demoCalls, 0), icon: Megaphone },
                    { label: 'X replies', value: weekGtm.reduce((s, g) => s + g.xReplies, 0), icon: MessageCircle },
                    { label: 'Reddit', value: weekGtm.reduce((s, g) => s + g.redditComments, 0), icon: MessageSquare },
                    { label: 'LinkedIn', value: weekGtm.reduce((s, g) => s + g.linkedinMessages, 0), icon: MessageSquare },
                  ]} />
                </WidgetCard>
              )
            })()}

            {/* Gym weekly */}
            {(weekWorkouts.length > 0 || weekNutrition.length > 0) && (() => {
              const { sets: totalSets, volume: totalVolume } = sessionStats(weekWorkouts)
              const weekNutritionTotals = weekNutrition.map(dayNutritionTotals)
              const average = (key: 'protein' | 'water') =>
                weekNutritionTotals.reduce((s, n) => s + n[key], 0) / weekNutritionTotals.length
              const avgNutrition = weekNutritionTotals.length > 0
                ? { protein: Math.round(average('protein')), water: Math.round(average('water') * 10) / 10 }
                : null

              // Build workout schedule for the week bar chart
              const weekGymChart = weekDates.map((d, i) => {
                const w = weekWorkouts.find(s => s.date === d)
                return {
                  day: weekDayNames[i],
                  type: w?.workoutName || '',
                  sets: w ? sessionStats(w).sets : 0,
                  fill: w ? (gymColor(w.workoutName) || cssVar('--muted-foreground')) : cssVar('--muted'),
                }
              })

              const metrics: StatsMetric[] = [
                { label: 'Sessions', value: weekWorkouts.length, icon: Dumbbell },
                { label: 'Volume', value: totalVolume > 0 ? `${formatVolumeK(totalVolume)} kg` : `${totalSets} sets`, icon: TrendingUp },
              ]
              if (avgNutrition) {
                metrics.push(
                  { label: 'Avg protein', value: `${avgNutrition.protein}g`, icon: Utensils, valueClassName: avgNutrition.protein >= PROTEIN_TARGET && 'text-success' },
                  { label: 'Avg water', value: `${avgNutrition.water}L`, icon: Droplets, valueClassName: avgNutrition.water >= WATER_TARGET && 'text-success' },
                )
              }

              return (
                <WidgetCard title="Gym metrics" description={`${weekWorkouts.length}/${WEEKLY_SESSION_TARGET} sessions this week`} delay={0.3}>
                  <MetricTiles metrics={metrics} />
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
                        {WORKOUT_TYPES.map((name) => (
                          <div key={name} className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: gymColor(name) }} />
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
