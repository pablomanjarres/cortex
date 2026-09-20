export type HabitCadence = 'weekly' | 'monthly'

export interface Habit {
  id: string
  name: string
  emoji: string
  weeklyGoal?: number
  monthlyGoal?: number
  cadence?: HabitCadence
  category?: string
  context?: string
  onHold?: boolean
}

export function isActiveHabit(habit: Pick<Habit, 'onHold'>): boolean {
  return habit.onHold !== true
}
