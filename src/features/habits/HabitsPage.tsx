import { useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Badge } from '@/components/ui/badge'
import { Flame, Trophy } from 'lucide-react'

const habits = [
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
  const [grid, setGrid] = useState<Record<string, Record<string, boolean>>>({})

  const toggle = (habitId: string, day: string) => {
    setGrid((prev) => ({
      ...prev,
      [habitId]: {
        ...prev[habitId],
        [day]: !prev[habitId]?.[day],
      },
    }))
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
                </tr>
              </thead>
              <tbody>
                {habits.map((habit) => (
                  <tr key={habit.id} className="border-t border-border/50">
                    <td className="py-2.5 pr-4 text-sm text-foreground">
                      <span className="mr-2">{habit.emoji}</span>
                      {habit.name}
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
                  </tr>
                ))}
              </tbody>
            </table>
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
