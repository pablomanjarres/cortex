import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { localDate } from '@/lib/date-utils'
import type { WorkoutDay, ActiveWorkoutState, WorkoutSession, ExerciseLog } from '@/types/gym'
import { RestTimer } from './RestTimer'
import {
  ChevronRight,
  CheckCircle2,
  Circle,
  ArrowRight,
  Dumbbell,
} from 'lucide-react'
import { Input } from '@/components/ui/input'

interface TrainingModeProps {
  activeWorkout: ActiveWorkoutState
  plan: WorkoutDay
  onUpdate: (state: ActiveWorkoutState) => void
  onFinish: (session: WorkoutSession) => void
  previousSession?: WorkoutSession | null
}

export function TrainingMode({ activeWorkout, plan, onUpdate, onFinish, previousSession }: TrainingModeProps) {
  const [restTimeLeft, setRestTimeLeft] = useState(0)
  const [weightInput, setWeightInput] = useState('')
  const [repsInput, setRepsInput] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerEndRef = useRef<number | null>(activeWorkout.restTimerEnd)

  // Sync ref with state
  useEffect(() => { timerEndRef.current = activeWorkout.restTimerEnd }, [activeWorkout.restTimerEnd])

  // Pre-fill inputs from previous session or plan defaults
  useEffect(() => {
    const exercise = plan.exercises[activeWorkout.currentExerciseIndex]
    if (!exercise) return

    // Try previous session first
    if (previousSession) {
      const prevEx = previousSession.exercises[activeWorkout.currentExerciseIndex]
      const prevSet = prevEx?.sets[activeWorkout.currentSetIndex]
      if (prevSet?.completed) {
        setWeightInput(String(prevSet.weight))
        setRepsInput(String(prevSet.reps))
        return
      }
    }

    // Fall back to plan defaults
    const weightMatch = exercise.startWeight.match(/(\d+)/)
    const repsMatch = exercise.repsRange.match(/(\d+)/)
    if (weightMatch) setWeightInput(weightMatch[1])
    if (repsMatch) setRepsInput(repsMatch[1])
  }, [activeWorkout.currentExerciseIndex, activeWorkout.currentSetIndex, previousSession, plan])

  // Beep when rest finishes
  const playBeep = () => {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.value = 0.3
      osc.start()
      osc.stop(ctx.currentTime + 0.15)
      setTimeout(() => {
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        osc2.frequency.value = 1100
        gain2.gain.value = 0.3
        osc2.start()
        osc2.stop(ctx.currentTime + 0.2)
      }, 200)
    } catch {}
  }

  const notifyRestDone = () => {
    playBeep()
    // macOS notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Rest Over', { body: 'Time for your next set!', silent: true })
    }
    // Pushover → phone
    if (window.electronAPI?.notify) {
      window.electronAPI.notify.pushover('local-done', 'Rest timer done — next set!')
    }
  }

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Rest timer (timestamp-based, survives tab switches)
  useEffect(() => {
    if (!activeWorkout.isResting || !timerEndRef.current) return
    const tick = () => {
      const remaining = Math.max(0, Math.round((timerEndRef.current! - Date.now()) / 1000))
      setRestTimeLeft(remaining)
      if (remaining <= 0) {
        notifyRestDone()
        onUpdate({ ...activeWorkout, isResting: false, restTimerEnd: null })
      }
    }
    tick()
    intervalRef.current = setInterval(tick, 1000)
    const onVisibility = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [activeWorkout.isResting, activeWorkout.restTimerEnd])

  // Elapsed workout time
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    const tick = () => {
      const diff = Date.now() - new Date(activeWorkout.startedAt).getTime()
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setElapsed(`${m}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeWorkout.startedAt])

  const currentExercise = plan.exercises[activeWorkout.currentExerciseIndex]
  const currentExLog = activeWorkout.exerciseLogs[activeWorkout.currentExerciseIndex]
  const prevExercise = previousSession?.exercises[activeWorkout.currentExerciseIndex]

  const completeSet = () => {
    const weight = Number(weightInput) || 0
    const reps = Number(repsInput) || 0
    const logs = activeWorkout.exerciseLogs.map((ex, ei) => {
      if (ei !== activeWorkout.currentExerciseIndex) return ex
      return {
        ...ex,
        sets: ex.sets.map((s, si) =>
          si !== activeWorkout.currentSetIndex ? s : { weight, reps, completed: true }
        ),
      }
    })

    const nextSetIndex = activeWorkout.currentSetIndex + 1
    const setsInExercise = currentExercise.sets
    const isLastSet = nextSetIndex >= setsInExercise
    const nextExerciseIndex = activeWorkout.currentExerciseIndex + 1
    const isLastExercise = nextExerciseIndex >= plan.exercises.length

    if (isLastSet && isLastExercise) {
      // Workout complete
      finishSession(logs, true)
      return
    }

    const restEnd = Date.now() + activeWorkout.restDuration * 1000
    onUpdate({
      ...activeWorkout,
      exerciseLogs: logs,
      currentExerciseIndex: isLastSet ? nextExerciseIndex : activeWorkout.currentExerciseIndex,
      currentSetIndex: isLastSet ? 0 : nextSetIndex,
      restTimerEnd: restEnd,
      isResting: true,
    })
    setWeightInput('')
    setRepsInput('')
  }

  const skipRest = () => {
    onUpdate({ ...activeWorkout, isResting: false, restTimerEnd: null })
  }

  const changeRestDuration = (seconds: number) => {
    const newEnd = Date.now() + seconds * 1000
    onUpdate({
      ...activeWorkout,
      restDuration: seconds,
      restTimerEnd: newEnd,
    })
  }

  const finishSession = (logs: ExerciseLog[], completedFully: boolean) => {
    const session: WorkoutSession = {
      date: localDate(),
      workoutDayId: activeWorkout.workoutDayId,
      workoutName: plan.name,
      exercises: logs,
      startedAt: activeWorkout.startedAt,
      finishedAt: new Date().toISOString(),
      completedFully,
    }
    onFinish(session)
  }

  const finishEarly = () => {
    finishSession(activeWorkout.exerciseLogs, false)
  }

  // Calculate total completed sets
  const totalSets = activeWorkout.exerciseLogs.reduce((s, ex) => s + ex.sets.length, 0)
  const completedSets = activeWorkout.exerciseLogs.reduce(
    (s, ex) => s + ex.sets.filter(set => set.completed).length, 0
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/10">
            <Dumbbell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{plan.name} Day</h2>
            <p className="text-xs text-muted-foreground">
              {completedSets}/{totalSets} sets · {elapsed}
            </p>
          </div>
        </div>
        <button
          onClick={finishEarly}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
        >
          Finish Early
        </button>
      </div>

      {/* Rest timer overlay */}
      {activeWorkout.isResting && (
        <div className="rounded-xl border border-border bg-card">
          <RestTimer
            timeLeft={restTimeLeft}
            totalTime={activeWorkout.restDuration}
            onSkip={skipRest}
            onChangeDuration={changeRestDuration}
            currentDuration={activeWorkout.restDuration}
          />
        </div>
      )}

      {/* Current exercise */}
      {currentExercise && !activeWorkout.isResting && (
        <div className="rounded-xl border border-foreground/20 bg-card p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold">{currentExercise.name}</h3>
            <p className="text-xs text-muted-foreground">
              {currentExercise.sets}x{currentExercise.repsRange}
              {currentExercise.notes && ` · ${currentExercise.notes}`}
            </p>
          </div>

          {/* Sets progress */}
          <div className="space-y-2">
            {currentExLog.sets.map((set, si) => (
              <div
                key={si}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  si === activeWorkout.currentSetIndex
                    ? 'bg-foreground/10 border border-foreground/20'
                    : set.completed
                    ? 'text-muted-foreground/60'
                    : 'text-muted-foreground/30'
                }`}
              >
                {set.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                ) : si === activeWorkout.currentSetIndex ? (
                  <ArrowRight className="h-4 w-4 text-foreground shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0" />
                )}
                <span className="w-12 shrink-0 font-medium">Set {si + 1}</span>
                {set.completed ? (
                  <span>{set.weight}kg x {set.reps}</span>
                ) : si === activeWorkout.currentSetIndex ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="number"
                      placeholder="kg"
                      value={weightInput}
                      onChange={(e) => setWeightInput(e.target.value)}
                      className="h-7 w-16 text-xs"
                      onKeyDown={(e) => e.key === 'Enter' && (document.getElementById('reps-input') as HTMLInputElement)?.focus()}
                    />
                    <span className="text-muted-foreground/50">x</span>
                    <Input
                      id="reps-input"
                      type="number"
                      placeholder="reps"
                      value={repsInput}
                      onChange={(e) => setRepsInput(e.target.value)}
                      className="h-7 w-16 text-xs"
                      onKeyDown={(e) => e.key === 'Enter' && completeSet()}
                    />
                    {prevExercise?.sets[si]?.completed && (
                      <span className="text-xs text-muted-foreground/40 ml-1">
                        prev: {prevExercise.sets[si].weight}kg x {prevExercise.sets[si].reps}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground/30">-</span>
                )}
              </div>
            ))}
          </div>

          {/* Complete set button */}
          <button
            onClick={completeSet}
            className="w-full rounded-lg bg-foreground py-3 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors"
          >
            Done with set
          </button>
        </div>
      )}

      {/* Exercise progress sidebar */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3">
          Exercises
        </h4>
        <div className="space-y-1.5">
          {plan.exercises.map((ex, ei) => {
            const exLog = activeWorkout.exerciseLogs[ei]
            const completedCount = exLog.sets.filter(s => s.completed).length
            const isCurrent = ei === activeWorkout.currentExerciseIndex
            const isDone = completedCount === ex.sets

            return (
              <div
                key={ex.id}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
                  isCurrent ? 'bg-foreground/10 text-foreground font-medium' :
                  isDone ? 'text-green-400/60' : 'text-muted-foreground/40'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                ) : isCurrent ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="flex-1 truncate">{ex.name}</span>
                <span className="text-xs tabular-nums">{completedCount}/{ex.sets}</span>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}
