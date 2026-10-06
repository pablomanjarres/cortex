import { getWeekDates, localDate } from '@/lib/date-utils'
import type { WorkoutDay } from '@/types/gym'

export function workoutWeek(plans: WorkoutDay[], today = new Date()) {
  const dates = getWeekDates(localDate(today))
  const weekdays = dates.map((date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' }))
  const days = dates.flatMap((date, index) => {
    const scheduled = plans.filter((plan) => plan.dayOfWeek.trim().toLowerCase() === weekdays[index].toLowerCase())
    return (scheduled.length ? scheduled : [null]).map((plan) => ({ date: date as string | null, weekday: weekdays[index], plan }))
  })
  const custom = plans.filter((plan) => !weekdays.some((weekday) => weekday.toLowerCase() === plan.dayOfWeek.trim().toLowerCase()))
  return [...days, ...custom.map((plan) => ({ date: null, weekday: plan.dayOfWeek, plan }))]
}
