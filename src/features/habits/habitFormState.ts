import type { Cadence } from '@/lib/habits'

export type HabitDraft = {
  name: string
  emoji: string
  goal: string
  category: string
  cadence: Cadence
}

export const emptyHabitDraft = (): HabitDraft => ({
  name: '',
  emoji: '',
  goal: '',
  category: '',
  cadence: 'weekly',
})
