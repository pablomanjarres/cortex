import type { Habit } from '@/lib/habits'

/** Ids of the original uncategorized defaults, replaced by DEFAULT_HABITS. */
export const LEGACY_DEFAULT_HABIT_IDS = ['1', '2', '3', '4', '5', '6', '7']

/** Fallback for `cortex-habits` before the store holds a saved list. */
export const DEFAULT_HABITS: Habit[] = [
  // Hygiene
  { id: 'h1', name: 'Morning routine', emoji: '🚿', weeklyGoal: 7, category: 'Hygiene' },
  // Health
  { id: 'h2', name: 'Workout', emoji: '💪', weeklyGoal: 4, category: 'Health' },
  // Mind
  { id: 'h3', name: 'Journal', emoji: '✍️', weeklyGoal: 7, category: 'Mind' },
  { id: 'h4', name: 'Non-tech reading', emoji: '📖', weeklyGoal: 7, category: 'Mind' },
  // GTM
  { id: 'h5', name: 'Ship something', emoji: '🚀', weeklyGoal: 7, category: 'GTM' },
  { id: 'h6', name: '5+ DMs sent', emoji: '💬', weeklyGoal: 5, category: 'GTM' },
  { id: 'h7', name: 'X engagement', emoji: '🐦', weeklyGoal: 5, category: 'GTM' },
]
