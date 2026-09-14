export type HabitHistory = Record<string, Record<string, boolean>>
export const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export async function migrateLegacyHabitHistory(
  grid: HabitHistory,
  dates: string[],
  readHistory: () => Promise<HabitHistory>,
  updateHistory: (update: (prev: HabitHistory) => HabitHistory) => void,
): Promise<void> {
  // Hydration is asynchronous; an empty hook fallback is not proof of an empty store.
  if (Object.keys(await readHistory()).length > 0) return
  const migrated: HabitHistory = {}
  for (const [habitId, days] of Object.entries(grid)) {
    for (const [dayName, done] of Object.entries(days)) {
      const dayIndex = weekDays.indexOf(dayName)
      if (dayIndex < 0 || !done) continue
      const date = dates[dayIndex]
      migrated[date] ??= {}
      migrated[date][habitId] = true
    }
  }
  if (Object.keys(migrated).length > 0) {
    updateHistory((prev) => Object.keys(prev).length > 0 ? prev : migrated)
  }
}
