import { useState, useEffect, useMemo } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Chip } from '@/components/ui/chip'
import { ThemedTooltip, axisProps, chartColors, cssVar, gridProps } from '@/lib/chart-theme'
import { readStore } from '@/lib/store'
import { getLastNDays, localDate } from '@/lib/date-utils'
import type { WorkoutDay, WorkoutSession, BodyStats, DailyNutrition } from '@/types/gym'
import { PROTEIN_TARGET, CALORIE_TARGET } from '@/types/gym'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'
import { TrendingUp, Activity, Scale, Target, Zap, Flame } from 'lucide-react'

interface AnalyticsProps {
  plans: WorkoutDay[]
  bodyStats: BodyStats[]
}

const RANGE_OPTIONS = [7, 14, 30, 90]
// Workout types map onto the chart family in a fixed order (never inline hex).
const TYPE_ORDER = ['PUSH', 'PULL', 'LEGS', 'SWIM']
const typeColor = (name: string, colors: string[]) => {
  const i = TYPE_ORDER.indexOf(name)
  return i >= 0 ? colors[i % colors.length] : colors[4]
}

/** Mono percent-of-target readout — success ink once the target is met. */
function TargetPct({ value, target }: { value: number; target: number }) {
  const pct = Math.round((value / target) * 100)
  return (
    <span className={`font-mono text-2xs tabular-nums ${pct >= 100 ? 'text-success' : 'text-muted-foreground'}`}>
      {pct}%
    </span>
  )
}

export function Analytics({ bodyStats }: AnalyticsProps) {
  const [range, setRange] = useState(30)
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [nutritionDays, setNutritionDays] = useState<DailyNutrition[]>([])
  const [selectedExercise, setSelectedExercise] = useState('')
  // Token palette is static at runtime — resolve the CSS vars once.
  const colors = useMemo(() => chartColors(), [])
  const [c1] = colors

  // Load sessions + nutrition for date range
  useEffect(() => {
    const dates = getLastNDays(range)
    Promise.all(
      dates.map(d => readStore<unknown>(`cortex-gym-session-${d}`, null))
    ).then(results => {
      const loaded: WorkoutSession[] = []
      for (const r of results) {
        if (!r) continue
        if (Array.isArray(r)) loaded.push(...(r as WorkoutSession[]))
        else if (typeof r === 'object' && 'workoutDayId' in (r as any)) loaded.push(r as WorkoutSession)
      }
      setSessions(loaded)
      if (!selectedExercise && loaded.length > 0) {
        const firstEx = loaded.find(s => s.exercises.length > 0)?.exercises[0]
        if (firstEx) setSelectedExercise(firstEx.exerciseName)
      }
    })
    Promise.all(
      dates.map(d => readStore<DailyNutrition | null>(`cortex-nutrition-${d}`, null))
    ).then(results => {
      setNutritionDays(results.filter((n): n is DailyNutrition => n !== null && n.meals.some(m => m.foods.length > 0)))
    })
  }, [range])

  // All unique exercise names
  const exerciseNames = useMemo(() => {
    const names = new Set<string>()
    for (const s of sessions) for (const ex of s.exercises) names.add(ex.exerciseName)
    return Array.from(names).sort()
  }, [sessions])

  // Progressive overload data
  const overloadData = useMemo(() => {
    if (!selectedExercise) return []
    return sessions
      .filter(s => s.exercises.some(ex => ex.exerciseName === selectedExercise))
      .map(s => {
        const ex = s.exercises.find(e => e.exerciseName === selectedExercise)!
        const completedSets = ex.sets.filter(set => set.completed)
        const maxWeight = completedSets.length > 0 ? Math.max(...completedSets.map(set => set.weight)) : 0
        const totalVolume = completedSets.reduce((sum, set) => sum + set.weight * set.reps, 0)
        return { date: s.date.slice(5), weight: maxWeight, volume: totalVolume }
      })
  }, [sessions, selectedExercise])

  // Volume per session
  const volumeData = useMemo(() => sessions.map(s => {
    const totalSets = s.exercises.reduce((sum, ex) => sum + ex.sets.filter(set => set.completed).length, 0)
    const totalVolume = s.exercises.reduce((sum, ex) => sum + ex.sets.filter(set => set.completed).reduce((v, set) => v + set.weight * set.reps, 0), 0)
    return { date: s.date.slice(5), sets: totalSets, volume: totalVolume, type: s.workoutName, fill: typeColor(s.workoutName, colors) }
  }), [sessions, colors])

  // Weight trend — compare YYYY-MM-DD strings directly: `new Date('YYYY-MM-DD')`
  // parses as UTC midnight, which shifts entries across day boundaries locally.
  const weightData = useMemo(() => {
    const cutoff = getLastNDays(range)[0] // oldest local day in range
    return bodyStats.filter(s => s.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date)).map(s => ({ date: s.date.slice(5), weight: s.weight }))
  }, [bodyStats, range])

  // Personal records
  const personalRecords = useMemo(() => {
    const prs = new Map<string, { weight: number; date: string; reps: number }>()
    for (const s of sessions) {
      for (const ex of s.exercises) {
        for (const set of ex.sets) {
          if (!set.completed || set.weight === 0) continue
          const current = prs.get(ex.exerciseName)
          if (!current || set.weight > current.weight) {
            prs.set(ex.exerciseName, { weight: set.weight, date: s.date, reps: set.reps })
          }
        }
      }
    }
    return Array.from(prs.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [sessions])

  // Workout type distribution
  const typeDistribution = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of sessions) counts.set(s.workoutName, (counts.get(s.workoutName) || 0) + 1)
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count, fill: typeColor(name, colors) }))
  }, [sessions, colors])

  // Nutrition trend
  const nutritionData = useMemo(() => {
    return nutritionDays.map(n => {
      let protein = 0, calories = 0
      for (const m of n.meals) for (const f of m.foods) { protein += f.protein; calories += f.calories }
      return { date: n.date.slice(5), protein, calories, water: n.waterLiters }
    })
  }, [nutritionDays])

  // Avg nutrition
  const avgNutrition = useMemo(() => {
    if (nutritionData.length === 0) return null
    const total = nutritionData.reduce((acc, d) => ({ protein: acc.protein + d.protein, calories: acc.calories + d.calories, water: acc.water + d.water }), { protein: 0, calories: 0, water: 0 })
    return { protein: Math.round(total.protein / nutritionData.length), calories: Math.round(total.calories / nutritionData.length), water: Math.round(total.water / nutritionData.length * 10) / 10, days: nutritionData.length }
  }, [nutritionData])

  // KPIs
  const expectedPerWeek = 4
  const weeks = Math.max(1, range / 7)
  const expectedSessions = Math.round(expectedPerWeek * weeks)
  const completionRate = expectedSessions > 0 ? Math.round((sessions.length / expectedSessions) * 100) : 0
  const totalSets = sessions.reduce((s, sess) => s + sess.exercises.reduce((sum, ex) => sum + ex.sets.filter(set => set.completed).length, 0), 0)
  const totalVolume = sessions.reduce((s, sess) => s + sess.exercises.reduce((sum, ex) => sum + ex.sets.filter(set => set.completed).reduce((v, set) => v + set.weight * set.reps, 0), 0), 0)

  // Weekly streak — week boundaries as local YYYY-MM-DD strings, compared
  // against session date strings (avoids the UTC-midnight parse of new Date(s)).
  const weeklyStreak = useMemo(() => {
    let streak = 0
    const monday = new Date()
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7) // this week's Monday
    for (let w = 0; w < 12; w++) {
      const weekStart = new Date(monday)
      weekStart.setDate(monday.getDate() - w * 7)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 7)
      const startStr = localDate(weekStart)
      const endStr = localDate(weekEnd)
      const weekSessions = sessions.filter(s => s.date >= startStr && s.date < endStr)
      if (weekSessions.length >= 3) streak++
      else if (w > 0) break // don't break on current incomplete week
    }
    return streak
  }, [sessions])

  return (
    <div className="mt-4 space-y-4">
      {/* Range selector */}
      <div className="flex gap-1.5">
        {RANGE_OPTIONS.map(r => (
          <Chip key={r} selectable selected={range === r} onClick={() => setRange(r)}>
            {r}d
          </Chip>
        ))}
      </div>

      {/* KPI tiles — always show */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatTile label="Completion" value={`${completionRate}%`} icon={<Target />} />
        <StatTile label={`Sessions (${range}d)`} value={sessions.length} icon={<Activity />} />
        <StatTile label="Total sets" value={totalSets} icon={<TrendingUp />} />
        <StatTile label="Volume (kg)" value={totalVolume > 0 ? `${Math.round(totalVolume / 1000)}K` : '0'} icon={<Zap />} />
        <StatTile label="Weight" value={bodyStats.length > 0 ? `${bodyStats[bodyStats.length - 1].weight}kg` : '-'} icon={<Scale />} />
        <StatTile label="Week streak" value={weeklyStreak} icon={<Flame />} />
      </div>

      {sessions.length === 0 ? (
        <EmptyState message="No workout data yet." hint="Complete a workout to see charts." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Progressive Overload */}
            <WidgetCard title="Progressive Overload" description="Max weight per session" delay={0.05}>
              <div className="mb-3">
                <select value={selectedExercise} onChange={(e) => setSelectedExercise(e.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground">
                  {exerciseNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              {overloadData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={overloadData}>
                    <CartesianGrid {...gridProps()} />
                    <XAxis dataKey="date" {...axisProps()} />
                    <YAxis unit="kg" {...axisProps()} />
                    <Tooltip content={<ThemedTooltip />} cursor={{ stroke: cssVar('--border') }} />
                    <Area type="monotone" dataKey="weight" stroke={c1} fill={c1} fillOpacity={0.12} strokeWidth={2} dot={{ r: 3, fill: c1, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No data for this exercise." className="py-6" />
              )}
            </WidgetCard>

            {/* Volume per Session */}
            <WidgetCard title="Volume per Session" description="Total completed sets" delay={0.1}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={volumeData}>
                  <CartesianGrid {...gridProps()} />
                  <XAxis dataKey="date" {...axisProps()} />
                  <YAxis {...axisProps()} />
                  <Tooltip content={<ThemedTooltip />} cursor={{ fill: cssVar('--muted'), fillOpacity: 0.35 }} />
                  <Bar dataKey="sets" radius={[4, 4, 0, 0]}>
                    {volumeData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </WidgetCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Volume trend (total kg lifted) */}
            {volumeData.some(v => v.volume > 0) && (
              <WidgetCard title="Total Volume Trend" description="Weight x Reps per session (kg)" delay={0.15}>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={volumeData}>
                    <CartesianGrid {...gridProps()} />
                    <XAxis dataKey="date" {...axisProps()} />
                    <YAxis {...axisProps()} />
                    <Tooltip content={<ThemedTooltip />} cursor={{ stroke: cssVar('--border') }} />
                    <Area type="monotone" dataKey="volume" stroke={c1} fill={c1} fillOpacity={0.12} strokeWidth={2} dot={{ r: 3, fill: c1, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </WidgetCard>
            )}

            {/* Workout Type Distribution */}
            {typeDistribution.length > 0 && (
              <WidgetCard title="Workout Distribution" description="Sessions by type" delay={0.2}>
                <div className="space-y-3 py-2">
                  {typeDistribution.map(({ name, count, fill }) => (
                    <div key={name} className="flex items-center gap-3">
                      <span className="flex w-16 items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: fill }} />
                        {name}
                      </span>
                      <div className="h-1 flex-1 rounded-full bg-muted/60">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(4, (count / sessions.length) * 100)}%`, backgroundColor: fill }}
                        />
                      </div>
                      <span className="w-6 text-right font-mono text-xs tabular-nums text-foreground">{count}</span>
                    </div>
                  ))}
                </div>
              </WidgetCard>
            )}
          </div>

          {/* Personal Records */}
          {personalRecords.length > 0 && (
            <WidgetCard title="Personal Records" description="Best weight per exercise" delay={0.25}>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {personalRecords.map(([name, pr]) => (
                  <div key={name} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{name}</p>
                      <p className="font-mono text-2xs text-foreground-faint">{pr.date}</p>
                    </div>
                    <div className="ml-2 shrink-0 text-right">
                      <p className="font-mono text-sm font-medium tabular-nums text-foreground">{pr.weight}kg</p>
                      <p className="font-mono text-2xs tabular-nums text-foreground-faint">{pr.reps} reps</p>
                    </div>
                  </div>
                ))}
              </div>
            </WidgetCard>
          )}

          {/* Weight Trend — show even with 1 data point */}
          {weightData.length > 0 && (
            <WidgetCard title="Weight Trend" description={`Body weight · ${bodyStats.length} weigh-in${bodyStats.length !== 1 ? 's' : ''}`} delay={0.3}>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={weightData}>
                  <CartesianGrid {...gridProps()} />
                  <XAxis dataKey="date" {...axisProps()} />
                  <YAxis unit="kg" domain={['dataMin - 1', 'dataMax + 1']} {...axisProps()} />
                  <Tooltip content={<ThemedTooltip />} cursor={{ stroke: cssVar('--border') }} />
                  <Line type="monotone" dataKey="weight" stroke={c1} strokeWidth={2} dot={{ r: 4, fill: c1, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </WidgetCard>
          )}
        </>
      )}

      {/* Nutrition Analytics — always show if data exists */}
      {nutritionData.length > 0 && (
        <>
          <div className="flex items-baseline gap-2 pt-2">
            <h3 className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Nutrition Analytics</h3>
            <span className="font-mono text-2xs tabular-nums text-foreground-faint">{nutritionData.length} days tracked</span>
          </div>

          {/* Nutrition KPIs */}
          {avgNutrition && (
            <div className="grid grid-cols-3 gap-3">
              <StatTile
                label="Avg protein"
                value={`${avgNutrition.protein}g`}
                sub={`of ${PROTEIN_TARGET}g target`}
                delta={<TargetPct value={avgNutrition.protein} target={PROTEIN_TARGET} />}
              />
              <StatTile
                label="Avg calories"
                value={avgNutrition.calories}
                sub={`of ${CALORIE_TARGET} target`}
                delta={<TargetPct value={avgNutrition.calories} target={CALORIE_TARGET} />}
              />
              <StatTile
                label="Avg water"
                value={`${avgNutrition.water}L`}
                sub="of 2.5L target"
                delta={<TargetPct value={avgNutrition.water} target={2.5} />}
              />
            </div>
          )}

          {/* Protein/Calorie trend */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <WidgetCard title="Protein Trend" description={`Daily intake vs ${PROTEIN_TARGET}g target`} delay={0.35}>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={nutritionData}>
                  <CartesianGrid {...gridProps()} />
                  <XAxis dataKey="date" {...axisProps()} />
                  <YAxis unit="g" {...axisProps()} />
                  <Tooltip content={<ThemedTooltip />} cursor={{ stroke: cssVar('--border') }} />
                  <Area type="monotone" dataKey="protein" stroke={c1} fill={c1} fillOpacity={0.12} strokeWidth={2} dot={{ r: 3, fill: c1, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </WidgetCard>

            <WidgetCard title="Calorie Trend" description={`Daily intake vs ${CALORIE_TARGET} target`} delay={0.4}>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={nutritionData}>
                  <CartesianGrid {...gridProps()} />
                  <XAxis dataKey="date" {...axisProps()} />
                  <YAxis {...axisProps()} />
                  <Tooltip content={<ThemedTooltip />} cursor={{ stroke: cssVar('--border') }} />
                  <Area type="monotone" dataKey="calories" stroke={c1} fill={c1} fillOpacity={0.12} strokeWidth={2} dot={{ r: 3, fill: c1, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </WidgetCard>
          </div>
        </>
      )}
    </div>
  )
}
