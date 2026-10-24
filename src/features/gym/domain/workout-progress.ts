import type { ExerciseLog, SetLog } from '@/types/gym'
import { completedSets } from './workout-sessions'

export function summarizeWorkoutSets(logs: ExerciseLog[]) {
  return logs.reduce((summary, exercise) => ({
    totalSets: summary.totalSets + exercise.sets.length,
    completedSets: summary.completedSets + completedSets(exercise.sets).length,
  }), { totalSets: 0, completedSets: 0 })
}

export function activeSetIndex(sets: SetLog[], preferredIndex: number) {
  const index = Math.max(0, Math.min(sets.length - 1, preferredIndex))
  if (sets[index] && !sets[index].completed) return index
  const incomplete = sets.findIndex((set) => !set.completed)
  return incomplete === -1 ? index : incomplete
}

export function setIndexAfterRemoval(currentIndex: number, removedIndex: number, remainingSets: SetLog[]) {
  return activeSetIndex(remainingSets, currentIndex > removedIndex ? currentIndex - 1 : currentIndex)
}

/**
 * Where training continues after completing a set: the next open set of the
 * same exercise, else the first open set of a later exercise, else of an
 * earlier one. Stays put when every set is complete.
 */
export function nextSetPosition(logs: ExerciseLog[], exerciseIndex: number, setIndex: number) {
  const sameExercise = logs[exerciseIndex].sets.findIndex((s, i) => i > setIndex && !s.completed)
  if (sameExercise !== -1) return { exerciseIndex, setIndex: sameExercise }
  const hasOpenSet = (ex: ExerciseLog) => ex.sets.some((s) => !s.completed)
  const after = logs.findIndex((ex, i) => i > exerciseIndex && hasOpenSet(ex))
  const target = after !== -1 ? after : logs.findIndex(hasOpenSet)
  if (target === -1) return { exerciseIndex, setIndex }
  return { exerciseIndex: target, setIndex: logs[target].sets.findIndex((s) => !s.completed) }
}

/** The set to show when opening an exercise: its first open set, or the first set. */
export const entrySetIndex = (sets: SetLog[]) => Math.max(0, sets.findIndex((s) => !s.completed))
