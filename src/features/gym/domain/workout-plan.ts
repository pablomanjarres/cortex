import type { WorkoutDay } from '@/types/gym'

export function isSwimWorkout(name: string) {
  return name.trim().toUpperCase() === 'SWIM'
}

export function isWorkoutScheduledToday(day: WorkoutDay, date = new Date()) {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' })
  return day.dayOfWeek.trim().toLowerCase() === weekday.toLowerCase()
}

export function getScheduledWorkout(plans: WorkoutDay[], date = new Date()) {
  return plans.find((day) => isWorkoutScheduledToday(day, date)) ?? plans[0]
}
