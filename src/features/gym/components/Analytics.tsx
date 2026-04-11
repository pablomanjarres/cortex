import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { readStore } from '@/lib/store'
import { getLastNDays } from '@/lib/date-utils'
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
import { TrendingUp, Activity, Scale, Target, Zap, Flame, Utensils } from 'lucide-react'

interface AnalyticsProps {
  plans: WorkoutDay[]
  bodyStats: BodyStats[]
}

const RANGE_OPTIONS = [7, 14, 30, 90]
const TOOLTIP_STYLE = { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 11 }
const COLORS: Record<string, string> = { PUSH: '#60a5fa', PULL: '#34d399', LEGS: '#fbbf24', SWIM: '#22d3ee' }

export function Analytics({ bodyStats }: AnalyticsProps) {
  const [range, setRange] = useState(30)
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [nutritionDays, setNutritionDays] = useState<DailyNutrition[]>([])
  const [selectedExercise, setSelectedExercise] = useState('')

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
    return { date: s.date.slice(5), sets: totalSets, volume: totalVolume, type: s.workoutName, fill: COLORS[s.workoutName] || '#888' }
  }), [sessions])

  // Weight trend
  const weightData = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - range)
    return bodyStats.filter(s => new Date(s.date) >= cutoff).sort((a, b) => a.date.localeCompare(b.date)).map(s => ({ date: s.date.slice(5), weight: s.weight }))
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
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count, fill: COLORS[name] || '#888' }))
  }, [sessions])

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

  // Weekly streak
  const weeklyStreak = useMemo(() => {
    let streak = 0
    const now = new Date()
    for (let w = 0; w < 12; w++) {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - (now.getDay() + 6) % 7 - w * 7)
      const weekSessions = sessions.filter(s => {
        const d = new Date(s.date)
        return d >= weekStart && d < new Date(weekStart.getTime() + 7 * 86400000)
      })
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
          <button key={r} onClick={() => setRange(r)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r ? 'bg-foreground text-background' : 'bg-foreground/10 text-muted-foreground hover:bg-foreground/20'}`}
          >{r}d</button>
        ))}
      </div>

      {/* KPI cards — always show */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <Target className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold tabular-nums">{completionRate}%</p>
          <p className="text-[10px] text-muted-foreground">Completion</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <Activity className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold tabular-nums">{sessions.length}</p>
          <p className="text-[10px] text-muted-foreground">Sessions ({range}d)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <TrendingUp className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold tabular-nums">{totalSets}</p>
          <p className="text-[10px] text-muted-foreground">Total Sets</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <Zap className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold tabular-nums">{totalVolume > 0 ? `${Math.round(totalVolume / 1000)}K` : '0'}</p>
          <p className="text-[10px] text-muted-foreground">Volume (kg)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <Scale className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold tabular-nums">{bodyStats.length > 0 ? `${bodyStats[bodyStats.length - 1].weight}kg` : '-'}</p>
          <p className="text-[10px] text-muted-foreground">Current Weight</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <Flame className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold tabular-nums">{weeklyStreak}</p>
          <p className="text-[10px] text-muted-foreground">Week Streak</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-border bg-card p-8 text-center">
          <Activity className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No workout data yet.</p>
          <p className="text-xs text-muted-foreground/50 mt-1">Complete a workout to see charts.</p>
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Progressive Overload */}
            <WidgetCard title="Progressive Overload" description="Max weight per session" delay={0.05}>
              <div className="mb-3">
                <select value={selectedExercise} onChange={(e) => setSelectedExercise(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground">
                  {exerciseNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              {overloadData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={overloadData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#555" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#555" unit="kg" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="weight" stroke="#fff" fill="#fff" fillOpacity={0.1} strokeWidth={2} dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground/40 py-8 text-center">No data for this exercise</p>
              )}
            </WidgetCard>

            {/* Volume per Session */}
            <WidgetCard title="Volume per Session" description="Total completed sets" delay={0.1}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#555" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#555" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#555" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#555" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="volume" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.1} strokeWidth={2} dot={{ r: 3 }} />
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
                      <span className="text-xs font-medium w-12" style={{ color: fill }}>{name}</span>
                      <div className="flex-1 h-6 rounded-md bg-foreground/5 overflow-hidden">
                        <div className="h-full rounded-md transition-all duration-500 flex items-center px-2"
                          style={{ width: `${Math.max(10, (count / sessions.length) * 100)}%`, backgroundColor: fill + '30', borderLeft: `3px solid ${fill}` }}>
                          <span className="text-xs font-medium tabular-nums">{count}</span>
                        </div>
                      </div>
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
                  <div key={name} className="flex items-center justify-between rounded-lg bg-foreground/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate text-foreground">{name}</p>
                      <p className="text-[10px] text-muted-foreground/50">{pr.date}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-bold tabular-nums">{pr.weight}kg</p>
                      <p className="text-[10px] text-muted-foreground/50">{pr.reps} reps</p>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#555" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#555" unit="kg" domain={['dataMin - 1', 'dataMax + 1']} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="weight" stroke="#60a5fa" strokeWidth={2} dot={{ r: 4, fill: '#60a5fa' }} />
                </LineChart>
              </ResponsiveContainer>
            </WidgetCard>
          )}
        </>
      )}

      {/* Nutrition Analytics — always show if data exists */}
      {nutritionData.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <Utensils className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Nutrition Analytics</h3>
            <span className="text-xs text-muted-foreground">({nutritionData.length} days tracked)</span>
          </div>

          {/* Nutrition KPIs */}
          {avgNutrition && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-xl font-bold tabular-nums">{avgNutrition.protein}g</p>
                <p className="text-[10px] text-muted-foreground">Avg Protein ({PROTEIN_TARGET}g target)</p>
                <div className="h-1 rounded-full bg-foreground/10 mt-1.5">
                  <div className={`h-full rounded-full ${avgNutrition.protein >= PROTEIN_TARGET ? 'bg-green-400' : 'bg-foreground/30'}`}
                    style={{ width: `${Math.min(100, (avgNutrition.protein / PROTEIN_TARGET) * 100)}%` }} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-xl font-bold tabular-nums">{avgNutrition.calories}</p>
                <p className="text-[10px] text-muted-foreground">Avg Calories ({CALORIE_TARGET} target)</p>
                <div className="h-1 rounded-full bg-foreground/10 mt-1.5">
                  <div className={`h-full rounded-full ${avgNutrition.calories >= CALORIE_TARGET ? 'bg-green-400' : 'bg-foreground/30'}`}
                    style={{ width: `${Math.min(100, (avgNutrition.calories / CALORIE_TARGET) * 100)}%` }} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-xl font-bold tabular-nums">{avgNutrition.water}L</p>
                <p className="text-[10px] text-muted-foreground">Avg Water (2.5L target)</p>
                <div className="h-1 rounded-full bg-foreground/10 mt-1.5">
                  <div className={`h-full rounded-full ${avgNutrition.water >= 2.5 ? 'bg-blue-400' : 'bg-blue-400/40'}`}
                    style={{ width: `${Math.min(100, (avgNutrition.water / 2.5) * 100)}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Protein/Calorie trend */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <WidgetCard title="Protein Trend" description={`Daily intake vs ${PROTEIN_TARGET}g target`} delay={0.35}>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={nutritionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#555" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#555" unit="g" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="protein" stroke="#34d399" fill="#34d399" fillOpacity={0.1} strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </WidgetCard>

            <WidgetCard title="Calorie Trend" description={`Daily intake vs ${CALORIE_TARGET} target`} delay={0.4}>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={nutritionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#555" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#555" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="calories" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.1} strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </WidgetCard>
          </div>
        </>
      )}
    </div>
  )
}
