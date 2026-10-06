import { useEffect, useRef } from 'react'
import type { ActiveWorkoutState, SetLog, WorkoutDay, WorkoutSession } from '@/types/gym'

const firstNumber = (value: string) => Number(value.match(/\d+(?:[.,]\d+)?/)?.[0].replace(',', '.') || 0)
const sameValues = (left: SetLog, right: SetLog) => left.weight === right.weight && left.reps === right.reps

export function useSetDefaults(
  workout: ActiveWorkoutState,
  plan: WorkoutDay,
  previous: WorkoutSession | null | undefined,
  onUpdate: (state: ActiveWorkoutState) => void,
) {
  const seeded = useRef(new Map<string, SetLog>())
  const edited = useRef(new Set<string>())
  const keyFor = (exerciseId: string, index: number) => `${workout.startedAt}:${exerciseId}:${index}`

  useEffect(() => {
    let changed = false
    const exerciseLogs = workout.exerciseLogs.map((log) => {
      const exercise = plan.exercises.find((item) => item.id === log.exerciseId)
      if (!exercise) return log
      const lastExercise = previous?.workoutDayId === workout.workoutDayId
        ? previous.exercises.find((item) => item.exerciseId === log.exerciseId)
        : undefined
      const sets = log.sets.map((set, index) => {
        const key = `${workout.startedAt}:${log.exerciseId}:${index}`
        const seed = seeded.current.get(key)
        if (set.completed || edited.current.has(key) || (seed ? !sameValues(seed, set) : set.weight !== 0 || set.reps !== 0)) return set
        const last = lastExercise?.sets[index]
        const next = {
          ...set,
          weight: last?.completed ? last.weight : firstNumber(exercise.startWeight),
          reps: last?.completed ? last.reps : firstNumber(exercise.repsRange),
        }
        seeded.current.set(key, next)
        if (!sameValues(set, next)) changed = true
        return next
      })
      return { ...log, sets }
    })
    if (changed) onUpdate({ ...workout, exerciseLogs })
  }, [workout, plan, previous, onUpdate])

  return (exerciseId: string, index: number) => edited.current.add(keyFor(exerciseId, index))
}
