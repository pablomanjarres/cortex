import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Flame, Trophy, Plus, X, Pencil, Check, ChevronLeft, ChevronRight } from 'lucide-react'

type Cadence = 'weekly' | 'monthly'

interface Habit {
  id: string
  name: string
  emoji: string
  weeklyGoal?: number // days per week needed for 100%, defaults to 7 (weekly cadence)
  monthlyGoal?: number // days per month needed for 100%, defaults to 1 (monthly cadence)
  cadence?: Cadence // defaults to 'weekly'
  category?: string
}

const OLD_DEFAULT_IDS = ['1', '2', '3', '4', '5', '6', '7']

const defaultHabits: Habit[] = [
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

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekDatesWithOffset(offset: number): string[] {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7)
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(localDate(d))
  }
  return dates
}

function getWeekLabel(dates: string[]): string {
  const start = new Date(dates[0] + 'T00:00:00')
  const end = new Date(dates[6] + 'T00:00:00')
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

// All calendar dates (YYYY-MM-DD) in the month containing the anchor date.
function getMonthDates(anchorDateStr: string): string[] {
  const anchor = new Date(anchorDateStr + 'T00:00:00')
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const dates: string[] = []
  for (let i = 1; i <= daysInMonth; i++) {
    dates.push(localDate(new Date(year, month, i)))
  }
  return dates
}

function getMonthLabel(anchorDateStr: string): string {
  return new Date(anchorDateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'long' })
}

export function HabitsPage() {
  const [habits, updateHabits] = useStore<Habit[]>('cortex-habits', defaultHabits)
  const setHabits = (v: Habit[] | ((p: Habit[]) => Habit[])) => updateHabits(typeof v === 'function' ? v : () => v)
  const [grid, updateGrid] = useStore<Record<string, Record<string, boolean>>>('cortex-habits-grid', {})
  const setGrid = (v: Record<string, Record<string, boolean>> | ((p: Record<string, Record<string, boolean>>) => Record<string, Record<string, boolean>>)) => updateGrid(typeof v === 'function' ? v : () => v)
  const [habitHistory, updateHabitHistory] = useStore<Record<string, Record<string, boolean>>>('cortex-habits-history', {})
  const setHabitHistory = (v: Record<string, Record<string, boolean>> | ((p: Record<string, Record<string, boolean>>) => Record<string, Record<string, boolean>>)) => updateHabitHistory(typeof v === 'function' ? v : () => v)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('')
  const [newGoal, setNewGoal] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newCadence, setNewCadence] = useState<Cadence>('weekly')
  const [customCategory, setCustomCategory] = useState(false)

  const handleCategoryChange = (val: string) => {
    if (val === '__new') {
      setCustomCategory(true)
      setNewCategory('')
    } else {
      setCustomCategory(false)
      setNewCategory(val)
    }
  }
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [editGoal, setEditGoal] = useState('')
  const [editCadence, setEditCadence] = useState<Cadence>('weekly')
  const [weekOffset, setWeekOffset] = useState(0)

  const weekDates = getWeekDatesWithOffset(weekOffset)
  // Monthly-cadence habits are scored over the calendar month of the viewed week.
  const monthDates = getMonthDates(weekDates[0])
  const monthLabel = getMonthLabel(weekDates[0])

  // One-time migration from old weekly grid to date-based history
  useEffect(() => {
    if (Object.keys(grid).length > 0 && Object.keys(habitHistory).length === 0) {
      const weekDates = getWeekDatesWithOffset(0)
      const migrated: Record<string, Record<string, boolean>> = {}
      for (const [habitId, days] of Object.entries(grid)) {
        for (const [dayName, done] of Object.entries(days as Record<string, boolean>)) {
          const dayIndex = weekDays.indexOf(dayName)
          if (dayIndex >= 0 && done) {
            const date = weekDates[dayIndex]
            if (!migrated[date]) migrated[date] = {}
            migrated[date][habitId] = true
          }
        }
      }
      if (Object.keys(migrated).length > 0) {
        setHabitHistory(() => migrated)
      }
    }
  }, [])

  // One-time migration from old default habits to new categorized ones
  const migratedRef = useRef(false)
  useEffect(() => {
    if (migratedRef.current) return
    const hasOldIds = habits.length > 0 && habits.every(h => OLD_DEFAULT_IDS.includes(h.id))
    const hasNoCategories = habits.every(h => !h.category)
    if (hasOldIds && hasNoCategories) {
      migratedRef.current = true
      setHabits(defaultHabits)
    }
  }, [habits])

  // Group habits by category for rendering
  const categories = [...new Set(habits.map(h => h.category).filter(Boolean))] as string[]
  const uncategorized = habits.filter(h => !h.category)

  const toggle = (habitId: string, dayIndex: number) => {
    const date = weekDates[dayIndex]
    setHabitHistory((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [habitId]: !prev[date]?.[habitId],
      },
    }))
  }

  const addHabit = () => {
    if (!newName.trim()) return
    const base = {
      id: Date.now().toString(),
      name: newName.trim(),
      emoji: newEmoji || '⭐',
      category: newCategory || undefined,
    }
    const habit: Habit = newCadence === 'monthly'
      ? { ...base, cadence: 'monthly', monthlyGoal: Math.min(Math.max(parseInt(newGoal) || 1, 1), 31) }
      : { ...base, cadence: 'weekly', weeklyGoal: Math.min(Math.max(parseInt(newGoal) || 7, 1), 7) }
    setHabits((prev) => [...prev, habit])
    setNewName('')
    setNewEmoji('')
    setNewGoal('')
    setNewCategory('')
    setNewCadence('weekly')
    setCustomCategory(false)
  }

  const removeHabit = (id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id))
    setGrid((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    // Also remove from history
    setHabitHistory((prev) => {
      const next = { ...prev }
      for (const date of Object.keys(next)) {
        if (next[date][id] !== undefined) {
          const { [id]: _, ...rest } = next[date]
          next[date] = rest
        }
      }
      return next
    })
  }

  const startEdit = (habit: Habit) => {
    setEditingId(habit.id)
    setEditName(habit.name)
    setEditEmoji(habit.emoji)
    const cadence = habit.cadence ?? 'weekly'
    setEditCadence(cadence)
    setEditGoal(String(cadence === 'monthly' ? (habit.monthlyGoal ?? 1) : (habit.weeklyGoal ?? 7)))
  }

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== editingId) return h
        const next: Habit = { ...h, name: editName.trim(), emoji: editEmoji || h.emoji, cadence: editCadence }
        if (editCadence === 'monthly') {
          next.monthlyGoal = Math.min(Math.max(parseInt(editGoal) || 1, 1), 31)
          delete next.weeklyGoal
        } else {
          next.weeklyGoal = Math.min(Math.max(parseInt(editGoal) || 7, 1), 7)
          delete next.monthlyGoal
        }
        return next
      })
    )
    setEditingId(null)
  }

  const getStreak = (habitId: string) => {
    let streak = 0
    const today = new Date()
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const dateStr = localDate(d)
      if (habitHistory[dateStr]?.[habitId]) {
        streak++
      } else {
        break
      }
    }
    return streak
  }

  // Consecutive calendar months (back from now) whose completions met the monthly goal.
  // The current, still-in-progress month never breaks the streak — it just doesn't count yet.
  const getMonthlyStreak = (habitId: string, goal: number) => {
    let streak = 0
    const now = new Date()
    for (let i = 0; i < 120; i++) {
      const first = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const done = getMonthDates(localDate(first)).filter(d => habitHistory[d]?.[habitId]).length
      if (done >= goal) streak++
      else if (i === 0) continue
      else break
    }
    return streak
  }

  // Cadence-aware progress for the currently-viewed window (week or month).
  const getProgress = (habit: Habit) => {
    if ((habit.cadence ?? 'weekly') === 'monthly') {
      const goal = habit.monthlyGoal ?? 1
      const done = monthDates.filter(d => habitHistory[d]?.[habit.id]).length
      return { cadence: 'monthly' as const, goal, done, met: done >= goal }
    }
    const goal = habit.weeklyGoal ?? 7
    const done = weekDates.filter(d => habitHistory[d]?.[habit.id]).length
    return { cadence: 'weekly' as const, goal, done, met: done >= goal }
  }
  const getStreakFor = (habit: Habit) =>
    (habit.cadence ?? 'weekly') === 'monthly'
      ? getMonthlyStreak(habit.id, habit.monthlyGoal ?? 1)
      : getStreak(habit.id)

  // Weekly score respects per-habit goals (e.g. Train 3/week = 100% at 3).
  // Monthly habits are tracked over the month, so they're excluded from the weekly rollup.
  const weeklyHabits = habits.filter(h => (h.cadence ?? 'weekly') === 'weekly')
  const habitWeekProgress = weeklyHabits.map((h) => {
    const goal = h.weeklyGoal ?? 7
    const done = weekDates.filter(d => habitHistory[d]?.[h.id]).length
    return { done, goal, pct: Math.min(done / goal, 1) }
  })
  const weeklyScore = weeklyHabits.length > 0
    ? Math.round(habitWeekProgress.reduce((s, h) => s + h.pct, 0) / weeklyHabits.length * 100)
    : 0
  const totalCompleted = habitWeekProgress.reduce((s, h) => s + Math.min(h.done, h.goal), 0)
  const totalGoals = habitWeekProgress.reduce((s, h) => s + h.goal, 0)

  const todayDayIndex = (() => {
    const d = new Date().getDay()
    return (d + 6) % 7 // 0=Mon, 6=Sun
  })()

  const renderHabitRow = (habit: Habit) => (
    <tr key={habit.id} className="border-t border-border/50 group">
      <td className="py-2.5 pr-4 text-sm text-foreground">
        {editingId === habit.id ? (
          <div className="flex items-center gap-1.5">
            <Input value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} className="h-7 w-10 bg-input px-1 text-center text-sm" />
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} className="h-7 bg-input text-sm" autoFocus />
            <select value={editCadence} onChange={(e) => setEditCadence(e.target.value as Cadence)} className="h-7 rounded-md border border-border bg-input px-1 text-xs text-foreground">
              <option value="weekly">/wk</option>
              <option value="monthly">/mo</option>
            </select>
            <Input value={editGoal} onChange={(e) => setEditGoal(e.target.value)} className="h-7 w-12 bg-input px-1 text-center text-sm" placeholder={editCadence === 'monthly' ? '1' : '7'} type="number" min={1} max={editCadence === 'monthly' ? 31 : 7} />
          </div>
        ) : (
          <><span className="mr-2">{habit.emoji}</span>{habit.name}</>
        )}
      </td>
      {weekDays.map((day, dayIndex) => (
        <td key={day} className="py-2.5 text-center">
          <button
            onClick={() => toggle(habit.id, dayIndex)}
            className={`h-7 w-7 rounded-md transition-all ${
              habitHistory[weekDates[dayIndex]]?.[habit.id]
                ? 'bg-foreground text-background'
                : 'bg-secondary hover:bg-secondary/80'
            }`}
          >
            {habitHistory[weekDates[dayIndex]]?.[habit.id] && <span className="text-xs">✓</span>}
          </button>
        </td>
      ))}
      <td className="py-2.5 text-center">
        {(() => {
          const p = getProgress(habit)
          return (
            <span className={`text-sm font-semibold tabular-nums ${p.met ? 'text-green-400' : 'text-muted-foreground'}`}>
              {Math.min(p.done, p.goal)}/{p.goal}
              {p.cadence === 'monthly' && <span className="ml-0.5 text-[9px] font-normal text-muted-foreground/50" title={`Monthly goal · ${monthLabel}`}>/mo</span>}
            </span>
          )
        })()}
      </td>
      <td className="py-2.5 text-center">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {editingId === habit.id ? (
            <button onClick={saveEdit} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Check className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button onClick={() => startEdit(habit)} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => removeHabit(habit.id)} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )

  return (
    <PageShell>
      {/* ── Week navigation ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold md:text-2xl md:font-bold">Habits</h2>
          <span className="text-xs text-muted-foreground md:text-sm">{totalCompleted}/{totalGoals}</span>
          <span className="text-2xl font-bold tabular-nums md:hidden">{weeklyScore}%</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className={`text-xs font-medium px-2 py-1 rounded-md transition-colors ${weekOffset === 0 ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {weekOffset === 0 ? 'This week' : getWeekLabel(weekDates)}
          </button>
          <button onClick={() => setWeekOffset(w => Math.min(w + 1, 0))} className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors" disabled={weekOffset >= 0}>
            <ChevronRight className={`h-4 w-4 ${weekOffset >= 0 ? 'opacity-30' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Mobile: card layout ───────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:hidden">
        {[...categories, null].map((cat) => {
          const catHabits = cat ? habits.filter(h => h.category === cat) : uncategorized
          if (catHabits.length === 0) return null
          return (
            <div key={cat || 'none'} className="space-y-3">
              {cat && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 pt-2">{cat}</p>
              )}
              {catHabits.map((habit) => {
          const { cadence, goal, done, met } = getProgress(habit)
          const streak = getStreakFor(habit)
          const streakUnit = cadence === 'monthly' ? 'mo' : 'd'

          return (
            <div key={habit.id} className="liquid-glass rounded-xl border border-border p-4">
              {editingId === habit.id ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Input value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} className="h-9 w-12 bg-input px-1 text-center" />
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} className="h-9 bg-input flex-1" autoFocus />
                    <select value={editCadence} onChange={(e) => setEditCadence(e.target.value as Cadence)} className="h-9 rounded-md border border-border bg-input px-1 text-xs text-foreground">
                      <option value="weekly">/wk</option>
                      <option value="monthly">/mo</option>
                    </select>
                    <Input value={editGoal} onChange={(e) => setEditGoal(e.target.value)} className="h-9 w-14 bg-input px-1 text-center" placeholder={editCadence === 'monthly' ? '1' : '7'} type="number" min={1} max={editCadence === 'monthly' ? 31 : 7} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="flex-1 h-9 rounded-lg bg-foreground/10 text-sm font-medium">Save</button>
                    <button onClick={() => setEditingId(null)} className="h-9 px-3 rounded-lg text-sm text-muted-foreground">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Header row: emoji + name + streak + actions */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{habit.emoji}</span>
                      <span className="text-sm font-medium truncate">{habit.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {streak > 0 && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Flame className="h-3 w-3" />{streak}{streakUnit}
                        </span>
                      )}
                      <span className={`text-xs font-semibold tabular-nums ${met ? 'text-green-400' : 'text-muted-foreground'}`}>
                        {Math.min(done, goal)}/{goal}
                        {cadence === 'monthly' && <span className="ml-0.5 text-[9px] font-normal text-muted-foreground/50">/mo</span>}
                      </span>
                      <button onClick={() => startEdit(habit)} className="p-1.5 rounded-lg text-muted-foreground/40 active:bg-foreground/10">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => removeHabit(habit.id)} className="p-1.5 rounded-lg text-muted-foreground/40 active:text-red-400 active:bg-red-500/10">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Day circles */}
                  <div className="flex items-center justify-between">
                    {weekDays.map((day, i) => {
                      const isChecked = !!habitHistory[weekDates[i]]?.[habit.id]
                      const isToday = i === todayDayIndex
                      return (
                        <button
                          key={day}
                          onClick={() => toggle(habit.id, i)}
                          className="flex flex-col items-center gap-1"
                        >
                          <span className={`text-[10px] ${isToday ? 'text-foreground font-semibold' : 'text-muted-foreground/50'}`}>{day}</span>
                          <div className={`h-9 w-9 rounded-full flex items-center justify-center transition-all ${
                            isChecked
                              ? 'bg-foreground text-background'
                              : isToday
                                ? 'bg-foreground/10 ring-1 ring-foreground/30'
                                : 'bg-secondary'
                          }`}>
                            {isChecked && <span className="text-sm">✓</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })}
            </div>
          )
        })}

        {/* Add new habit — mobile */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} placeholder="🎯" className="h-10 w-12 bg-input px-1 text-center" />
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addHabit()} placeholder="New habit..." className="h-10 bg-input flex-1 min-w-[120px]" />
          {customCategory ? (
            <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Category name" className="h-10 w-28 bg-input text-sm" autoFocus onKeyDown={(e) => e.key === 'Escape' && setCustomCategory(false)} />
          ) : (
            <select value={newCategory} onChange={(e) => handleCategoryChange(e.target.value)} className="h-10 rounded-md border border-border bg-input px-2 text-sm text-foreground">
              <option value="">No category</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__new">+ New...</option>
            </select>
          )}
          <select value={newCadence} onChange={(e) => setNewCadence(e.target.value as Cadence)} className="h-10 rounded-md border border-border bg-input px-2 text-sm text-foreground">
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <Input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder={newCadence === 'monthly' ? '1' : '7'} type="number" min={1} max={newCadence === 'monthly' ? 31 : 7} className="h-10 w-14 bg-input px-1 text-center" title={newCadence === 'monthly' ? 'Days per month goal' : 'Days per week goal'} />
          <button onClick={addHabit} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground active:bg-secondary/80">
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Desktop: table layout ─────────────────────────────────── */}
      <div className="hidden md:grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Habit Grid */}
        <WidgetCard title="Weekly Habit Grid" className="xl:col-span-2" delay={0}>
          <table className="w-full">
            <thead>
              <tr>
                <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Habit</th>
                {weekDays.map((day) => (
                  <th key={day} className="pb-3 text-center text-xs font-medium text-muted-foreground w-12">
                    {day}
                  </th>
                ))}
                <th className="pb-3 text-center text-xs font-medium text-muted-foreground w-14">Goal</th>
                <th className="pb-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const catHabits = habits.filter(h => h.category === cat)
                if (catHabits.length === 0) return null
                return [
                  <tr key={`cat-${cat}`}>
                    <td colSpan={weekDays.length + 3} className="pt-4 pb-1 px-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">{cat}</span>
                    </td>
                  </tr>,
                  ...catHabits.map((habit) => renderHabitRow(habit)),
                ]
              })}
              {uncategorized.map((habit) => renderHabitRow(habit))}
            </tbody>
          </table>

          {/* Add new habit */}
          <div className="mt-4 flex items-center gap-2 border-t border-border/50 pt-4">
            <Input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} placeholder="🎯" className="h-8 w-12 bg-input px-1 text-center text-sm" />
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addHabit()} placeholder="New habit..." className="h-8 bg-input text-sm flex-1" />
            {customCategory ? (
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Category name" className="h-8 w-28 bg-input text-xs" autoFocus onKeyDown={(e) => e.key === 'Escape' && setCustomCategory(false)} />
            ) : (
              <select value={newCategory} onChange={(e) => handleCategoryChange(e.target.value)} className="h-8 rounded-md border border-border bg-input px-2 text-xs text-foreground">
                <option value="">No category</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__new">+ New...</option>
              </select>
            )}
            <select value={newCadence} onChange={(e) => setNewCadence(e.target.value as Cadence)} className="h-8 rounded-md border border-border bg-input px-2 text-xs text-foreground" title="Cadence">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <Input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder={newCadence === 'monthly' ? '1' : '7'} type="number" min={1} max={newCadence === 'monthly' ? 31 : 7} className="h-8 w-14 bg-input px-1 text-center text-sm" title={newCadence === 'monthly' ? 'Days per month goal' : 'Days per week goal'} />
            <button onClick={addHabit} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground transition-colors hover:bg-secondary/80">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </WidgetCard>

        {/* Stats Column */}
        <div className="flex flex-col gap-6">
          <WidgetCard title="Weekly Consistency" delay={0.1}>
            <div className="flex flex-col items-center gap-3 py-4">
              <span className="text-4xl font-bold tabular-nums">{weeklyScore}%</span>
              <p className="text-xs text-muted-foreground">{totalCompleted} of {totalGoals} goal completions</p>
            </div>
          </WidgetCard>

          <WidgetCard title="Streaks" delay={0.2}>
            <div className="flex flex-col gap-2">
              {habits.map((habit) => {
                const { cadence, goal } = getProgress(habit)
                const unit = cadence === 'monthly' ? 'mo' : 'd'
                const label = cadence === 'monthly' ? `${goal}x/mo` : (goal < 7 ? `${goal}x/wk` : null)
                return (
                  <div key={habit.id} className="flex items-center justify-between rounded-lg px-2 py-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm text-foreground truncate">{habit.emoji} {habit.name}</span>
                      {label && <span className="text-[9px] text-muted-foreground/50 shrink-0">{label}</span>}
                    </div>
                    <Badge variant="secondary" className="tabular-nums shrink-0">
                      <Flame className="mr-1 h-3 w-3" />{getStreakFor(habit)}{unit}
                    </Badge>
                  </div>
                )
              })}
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
                <div key={achievement.label} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${achievement.unlocked ? '' : 'opacity-40'}`}>
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
