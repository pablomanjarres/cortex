import { useMemo, useCallback } from 'react'
import { useStore } from './store'

/**
 * Single source of truth for daily habit completion.
 * Reads from cortex-habits-history (the primary store).
 * Both DailyPage and HabitsPage should use this hook.
 */
export function useDailyHabits(date: string) {
  const [habitHistory, updateHabitHistory] = useStore<Record<string, Record<string, boolean>>>('cortex-habits-history', {})

  const completedMap = useMemo(() => habitHistory[date] || {}, [habitHistory, date])

  const completedCount = useMemo(
    () => Object.values(completedMap).filter(Boolean).length,
    [completedMap]
  )

  const isCompleted = useCallback(
    (habitId: string) => !!completedMap[habitId],
    [completedMap]
  )

  const toggle = useCallback(
    (habitId: string) => {
      updateHabitHistory((prev) => ({
        ...prev,
        [date]: {
          ...prev[date],
          [habitId]: !prev[date]?.[habitId],
        },
      }))
    },
    [date, updateHabitHistory]
  )

  return { completedMap, completedCount, isCompleted, toggle, habitHistory, updateHabitHistory }
}
