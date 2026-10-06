import { motion, useReducedMotion } from 'framer-motion'
import { localDate } from '@/lib/date-utils'
import type { WorkoutDay, ActiveWorkoutState, WorkoutSession, ExerciseLog, SetLog } from '@/types/gym'
import { RestTimer } from './RestTimer'
import { TrainingHeader } from './TrainingHeader'
import { haptic } from '../domain/training-feedback'
import { useTrainingClock } from '../hooks/use-training-clock'
import { useSetDefaults } from '../hooks/use-set-defaults'
import { setIndexAfterRemoval, summarizeWorkoutSets } from '../domain/workout-progress'
import { ExerciseNavigator } from './ExerciseNavigator'
import { ExerciseGuide } from './ExerciseGuide'
import { SetEntry } from './SetEntry'
import { Button } from '@/components/ui/button'
import { Check, Plus } from 'lucide-react'

interface TrainingModeProps {
  activeWorkout: ActiveWorkoutState
  plan: WorkoutDay
  onUpdate: (state: ActiveWorkoutState) => void
  onFinish: (session: WorkoutSession) => void
  onCancel: () => void
  previousSession?: WorkoutSession | null
}


export function TrainingMode({ activeWorkout, plan, onUpdate, onFinish, onCancel, previousSession }: TrainingModeProps) {
  const reduceMotion = useReducedMotion()
  const { elapsed, restTimeLeft } = useTrainingClock(activeWorkout, onUpdate)
  const markSetEdited = useSetDefaults(activeWorkout, plan, previousSession, onUpdate)

  const idx = activeWorkout.currentExerciseIndex
  const currentExLog = activeWorkout.exerciseLogs[idx]
  const currentExercise = plan.exercises.find((exercise) => exercise.id === currentExLog?.exerciseId)
  const prevExercise = previousSession?.exercises.find((exercise) => exercise.exerciseId === currentExLog?.exerciseId)


  // ── Mutations ──────────────────────────────────────────────
  const patchSets = (mut: (sets: SetLog[]) => SetLog[], extra?: Partial<ActiveWorkoutState>) => {
    const logs = activeWorkout.exerciseLogs.map((ex, ei) => (ei === idx ? { ...ex, sets: mut(ex.sets) } : ex))
    onUpdate({ ...activeWorkout, exerciseLogs: logs, ...extra })
  }

  const setValue = (si: number, field: 'weight' | 'reps', value: number) => {
    markSetEdited(currentExLog.exerciseId, si)
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
    markSetEdited(currentExLog.exerciseId, si)
    patchSets((sets) => sets.map((s, i) => (i === si ? { ...s, completed: false } : s)), { currentSetIndex: si })
  }

  const addSet = () => {
    haptic(8)
    const last = currentExLog.sets[currentExLog.sets.length - 1]
    patchSets((sets) => [...sets, { weight: last?.weight || 0, reps: last?.reps || 0, completed: false }])
  }
  const removeSet = (si: number) => {
    if (currentExLog.sets.length <= 1) return
    haptic(8)
    currentExLog.sets.forEach((_, index) => markSetEdited(currentExLog.exerciseId, index))
    patchSets((sets) => sets.filter((_, i) => i !== si), {
      currentSetIndex: setIndexAfterRemoval(activeWorkout.currentSetIndex, si, currentExLog.sets.length - 1),
    })
  }

  const goToExercise = (ei: number) => {
    if (ei < 0 || ei >= plan.exercises.length) return
    const log = activeWorkout.exerciseLogs[ei]
    if (!log) return
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

  const { totalSets, completedSets } = summarizeWorkoutSets(activeWorkout.exerciseLogs)

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <TrainingHeader
        name={plan.name} elapsed={elapsed} completedSets={completedSets} totalSets={totalSets}
        onFinish={() => finishSession(activeWorkout.exerciseLogs, completedSets === totalSets)}
        onDiscard={onCancel}
      />

      <ExerciseNavigator plan={plan} logs={activeWorkout.exerciseLogs} index={idx} onSelect={goToExercise} />

      {currentExercise && currentExLog && (
        <div className="surface rounded-xl">
          <div className="p-5 pb-2 sm:p-6 sm:pb-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Exercise {idx + 1} of {activeWorkout.exerciseLogs.length}</p>
            <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{currentExercise.name}</h3>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{currentExercise.sets} sets · {currentExercise.repsRange} reps</p>
              <ExerciseGuide exercise={currentExercise} />
            </div>
          </div>

          {/* set rows */}
          <div className="space-y-2.5 p-3">
            {currentExLog.sets.map((set, si) => {
              const prev = prevExercise?.sets[si]
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
              if (si !== activeWorkout.currentSetIndex) return (
                <Button key={si} variant="outline" className="h-auto min-h-12 w-full justify-between px-4 py-3" onClick={() => onUpdate({ ...activeWorkout, currentSetIndex: si })}>
                  <span>Set {si + 1}</span><span className="text-muted-foreground">{set.weight} kg × {set.reps}</span>
                </Button>
              )
              return <SetEntry key={si} index={si} count={currentExLog.sets.length} set={set} previous={prev}
                onChange={(field, value) => setValue(si, field, value)} onAdjust={(field, delta) => adjust(si, field, delta)} onComplete={() => completeSet(si)} />
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

