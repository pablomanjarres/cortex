export type Cadence = 'weekly' | 'monthly'

export interface Habit {
  id: string
  name: string
  emoji: string
  weeklyGoal?: number // defaults to 7; 0 means no target this week
  monthlyGoal?: number // defaults to 1; 0 means no target this month
  cadence?: Cadence // defaults to weekly
  category?: string
  context?: string
  onHold?: boolean // saved for later, excluded from active tracking
}

export function isActiveHabit(habit: Pick<Habit, 'onHold'>): boolean {
  return habit.onHold !== true
}
