import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { localDate } from '@/lib/date-utils'
import type { WorkoutDay, ActiveWorkoutState, WorkoutSession, ExerciseLog, SetLog } from '@/types/gym'
import { RestTimer } from './RestTimer'
import { ExerciseImage } from './ExerciseImage'
import { platesPerSide } from '@/lib/exercise-media'
import { ChevronLeft, ChevronRight, Check, Plus, Minus, Dumbbell, Flag, X } from 'lucide-react'

interface TrainingModeProps {
  activeWorkout: ActiveWorkoutState
  plan: WorkoutDay
  onUpdate: (state: ActiveWorkoutState) => void
  onFinish: (session: WorkoutSession) => void
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

export function TrainingMode({ activeWorkout, plan, onUpdate, onFinish, previousSession }: TrainingModeProps) {
  const [restTimeLeft, setRestTimeLeft] = useState(0)
  const [confirmFinish, setConfirmFinish] = useState(false)
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
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-4 pb-40">
      {/* ── Header ── */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/10">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-tight">{plan.name}</h2>
              <p className="text-xs text-muted-foreground">
                {completedSets}/{totalSets} sets · {elapsed}
              </p>
            </div>
          </div>
          {confirmFinish ? (
            <button
              onClick={() => finishSession(activeWorkout.exerciseLogs, completedSets === totalSets)}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-red-500 px-4 text-sm font-semibold text-white active:scale-95"
            >
              <Flag className="h-4 w-4" />
              Confirm
            </button>
          ) : (
            <button
              onClick={() => {
                setConfirmFinish(true)
                setTimeout(() => setConfirmFinish(false), 3000)
              }}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground active:scale-95"
            >
              <Flag className="h-4 w-4" />
              Finish
            </button>
          )}
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full rounded-full bg-green-400 transition-all duration-500" style={{ width: `${overallPct}%` }} />
        </div>
      </div>

      {/* ── Exercise pager (tap to jump) ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {plan.exercises.map((ex, ei) => {
          const log = activeWorkout.exerciseLogs[ei]
          const done = log.sets.length > 0 && log.sets.every((s) => s.completed)
          const isCurrent = ei === idx
          return (
            <button
              key={ex.id}
              onClick={() => goToExercise(ei)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                isCurrent
                  ? 'border-foreground/30 bg-foreground text-background'
                  : done
                    ? 'border-green-500/30 bg-green-500/10 text-green-400'
                    : 'border-border bg-card text-muted-foreground'
              }`}
            >
              {done && <Check className="h-3 w-3" />}
              <span className="max-w-[9rem] truncate">{ex.name}</span>
            </button>
          )
        })}
      </div>

      {/* ── Current exercise ── */}
      {currentExercise && (
        <div className="overflow-hidden rounded-2xl border border-foreground/15 bg-card">
          {/* nav + title */}
          <div className="flex items-center gap-2 border-b border-border/60 p-3">
            <button
              onClick={() => goToExercise(idx - 1)}
              disabled={idx === 0}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground disabled:opacity-30 active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <h3 className="truncate text-base font-semibold">{currentExercise.name}</h3>
              <p className="text-xs text-muted-foreground">
                Exercise {idx + 1}/{plan.exercises.length} · target {currentExercise.sets}×{currentExercise.repsRange}
              </p>
            </div>
            <button
              onClick={() => goToExercise(idx + 1)}
              disabled={idx === plan.exercises.length - 1}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground disabled:opacity-30 active:scale-95"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* demo media */}
          <ExerciseImage name={currentExercise.name} className="h-44 w-full sm:h-52" />

          {currentExercise.notes && <p className="px-4 pt-3 text-xs text-muted-foreground/80">{currentExercise.notes}</p>}

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
                    className="flex w-full items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-left active:scale-[0.99]"
                  >
                    <Check className="h-5 w-5 shrink-0 text-green-400" />
                    <span className="w-12 shrink-0 text-sm font-medium text-muted-foreground">Set {si + 1}</span>
                    <span className="text-lg font-bold tabular-nums text-green-400">
                      {set.weight}
                      <span className="text-sm font-normal text-muted-foreground"> kg</span> × {set.reps}
                    </span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/50">tap to edit</span>
                  </button>
                )
              }
              const isCurrent = si === activeWorkout.currentSetIndex
              return (
                <div
                  key={si}
                  className={`rounded-xl border px-3 py-3 ${isCurrent ? 'border-foreground/30 bg-foreground/[0.06]' : 'border-border/70 bg-background/40'}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold">Set {si + 1}</span>
                    {prev?.completed ? (
                      <span className="text-[11px] text-muted-foreground/60">
                        last: {prev.weight}kg × {prev.reps}
                      </span>
                    ) : (
                      currentExLog.sets.length > 1 && (
                        <button onClick={() => removeSet(si)} className="text-muted-foreground/40 active:text-red-400">
                          <X className="h-4 w-4" />
                        </button>
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
                    <span className="text-muted-foreground/40">×</span>
                    {/* reps stepper */}
                    <Stepper
                      value={set.reps}
                      unit="reps"
                      onDec={() => adjust(si, 'reps', -1)}
                      onInc={() => adjust(si, 'reps', 1)}
                      onChange={(v) => setValue(si, 'reps', v)}
                    />
                    {/* complete */}
                    <button
                      onClick={() => completeSet(si)}
                      aria-label={`Complete set ${si + 1}`}
                      className="ml-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background transition-transform active:scale-90"
                    >
                      <Check className="h-7 w-7" />
                    </button>
                  </div>
                  {plates.length > 0 && (
                    <p className="mt-2 text-[11px] text-muted-foreground/60">
                      plates/side: <span className="font-medium text-muted-foreground">{plates.join(' · ')}</span>
                    </p>
                  )}
                </div>
              )
            })}

            <button
              onClick={addSet}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground active:scale-[0.99]"
            >
              <Plus className="h-4 w-4" />
              Add set
            </button>
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
      <button
        onClick={onDec}
        aria-label={`Decrease ${unit}`}
        className="flex h-12 w-9 items-center justify-center rounded-lg bg-secondary text-foreground transition-transform active:scale-90"
      >
        <Minus className="h-4 w-4" />
      </button>
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
          className="w-14 bg-transparent text-center text-2xl font-bold tabular-nums outline-none"
        />
        <span className="-mt-1 text-[9px] uppercase tracking-wide text-muted-foreground/50">{unit}</span>
      </div>
      <button
        onClick={onInc}
        aria-label={`Increase ${unit}`}
        className="flex h-12 w-9 items-center justify-center rounded-lg bg-secondary text-foreground transition-transform active:scale-90"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
