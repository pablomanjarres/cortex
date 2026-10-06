import type { ExerciseLog, SetLog } from '@/types/gym'

export function summarizeWorkoutSets(logs: ExerciseLog[]) {
  return logs.reduce((summary, exercise) => ({
    totalSets: summary.totalSets + exercise.sets.length,
    completedSets: summary.completedSets + exercise.sets.filter((set) => set.completed).length,
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
