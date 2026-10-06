import type { ActiveWorkoutState, WorkoutDay } from '@/types/gym'

export function resolveActivePlan(workout: ActiveWorkoutState, plans: WorkoutDay[]): WorkoutDay {
  const savedPlan = plans.find(plan => plan.id === workout.workoutDayId)
  return {
    id: workout.workoutDayId,
    name: savedPlan?.name ?? 'Workout in progress',
    dayOfWeek: savedPlan?.dayOfWeek ?? '',
    time: savedPlan?.time ?? '',
    exercises: workout.exerciseLogs.map(log => savedPlan?.exercises.find(exercise => exercise.id === log.exerciseId) ?? {
      id: log.exerciseId,
      name: log.exerciseName,
      sets: log.sets.length,
      repsRange: '',
      startWeight: '',
      notes: '',
    }),
  }
}
