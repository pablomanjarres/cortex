import { useState } from 'react'
import { useStore } from '@/lib/store'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Flame, Trophy, Plus, X, Pencil, Check } from 'lucide-react'

interface Habit {
  id: string
  name: string
  emoji: string
}

const defaultHabits: Habit[] = [
  { id: '1', name: 'Workout', emoji: '💪' },
  { id: '2', name: 'Read 30min', emoji: '📖' },
  { id: '3', name: 'Meditate', emoji: '🧘' },
  { id: '4', name: 'Journal', emoji: '✍️' },
  { id: '5', name: 'No social media before noon', emoji: '📵' },
  { id: '6', name: 'Drink 2L water', emoji: '💧' },
  { id: '7', name: 'Sleep by 11pm', emoji: '🌙' },
]

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function HabitsPage() {
  const [habits, updateHabits] = useStore<Habit[]>('cortex-habits', defaultHabits)
  const setHabits = (v: Habit[] | ((p: Habit[]) => Habit[])) => updateHabits(typeof v === 'function' ? v : () => v)
  const [grid, updateGrid] = useStore<Record<string, Record<string, boolean>>>('cortex-habits-grid', {})
  const setGrid = (v: Record<string, Record<string, boolean>> | ((p: Record<string, Record<string, boolean>>) => Record<string, Record<string, boolean>>)) => updateGrid(typeof v === 'function' ? v : () => v)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('')

  const toggle = (habitId: string, day: string) => {
    setGrid((prev) => ({
      ...prev,
      [habitId]: {
        ...prev[habitId],
        [day]: !prev[habitId]?.[day],
      },
    }))
  }

  const addHabit = () => {
    if (!newName.trim()) return
    setHabits((prev) => [
      ...prev,
      { id: Date.now().toString(), name: newName.trim(), emoji: newEmoji || '⭐' },
    ])
    setNewName('')
    setNewEmoji('')
  }

  const removeHabit = (id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id))
    setGrid((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const startEdit = (habit: Habit) => {
    setEditingId(habit.id)
    setEditName(habit.name)
    setEditEmoji(habit.emoji)
  }

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return
    setHabits((prev) =>
      prev.map((h) =>
        h.id === editingId ? { ...h, name: editName.trim(), emoji: editEmoji || h.emoji } : h
      )
    )
    setEditingId(null)
  }

  const getStreak = (habitId: string) => {
    const days = grid[habitId] || {}
    return Object.values(days).filter(Boolean).length
  }

  const totalCompleted = Object.values(grid).reduce(
    (sum, days) => sum + Object.values(days).filter(Boolean).length,
    0
  )
  const totalPossible = habits.length * 7
  const weeklyScore = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0

  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Habit Grid */}
        <WidgetCard title="Weekly Habit Grid" className="xl:col-span-2" delay={0}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Habit</th>
                  {weekDays.map((day) => (
                    <th key={day} className="pb-3 text-center text-xs font-medium text-muted-foreground w-12">
                      {day}
                    </th>
                  ))}
                  <th className="pb-3 text-center text-xs font-medium text-muted-foreground w-12">
                    <Flame className="mx-auto h-3.5 w-3.5" />
                  </th>
                  <th className="pb-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {habits.map((habit) => (
                  <tr key={habit.id} className="border-t border-border/50 group">
                    <td className="py-2.5 pr-4 text-sm text-foreground max-w-[120px] sm:max-w-none">
                      {editingId === habit.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={editEmoji}
                            onChange={(e) => setEditEmoji(e.target.value)}
                            className="h-7 w-10 bg-input px-1 text-center text-sm"
                          />
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                            className="h-7 bg-input text-sm"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <>
                          <span className="mr-2">{habit.emoji}</span>
                          {habit.name}
                        </>
                      )}
                    </td>
                    {weekDays.map((day) => (
                      <td key={day} className="py-2.5 text-center">
                        <button
                          onClick={() => toggle(habit.id, day)}
                          className={`h-7 w-7 rounded-md transition-all ${
                            grid[habit.id]?.[day]
                              ? 'bg-foreground text-background'
                              : 'bg-secondary hover:bg-secondary/80'
                          }`}
                        >
                          {grid[habit.id]?.[day] && (
                            <span className="text-xs">✓</span>
                          )}
                        </button>
                      </td>
                    ))}
                    <td className="py-2.5 text-center">
                      <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                        {getStreak(habit.id)}
                      </span>
                    </td>
                    <td className="py-2.5 text-center">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {editingId === habit.id ? (
                          <button
                            onClick={saveEdit}
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => startEdit(habit)}
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => removeHabit(habit.id)}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add new habit */}
          <div className="mt-4 flex items-center gap-2 border-t border-border/50 pt-4">
            <Input
              value={newEmoji}
              onChange={(e) => setNewEmoji(e.target.value)}
              placeholder="🎯"
              className="h-8 w-12 bg-input px-1 text-center text-sm"
            />
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addHabit()}
              placeholder="New habit..."
              className="h-8 bg-input text-sm flex-1"
            />
            <button
              onClick={addHabit}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground transition-colors hover:bg-secondary/80"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </WidgetCard>

        {/* Stats Column */}
        <div className="flex flex-col gap-6">
          <WidgetCard title="Weekly Consistency" delay={0.1}>
            <div className="flex flex-col items-center gap-3 py-4">
              <span className="text-4xl font-bold tabular-nums">{weeklyScore}%</span>
              <p className="text-xs text-muted-foreground">
                {totalCompleted} of {totalPossible} habits completed
              </p>
            </div>
          </WidgetCard>

          <WidgetCard title="Streaks" delay={0.2}>
            <div className="flex flex-col gap-2">
              {habits.map((habit) => (
                <div key={habit.id} className="flex items-center justify-between rounded-lg px-2 py-1.5">
                  <span className="text-sm text-foreground">{habit.emoji} {habit.name}</span>
                  <Badge variant="secondary" className="tabular-nums">
                    <Flame className="mr-1 h-3 w-3" />
                    {getStreak(habit.id)}d
                  </Badge>
                </div>
              ))}
            </div>
          </WidgetCard>

          <WidgetCard title="Achievements" delay={0.3}>
            <div className="flex flex-col gap-2 py-2">
              {[
                { label: '7-day streak', unlocked: false },
                { label: '30-day streak', unlocked: false },
                { label: '100% week', unlocked: weeklyScore === 100 },
                { label: 'Early bird (5 days)', unlocked: false },
              ].map((achievement) => (
                <div
                  key={achievement.label}
                  className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${
                    achievement.unlocked ? '' : 'opacity-40'
                  }`}
                >
                  <Trophy className="h-4 w-4" />
                  <span className="text-sm">{achievement.label}</span>
                </div>
              ))}
            </div>
          </WidgetCard>
        </div>
      </div>
    </PageShell>
  )
}
