import { getWeekDates, localDate } from '@/lib/date-utils'
import type { WorkoutDay } from '@/types/gym'
import { isWorkoutScheduledToday } from './workout-plan'

export function workoutWeek(plans: WorkoutDay[], today = new Date()) {
  const dates = getWeekDates(localDate(today))
  const days = dates.flatMap((date) => {
    const localDay = new Date(`${date}T12:00:00`)
    const weekday = localDay.toLocaleDateString('en-US', { weekday: 'long' })
    const scheduled = plans.filter((plan) => isWorkoutScheduledToday(plan, localDay))
    return (scheduled.length ? scheduled : [null]).map((plan) => ({ date: date as string | null, weekday, plan }))
  })
  const scheduledIds = new Set(days.flatMap((day) => day.plan ? [day.plan.id] : []))
  const custom = plans.filter((plan) => !scheduledIds.has(plan.id))
  return [...days, ...custom.map((plan) => ({ date: null, weekday: plan.dayOfWeek, plan }))]
}
