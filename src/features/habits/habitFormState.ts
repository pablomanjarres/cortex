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

export const habitSelectClass =
  'rounded-md border border-input bg-input/20 text-foreground outline-none transition-colors duration-150 focus-visible:border-ring/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
