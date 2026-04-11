import { useState, useEffect, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useStore, readStore } from '@/lib/store'
import { localDate, getWeekDates } from '@/lib/date-utils'
import type {
  WorkoutDay,
  ActiveWorkoutState,
  WorkoutSession,
  DailyNutrition,
  BodyStats,
  NutritionTargets,
} from '@/types/gym'
import { DEFAULT_WORKOUT_PLANS, EMPTY_DAILY_NUTRITION, DEFAULT_NUTRITION_TARGETS } from '@/types/gym'
import { WorkoutPlan } from './components/WorkoutPlan'
import { TrainingMode } from './components/TrainingMode'
import { NutritionLog } from './components/NutritionLog'
import { Analytics } from './components/Analytics'
import { MarketLog } from './components/MarketLog'
import { WeeklyStats } from './components/WeeklyStats'
import { HardBans } from './components/HardBans'
import { MealPlan } from './components/MealPlan'

// Normalize stored session data: migrates old single-session format to array
function normalizeSessions(data: unknown): WorkoutSession[] {
  if (!data) return []
  if (Array.isArray(data)) return data as WorkoutSession[]
  if (typeof data === 'object' && data !== null && 'workoutDayId' in data) return [data as WorkoutSession]
  return []
}

export function GymPage() {
  const today = localDate()
  const [plans, setPlans] = useStore<WorkoutDay[]>('cortex-gym-plans', DEFAULT_WORKOUT_PLANS)
  const [activeWorkout, setActiveWorkout] = useStore<ActiveWorkoutState | null>('cortex-gym-active', null)
  const [todaySessionsRaw, setTodaySessions] = useStore<WorkoutSession[] | null>(`cortex-gym-session-${today}`, null)
  const [nutrition, setNutrition] = useStore<DailyNutrition>(`cortex-nutrition-${today}`, { ...EMPTY_DAILY_NUTRITION, date: today })
  const [bodyStats, setBodyStats] = useStore<BodyStats[]>('cortex-body-stats', [])
  const [targets, setTargets] = useStore<NutritionTargets>('cortex-nutrition-targets', DEFAULT_NUTRITION_TARGETS)

  // Normalize: handles migration from old single-session format
  const todaySessions = useMemo(() => normalizeSessions(todaySessionsRaw), [todaySessionsRaw])

  // Load this week's sessions (flat list across all days)
  const [weekSessions, setWeekSessions] = useState<WorkoutSession[]>([])
  const weekDates = getWeekDates(today)

  useEffect(() => {
    Promise.all(
      weekDates.map(d => readStore<unknown>(`cortex-gym-session-${d}`, null))
    ).then(results => {
      const all: WorkoutSession[] = []
      for (const r of results) all.push(...normalizeSessions(r))
      setWeekSessions(all)
    })
  }, [todaySessions])

  // Load previous session for the same workout day (for reference weights)
  const [previousSession, setPreviousSession] = useState<WorkoutSession | null>(null)

  useEffect(() => {
    if (!activeWorkout) { setPreviousSession(null); return }
    const loadPrevious = async () => {
      const d = new Date()
      for (let i = 1; i <= 60; i++) {
        d.setDate(d.getDate() - 1)
        const dateStr = localDate(d)
        const raw = await readStore<unknown>(`cortex-gym-session-${dateStr}`, null)
        const match = normalizeSessions(raw).find(s => s.workoutDayId === activeWorkout.workoutDayId)
        if (match) {
          setPreviousSession(match)
          return
        }
      }
      setPreviousSession(null)
    }
    loadPrevious()
  }, [activeWorkout?.workoutDayId])

  const startWorkout = (dayId: string) => {
    const plan = plans.find(p => p.id === dayId)
    if (!plan) return
    const state: ActiveWorkoutState = {
      workoutDayId: dayId,
      startedAt: new Date().toISOString(),
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      exerciseLogs: plan.exercises.map(ex => ({
        exerciseId: ex.id,
        exerciseName: ex.name,
        sets: Array.from({ length: ex.sets }, () => ({ weight: 0, reps: 0, completed: false })),
      })),
      restTimerEnd: null,
      restDuration: 90,
      isResting: false,
    }
    setActiveWorkout(() => state)
  }

  const finishWorkout = (session: WorkoutSession) => {
    setTodaySessions(() => [session])
    setActiveWorkout(() => null)
  }

  const logSwim = (dayId: string, duration: number) => {
    const session: WorkoutSession = {
      date: today,
      workoutDayId: dayId,
      workoutName: 'SWIM',
      exercises: [{
        exerciseId: 'swim',
        exerciseName: 'Swimming',
        sets: [{ weight: 0, reps: duration, completed: true }],
      }],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      completedFully: true,
    }
    setTodaySessions(() => [session])
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gym</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Training, nutrition, market & analytics</p>
        </div>
      </div>

      <Tabs defaultValue="training">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
          <TabsTrigger value="market">Market</TabsTrigger>
          <TabsTrigger value="discipline">Discipline</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="training">
          <WeeklyStats
            plans={plans}
            weekSessions={weekSessions}
            weekDates={weekDates}
            bodyStats={bodyStats}
          />

          {activeWorkout ? (
            <TrainingMode
              activeWorkout={activeWorkout}
              plan={plans.find(p => p.id === activeWorkout.workoutDayId)!}
              onUpdate={(state) => setActiveWorkout(() => state)}
              onFinish={finishWorkout}
              previousSession={previousSession}
            />
          ) : (
            <WorkoutPlan
              plans={plans}
              onUpdatePlans={(p) => setPlans(() => p)}
              onStartWorkout={startWorkout}
              onLogSwim={logSwim}
              onResetSession={(dayId: string) => setTodaySessions(prev => {
                const remaining = normalizeSessions(prev).filter(s => s.workoutDayId !== dayId)
                return remaining.length > 0 ? remaining : null
              })}
              todaySessions={todaySessions}
            />
          )}
        </TabsContent>

        <TabsContent value="nutrition">
          <NutritionLog
            nutrition={nutrition}
            onUpdate={(n) => setNutrition(() => n)}
            bodyStats={bodyStats}
            onUpdateBodyStats={(s) => setBodyStats(() => s)}
            targets={targets}
            onUpdateTargets={(t) => setTargets(() => t)}
          />
          <MealPlan
            nutrition={nutrition}
            onUpdate={(n) => setNutrition(() => n)}
          />
        </TabsContent>

        <TabsContent value="market">
          <MarketLog />
        </TabsContent>

        <TabsContent value="discipline">
          <HardBans />
        </TabsContent>

        <TabsContent value="analytics">
          <Analytics plans={plans} bodyStats={bodyStats} />
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
