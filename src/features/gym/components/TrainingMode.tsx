import { useState, useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { localDate } from '@/lib/date-utils'
import type { WorkoutDay, ActiveWorkoutState, WorkoutSession, ExerciseLog, SetLog } from '@/types/gym'
import { RestTimer } from './RestTimer'
import { ExerciseImage } from './ExerciseImage'
import { platesPerSide } from '@/lib/exercise-media'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { ChevronLeft, ChevronRight, Check, Plus, Minus, Dumbbell, Flag, X, Trash2 } from 'lucide-react'

interface TrainingModeProps {
  activeWorkout: ActiveWorkoutState
  plan: WorkoutDay
  onUpdate: (state: ActiveWorkoutState) => void
  onFinish: (session: WorkoutSession) => void
  onCancel: () => void
  previousSession?: WorkoutSession | null
}

const WEIGHT_STEP = 2.5
const haptic = (p: number | number[] = 12) => {
  try {
    navigator.vibrate?.(p)
  } catch {
    /* not supported */
  }
}

export function TrainingMode({ activeWorkout, plan, onUpdate, onFinish, onCancel, previousSession }: TrainingModeProps) {
  const reduceMotion = useReducedMotion()
  const [restTimeLeft, setRestTimeLeft] = useState(0)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [elapsed, setElapsed] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerEndRef = useRef<number | null>(activeWorkout.restTimerEnd)

  const idx = activeWorkout.currentExerciseIndex
  const currentExercise = plan.exercises[idx]
  const currentExLog = activeWorkout.exerciseLogs[idx]
  const prevExercise = previousSession?.exercises[idx]

  useEffect(() => {
    timerEndRef.current = activeWorkout.restTimerEnd
  }, [activeWorkout.restTimerEnd])

  // Seed still-empty (0/0, not completed) sets of the current exercise with last session's
  // values, or the plan's default weight/reps — so logging is confirm-not-type.
  useEffect(() => {
    const log = activeWorkout.exerciseLogs[idx]
    const planEx = plan.exercises[idx]
    if (!log || !planEx) return
    const prevEx = previousSession?.exercises[idx]
    const dw = Number(planEx.startWeight.match(/(\d+)/)?.[1] || 0)
    const dr = Number(planEx.repsRange.match(/(\d+)/)?.[1] || 0)
    let changed = false
    const sets = log.sets.map((s, si) => {
      if (s.completed || s.weight || s.reps) return s
      const prev = prevEx?.sets[si]
      const weight = prev?.completed ? prev.weight : dw
      const reps = prev?.completed ? prev.reps : dr
      if (weight !== s.weight || reps !== s.reps) changed = true
      return { ...s, weight, reps }
    })
    if (changed) {
      onUpdate({ ...activeWorkout, exerciseLogs: activeWorkout.exerciseLogs.map((ex, ei) => (ei === idx ? { ...ex, sets } : ex)) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  // Rest-finished feedback
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
    } catch {
      /* no audio */
    }
  }

  const notifyRestDone = () => {
    playBeep()
    haptic([140, 70, 140])
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Rest Over', { body: 'Time for your next set!', silent: true })
    }
    if (window.electronAPI?.notify) {
      window.electronAPI.notify.pushover('local-done', 'Rest timer done — next set!')
    }
  }

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Rest countdown (timestamp-based, survives tab switches)
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
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkout.isResting, activeWorkout.restTimerEnd])

  // Elapsed workout clock
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

  // ── Mutations ──────────────────────────────────────────────
  const patchSets = (mut: (sets: SetLog[]) => SetLog[], extra?: Partial<ActiveWorkoutState>) => {
    const logs = activeWorkout.exerciseLogs.map((ex, ei) => (ei === idx ? { ...ex, sets: mut(ex.sets) } : ex))
    onUpdate({ ...activeWorkout, exerciseLogs: logs, ...extra })
  }

  const setValue = (si: number, field: 'weight' | 'reps', value: number) => {
    patchSets((sets) => sets.map((s, i) => (i === si ? { ...s, [field]: Math.max(0, value) } : s)))
  }
  const adjust = (si: number, field: 'weight' | 'reps', delta: number) => {
    const cur = currentExLog.sets[si]
    setValue(si, field, +((cur[field] || 0) + delta).toFixed(2))
    haptic(8)
  }

  const completeSet = (si: number) => {
    haptic(15)
    const logs = activeWorkout.exerciseLogs.map((ex, ei) =>
      ei === idx ? { ...ex, sets: ex.sets.map((s, i) => (i === si ? { ...s, completed: true } : s)) } : ex,
    )
    const allDone = logs.every((ex) => ex.sets.length > 0 && ex.sets.every((s) => s.completed))
    if (allDone) {
      finishSession(logs, true)
      return
    }
    // Where to move the "current" pointer next
    let nextExIdx = idx
    let nextSetIdx = logs[idx].sets.findIndex((s, i) => i > si && !s.completed)
    if (nextSetIdx === -1) {
      const after = logs.findIndex((ex, ei) => ei > idx && ex.sets.some((s) => !s.completed))
      const target = after !== -1 ? after : logs.findIndex((ex) => ex.sets.some((s) => !s.completed))
      nextExIdx = target === -1 ? idx : target
      nextSetIdx = target === -1 ? si : logs[target].sets.findIndex((s) => !s.completed)
    }
    onUpdate({
      ...activeWorkout,
      exerciseLogs: logs,
      currentExerciseIndex: nextExIdx,
      currentSetIndex: Math.max(0, nextSetIdx),
      restTimerEnd: Date.now() + activeWorkout.restDuration * 1000,
      isResting: true,
    })
  }

  const uncompleteSet = (si: number) => {
    haptic(8)
    patchSets((sets) => sets.map((s, i) => (i === si ? { ...s, completed: false } : s)))
  }

  const addSet = () => {
    haptic(8)
    const last = currentExLog.sets[currentExLog.sets.length - 1]
    patchSets((sets) => [...sets, { weight: last?.weight || 0, reps: last?.reps || 0, completed: false }])
  }
  const removeSet = (si: number) => {
    if (currentExLog.sets.length <= 1) return
    haptic(8)
    patchSets((sets) => sets.filter((_, i) => i !== si))
  }

  const goToExercise = (ei: number) => {
    if (ei < 0 || ei >= plan.exercises.length) return
    const log = activeWorkout.exerciseLogs[ei]
    const firstIncomplete = log.sets.findIndex((s) => !s.completed)
    onUpdate({
      ...activeWorkout,
      currentExerciseIndex: ei,
      currentSetIndex: firstIncomplete < 0 ? 0 : firstIncomplete,
      isResting: false,
      restTimerEnd: null,
    })
  }

  const skipRest = () => onUpdate({ ...activeWorkout, isResting: false, restTimerEnd: null })
  const changeRestDuration = (seconds: number) => onUpdate({ ...activeWorkout, restDuration: seconds, restTimerEnd: Date.now() + seconds * 1000 })
  const adjustRest = (delta: number) => {
    const end = (activeWorkout.restTimerEnd ?? Date.now()) + delta * 1000
    onUpdate({ ...activeWorkout, restTimerEnd: Math.max(Date.now(), end), restDuration: Math.max(15, activeWorkout.restDuration + delta) })
  }

  const finishSession = (logs: ExerciseLog[], completedFully: boolean) => {
    onFinish({
      date: localDate(),
      workoutDayId: activeWorkout.workoutDayId,
      workoutName: plan.name,
      exercises: logs,
      startedAt: activeWorkout.startedAt,
      finishedAt: new Date().toISOString(),
      completedFully,
    })
  }

  const totalSets = activeWorkout.exerciseLogs.reduce((s, ex) => s + ex.sets.length, 0)
  const completedSets = activeWorkout.exerciseLogs.reduce((s, ex) => s + ex.sets.filter((set) => set.completed).length, 0)
  const overallPct = totalSets ? Math.round((completedSets / totalSets) * 100) : 0
  const isBarbell = /barbell|bench|squat|deadlift|press|row/i.test(currentExercise?.name || '')

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 space-y-4 pb-40"
    >
      {/* ── Header ── */}
      <div className="surface rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-secondary">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-tight text-foreground">{plan.name}</h2>
              <p className="font-mono text-2xs tabular-nums text-muted-foreground">
                {completedSets}/{totalSets} sets · {elapsed}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {confirmCancel ? (
              <Button variant="destructive" className="h-10" onClick={onCancel}>
                <Trash2 />
                Discard?
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => {
                  setConfirmCancel(true)
                  setConfirmFinish(false)
                  setTimeout(() => setConfirmCancel(false), 3000)
                }}
                aria-label="Cancel workout"
              >
                <X className="h-5 w-5" />
              </Button>
            )}
            {confirmFinish ? (
              <Button
                className="h-10 px-4"
                onClick={() => finishSession(activeWorkout.exerciseLogs, completedSets === totalSets)}
              >
                <Flag />
                Finish?
              </Button>
            ) : (
              <Button
                variant="outline"
                className="h-10 px-4"
                onClick={() => {
                  setConfirmFinish(true)
                  setConfirmCancel(false)
                  setTimeout(() => setConfirmFinish(false), 3000)
                }}
              >
                <Flag />
                Finish
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
          <div className="h-full rounded-full bg-success transition-all duration-500" style={{ width: `${overallPct}%` }} />
        </div>
      </div>

      {/* ── Exercise pager (tap to jump) ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {plan.exercises.map((ex, ei) => {
          const log = activeWorkout.exerciseLogs[ei]
          const done = log.sets.length > 0 && log.sets.every((s) => s.completed)
          const isCurrent = ei === idx
          return (
            <Chip
              key={ex.id}
              selectable
              selected={isCurrent}
              variant={done ? 'success' : 'neutral'}
              onClick={() => goToExercise(ei)}
              className="shrink-0 px-3 py-2"
            >
              {done && <Check />}
              <span className="max-w-[9rem] truncate">{ex.name}</span>
            </Chip>
          )
        })}
      </div>

      {/* ── Current exercise ── */}
      {currentExercise && (
        <div className="surface overflow-hidden rounded-xl">
          {/* nav + title */}
          <div className="flex items-center gap-2 border-b border-border/60 p-3">
            <Button
              variant="secondary"
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={() => goToExercise(idx - 1)}
              disabled={idx === 0}
              aria-label="Previous exercise"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1 text-center">
              <h3 className="truncate text-base font-semibold text-foreground">{currentExercise.name}</h3>
              <p className="font-mono text-2xs tabular-nums text-muted-foreground">
                Exercise {idx + 1}/{plan.exercises.length} · target {currentExercise.sets}×{currentExercise.repsRange}
              </p>
            </div>
            <Button
              variant="secondary"
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={() => goToExercise(idx + 1)}
              disabled={idx === plan.exercises.length - 1}
              aria-label="Next exercise"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* demo media */}
          <ExerciseImage name={currentExercise.name} className="h-44 w-full sm:h-52" />

          {currentExercise.notes && <p className="px-4 pt-3 text-xs text-muted-foreground">{currentExercise.notes}</p>}

          {/* set rows */}
          <div className="space-y-2.5 p-3">
            {currentExLog.sets.map((set, si) => {
              const prev = prevExercise?.sets[si]
              const plates = isBarbell ? platesPerSide(set.weight) : []
              if (set.completed) {
                return (
                  <button
                    key={si}
                    onClick={() => uncompleteSet(si)}
                    className="flex w-full items-center gap-3 rounded-md border border-success/25 bg-success/10 px-4 py-3 text-left active:scale-[0.99]"
                  >
                    <Check className="h-5 w-5 shrink-0 text-success" />
                    <span className="w-12 shrink-0 text-sm font-medium text-muted-foreground">Set {si + 1}</span>
                    <span className="font-mono text-lg font-medium tabular-nums text-success">
                      {set.weight}
                      <span className="text-sm font-normal text-muted-foreground"> kg</span> × {set.reps}
                    </span>
                    <span className="ml-auto font-mono text-3xs uppercase tracking-wide text-foreground-faint">tap to edit</span>
                  </button>
                )
              }
              const isCurrent = si === activeWorkout.currentSetIndex
              return (
                <div
                  key={si}
                  className={`relative overflow-hidden rounded-md border px-3 py-3 ${
                    isCurrent
                      ? 'border-border bg-muted/40 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent'
                      : 'border-border/60 bg-background/40'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Set {si + 1}</span>
                    {prev?.completed ? (
                      <span className="font-mono text-2xs tabular-nums text-foreground-faint">
                        last: {prev.weight}kg × {prev.reps}
                      </span>
                    ) : (
                      currentExLog.sets.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => removeSet(si)}
                          aria-label={`Remove set ${si + 1}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X />
                        </Button>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* weight stepper */}
                    <Stepper
                      value={set.weight}
                      unit="kg"
                      onDec={() => adjust(si, 'weight', -WEIGHT_STEP)}
                      onInc={() => adjust(si, 'weight', WEIGHT_STEP)}
                      onChange={(v) => setValue(si, 'weight', v)}
                    />
                    <span className="text-foreground-faint">×</span>
                    {/* reps stepper */}
                    <Stepper
                      value={set.reps}
                      unit="reps"
                      onDec={() => adjust(si, 'reps', -1)}
                      onInc={() => adjust(si, 'reps', 1)}
                      onChange={(v) => setValue(si, 'reps', v)}
                    />
                    {/* complete */}
                    <Button
                      size="icon"
                      className="ml-auto h-14 w-14 shrink-0"
                      onClick={() => completeSet(si)}
                      aria-label={`Complete set ${si + 1}`}
                    >
                      <Check className="h-7 w-7" />
                    </Button>
                  </div>
                  {plates.length > 0 && (
                    <p className="mt-2 font-mono text-2xs text-foreground-faint">
                      plates/side: <span className="tabular-nums text-muted-foreground">{plates.join(' · ')}</span>
                    </p>
                  )}
                </div>
              )
            })}

            <Button variant="outline" className="w-full text-muted-foreground" onClick={addSet}>
              <Plus />
              Add set
            </Button>
          </div>
        </div>
      )}

      {/* ── Sticky rest bar (does not hide the set list) ── */}
      {activeWorkout.isResting && (
        <RestTimer
          timeLeft={restTimeLeft}
          totalTime={activeWorkout.restDuration}
          onSkip={skipRest}
          onAdjust={adjustRest}
          onChangeDuration={changeRestDuration}
          currentDuration={activeWorkout.restDuration}
        />
      )}
    </motion.div>
  )
}

// ── Big +/- stepper with a directly-editable value (steppers handle the common case;
// tapping the number opens the numeric keypad for a precise edit) ──
interface StepperProps {
  value: number
  unit: string
  onDec: () => void
  onInc: () => void
  onChange: (value: number) => void
}
function Stepper({ value, unit, onDec, onInc, onChange }: StepperProps) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="secondary" size="icon" className="h-12 w-9" onClick={onDec} aria-label={`Decrease ${unit}`}>
        <Minus />
      </Button>
      <div className="flex flex-col items-center">
        <input
          type="text"
          inputMode="decimal"
          value={String(value)}
          onChange={(e) => {
            const n = parseFloat(e.target.value.replace(',', '.'))
            onChange(Number.isFinite(n) ? n : 0)
          }}
          onFocus={(e) => e.target.select()}
          className="w-14 bg-transparent text-center font-mono text-2xl font-medium tabular-nums text-foreground"
        />
        <span className="-mt-1 font-mono text-3xs uppercase tracking-wide text-foreground-faint">{unit}</span>
      </div>
      <Button variant="secondary" size="icon" className="h-12 w-9" onClick={onInc} aria-label={`Increase ${unit}`}>
        <Plus />
      </Button>
    </div>
  )
}
