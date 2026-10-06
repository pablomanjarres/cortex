import { motion, useReducedMotion } from 'framer-motion'
import { localDate } from '@/lib/date-utils'
import type { WorkoutDay, ActiveWorkoutState, WorkoutSession, ExerciseLog, SetLog } from '@/types/gym'
import { RestTimer } from './RestTimer'
import { TrainingHeader } from './TrainingHeader'
import { haptic } from '../domain/training-feedback'
import { useTrainingClock } from '../hooks/use-training-clock'
import { useSetDefaults } from '../hooks/use-set-defaults'
import { activeSetIndex, setIndexAfterRemoval, summarizeWorkoutSets } from '../domain/workout-progress'
import { ExerciseNavigator } from './ExerciseNavigator'
import { ExerciseGuide } from './ExerciseGuide'
import { SetEntry } from './SetEntry'
import { SetHistory } from './SetHistory'
import { WorkoutAwakeControl } from './WorkoutAwakeControl'
import { ExerciseImage } from './ExerciseImage'

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
  const setIndex = activeSetIndex(currentExLog?.sets || [], activeWorkout.currentSetIndex)
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

  const completeSet = (si: number, completedAt: number) => {
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
      restTimerEnd: completedAt + activeWorkout.restDuration * 1000,
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
    patchSets((sets) => [...sets, { weight: last?.weight || 0, reps: last?.reps || 0, completed: false }], { currentSetIndex: currentExLog.sets.length })
  }
  const removeSet = (si: number) => {
    if (currentExLog.sets.length <= 1) return
    haptic(8)
    currentExLog.sets.forEach((_, index) => markSetEdited(currentExLog.exerciseId, index))
    patchSets((sets) => sets.filter((_, i) => i !== si), {
      currentSetIndex: setIndexAfterRemoval(setIndex, si, currentExLog.sets.filter((_, index) => index !== si)),
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
        <article className="surface overflow-hidden rounded-xl">
          <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="p-4 pb-0 lg:border-r lg:border-border lg:p-6">
              <div className="flex items-start gap-3 lg:flex-col lg:gap-5">
                <ExerciseImage name={currentExercise.name} showBadge={false} className="h-20 w-20 shrink-0 rounded-md lg:order-last lg:h-72 lg:w-full lg:rounded-xl" />
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold leading-tight tracking-tight sm:text-xl lg:text-3xl">{currentExercise.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{currentExercise.sets} sets × {currentExercise.repsRange} reps</p>
                </div>
              </div>
            </div>
            <div className="p-4 lg:p-6">
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
              {currentExLog.sets[setIndex] && !currentExLog.sets[setIndex].completed ? (
                <SetEntry key={`${idx}:${setIndex}`} index={setIndex} count={currentExLog.sets.length}
                  set={currentExLog.sets[setIndex]} previous={prevExercise?.sets[setIndex]}
                  onChange={(field, value) => setValue(setIndex, field, value)}
                  onAdjust={(field, delta) => adjust(setIndex, field, delta)} onComplete={(completedAt) => completeSet(setIndex, completedAt)} />
              ) : <p className="rounded-lg bg-success/10 p-4 text-sm text-success">All sets logged. Choose another exercise or edit a set below.</p>}
            </div>
          </div>
          <div className="border-t border-border px-4 pb-4 lg:px-6 lg:pb-6">
            <SetHistory sets={currentExLog.sets} currentIndex={setIndex}
              onEdit={uncompleteSet} onRemove={removeSet} onAdd={addSet} />
            <div className="mt-2"><ExerciseGuide exercise={currentExercise} /></div>
            <WorkoutAwakeControl active />
          </div>
        </article>
      )}

    </motion.div>
  )
}
