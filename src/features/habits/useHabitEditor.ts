import { useState, type Dispatch, type SetStateAction } from 'react'
import type { Habit } from '@/lib/habits'
import { habitCadence, habitGoal, withGoal } from './habit-progress'
import type { HabitDraft } from './habitFormState'

export type HabitEditDraft = Pick<HabitDraft, 'name' | 'emoji' | 'goal' | 'cadence'>

export interface HabitEditor {
  editingId: string | null
  draft: HabitEditDraft
  setField: <K extends keyof HabitEditDraft>(key: K, value: HabitEditDraft[K]) => void
  start: (habit: Habit) => void
  save: () => void
  cancel: () => void
}

const emptyEditDraft: HabitEditDraft = { name: '', emoji: '', goal: '', cadence: 'weekly' }

/** Inline edit session for one habit at a time, shared by every habit layout. */
export function useHabitEditor(setHabits: Dispatch<SetStateAction<Habit[]>>): HabitEditor {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<HabitEditDraft>(emptyEditDraft)

  return {
    editingId,
    draft,
    setField: (key, value) => setDraft((prev) => ({ ...prev, [key]: value })),
    start: (habit) => {
      setEditingId(habit.id)
      setDraft({ name: habit.name, emoji: habit.emoji, cadence: habitCadence(habit), goal: String(habitGoal(habit)) })
    },
    save: () => {
      if (!editingId || !draft.name.trim()) return
      setHabits((prev) => prev.map((h) => h.id !== editingId ? h : withGoal(
        { ...h, name: draft.name.trim(), emoji: draft.emoji || h.emoji },
        draft.cadence,
        draft.goal,
      )))
      setEditingId(null)
    },
    cancel: () => setEditingId(null),
  }
}
