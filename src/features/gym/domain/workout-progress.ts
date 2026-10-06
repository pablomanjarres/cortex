import type { ExerciseLog } from '@/types/gym'

export function summarizeWorkoutSets(logs: ExerciseLog[]) {
  return logs.reduce((summary, exercise) => ({
    totalSets: summary.totalSets + exercise.sets.length,
    completedSets: summary.completedSets + exercise.sets.filter((set) => set.completed).length,
  }), { totalSets: 0, completedSets: 0 })
}

export function setIndexAfterRemoval(currentIndex: number, removedIndex: number, remainingCount: number) {
  return Math.max(0, Math.min(remainingCount - 1, currentIndex > removedIndex ? currentIndex - 1 : currentIndex))
}
