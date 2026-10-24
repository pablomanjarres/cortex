import type { SetLog, WorkoutSession } from '@/types/gym'

/** Sessions planned per week; weekly progress and range completion are measured against it. */
export const WEEKLY_SESSION_TARGET = 4

/** Workout names in chart-series order: the n-th type uses the n-th chart color. */
export const WORKOUT_TYPES = ['PUSH', 'PULL', 'LEGS', 'SWIM'] as const

/** Chart-series index for a workout name, or -1 for a custom workout. */
export const workoutTypeIndex = (name: string) => (WORKOUT_TYPES as readonly string[]).indexOf(name)

/**
 * A stored `cortex-gym-session-<date>` value as a session list. Days hold a
 * one-element array; older days hold a single session object.
 */
export function normalizeSessions(data: unknown): WorkoutSession[] {
  if (!data) return []
  if (Array.isArray(data)) return data as WorkoutSession[]
  if (typeof data === 'object' && 'workoutDayId' in data) return [data as WorkoutSession]
  return []
}

export const completedSets = (sets: SetLog[]) => sets.filter((set) => set.completed)

/** Completed sets and lifted volume (weight × reps of completed sets). */
export function sessionStats(sessions: WorkoutSession | WorkoutSession[]): { sets: number; volume: number } {
  const list = Array.isArray(sessions) ? sessions : [sessions]
  let sets = 0
  let volume = 0
  for (const session of list) {
    for (const exercise of session.exercises) {
      for (const set of completedSets(exercise.sets)) {
        sets++
        volume += set.weight * set.reps
      }
    }
  }
  return { sets, volume }
}

/** Volume in thousands of kg, e.g. "12K"; "0" when nothing was lifted. */
export const formatVolumeK = (volume: number) => volume > 0 ? `${Math.round(volume / 1000)}K` : '0'
