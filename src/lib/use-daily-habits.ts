import { useMemo, useCallback } from 'react'
import { useStore } from './store'
import { isActiveHabit, type Habit } from './habits'

/**
 * Single source of truth for daily habit completion.
 * Reads from cortex-habits-history (the primary store).
 * Both DailyPage and HabitsPage should use this hook.
 */
export function useDailyHabits(date: string) {
  const [habitHistory, updateHabitHistory] = useStore<Record<string, Record<string, boolean>>>('cortex-habits-history', {})
  const [habits] = useStore<Habit[]>('cortex-habits', [])

  const completedMap = useMemo(() => habitHistory[date] || {}, [habitHistory, date])
  const activeHabitIds = useMemo(
    () => new Set(habits.filter(isActiveHabit).map((habit) => habit.id)),
    [habits]
  )

  const completedCount = useMemo(
    () => [...activeHabitIds].filter((habitId) => completedMap[habitId]).length,
    [activeHabitIds, completedMap]
  )

  const isCompleted = useCallback(
    (habitId: string) => activeHabitIds.has(habitId) && !!completedMap[habitId],
    [activeHabitIds, completedMap]
  )

  const toggle = useCallback(
    (habitId: string) => {
      if (!activeHabitIds.has(habitId)) return
      updateHabitHistory((prev) => ({
        ...prev,
        [date]: {
          ...prev[date],
          [habitId]: !prev[date]?.[habitId],
        },
      }))
    },
    [activeHabitIds, date, updateHabitHistory]
  )

  return { completedMap, completedCount, isCompleted, toggle, habitHistory, updateHabitHistory }
}
