import { useState, useEffect, useRef, Fragment } from 'react'
import { useStore } from '@/lib/store'
import { localDate, getWeekLabel } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Flame, Trophy, Plus, X, Pencil, Check, ChevronLeft, ChevronRight, StickyNote } from 'lucide-react'

type Cadence = 'weekly' | 'monthly'

interface Habit {
  id: string
  name: string
  emoji: string
  weeklyGoal?: number // days per week needed for 100% (0–7), defaults to 7; 0 = no target this week
  monthlyGoal?: number // days per month needed for 100% (0–31), defaults to 1; 0 = no target this month
  cadence?: Cadence // defaults to 'weekly'
  category?: string
  context?: string // free-form note: what this habit really means + what counts as done
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

// Form-control style for the raw <select>s (no Select primitive exists yet) —
// mirrors the Input primitive's hairline/fill/focus treatment.
const selectClass =
  'rounded-md border border-input bg-input/20 text-foreground outline-none transition-colors duration-150 focus-visible:border-ring/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

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

// Parse a goal input. A goal of 0 is allowed — it means the habit has no
// required completions this week/month (paused / optional, still trackable).
// A blank or invalid input falls back to the cadence default; an explicit 0 is
// kept (note: `parseInt('0') || 7` would wrongly coerce 0 back to the default).
function parseGoal(raw: string, cadence: Cadence): number {
  const max = cadence === 'monthly' ? 31 : 7
  const fallback = cadence === 'monthly' ? 1 : 7
  const t = raw.trim()
  if (t === '') return fallback
  const n = parseInt(t, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(Math.max(n, 0), max)
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
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)

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
      ? { ...base, cadence: 'monthly', monthlyGoal: parseGoal(newGoal, 'monthly') }
      : { ...base, cadence: 'weekly', weeklyGoal: parseGoal(newGoal, 'weekly') }
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
          next.monthlyGoal = parseGoal(editGoal, 'monthly')
          delete next.weeklyGoal
        } else {
          next.weeklyGoal = parseGoal(editGoal, 'weekly')
          delete next.monthlyGoal
        }
        return next
      })
    )
    setEditingId(null)
  }

  const toggleNote = (id: string) => setExpandedNoteId((cur) => (cur === id ? null : id))
  const setHabitContext = (id: string, value: string) =>
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, context: value.trim() ? value : undefined } : h)))

  // Small sticky-note toggle shown next to a habit name. Lit when the habit has
  // context, faint-on-hover when empty.
  const renderNoteButton = (habit: Habit, opts?: { mobile?: boolean }) => (
    <Button
      variant="ghost"
      size={opts?.mobile ? 'icon-sm' : 'icon-xs'}
      onClick={() => toggleNote(habit.id)}
      title={habit.context ? 'Context — click to edit' : 'Add context'}
      aria-label={habit.context ? 'Edit habit context' : 'Add habit context'}
      className={cn(
        expandedNoteId === habit.id
          ? 'text-foreground'
          : habit.context
            ? 'text-warning/80 hover:text-warning'
            : opts?.mobile
              ? 'text-foreground-faint'
              : 'text-foreground-faint opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
      )}
    >
      <StickyNote />
    </Button>
  )

  // The inline panel to write "what this habit means / what has to be done".
  const renderNoteEditor = (habit: Habit) => (
    <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
        <StickyNote className="h-3 w-3" />
        What this means · what counts as done
      </div>
      <textarea
        value={habit.context ?? ''}
        onChange={(e) => setHabitContext(habit.id, e.target.value)}
        autoFocus
        placeholder="Write the full meaning of this habit and exactly what has to be done to check it off…"
        className="min-h-[72px] w-full resize-y rounded-md border border-input bg-input/20 px-2.5 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors duration-150 placeholder:text-foreground-faint focus-visible:border-ring/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
    </div>
  )

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
    if (goal <= 0) return 0 // no target ⇒ no streak to earn
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
  // Habits with a 0 goal are "not required this week" — excluded so they neither
  // inflate the score (as a free 100%) nor divide by zero.
  const weeklyHabits = habits.filter(h => (h.cadence ?? 'weekly') === 'weekly')
  const scoredWeeklyHabits = weeklyHabits.filter(h => (h.weeklyGoal ?? 7) > 0)
  const habitWeekProgress = scoredWeeklyHabits.map((h) => {
    const goal = h.weeklyGoal ?? 7
    const done = weekDates.filter(d => habitHistory[d]?.[h.id]).length
    return { done, goal, pct: Math.min(done / goal, 1) }
  })
  const weeklyScore = scoredWeeklyHabits.length > 0
    ? Math.round(habitWeekProgress.reduce((s, h) => s + h.pct, 0) / scoredWeeklyHabits.length * 100)
    : 0
  const totalCompleted = habitWeekProgress.reduce((s, h) => s + Math.min(h.done, h.goal), 0)
  const totalGoals = habitWeekProgress.reduce((s, h) => s + h.goal, 0)

  const todayDayIndex = (() => {
    const d = new Date().getDay()
    return (d + 6) % 7 // 0=Mon, 6=Sun
  })()

  const renderHabitRow = (habit: Habit) => (
    <Fragment key={habit.id}>
    <tr className="group border-t border-border/60">
      <td className="py-2.5 pr-4 text-sm text-foreground">
        {editingId === habit.id ? (
          <div className="flex items-center gap-1.5">
            <Input value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} className="h-7 w-10 px-1 text-center text-sm" />
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} className="h-7 text-sm" autoFocus />
            <select value={editCadence} onChange={(e) => setEditCadence(e.target.value as Cadence)} className={cn(selectClass, 'h-7 px-1 text-xs')}>
              <option value="weekly">/wk</option>
              <option value="monthly">/mo</option>
            </select>
            <Input value={editGoal} onChange={(e) => setEditGoal(e.target.value)} className="h-7 w-12 px-1 text-center text-sm" placeholder={editCadence === 'monthly' ? '1' : '7'} type="number" min={0} max={editCadence === 'monthly' ? 31 : 7} />
          </div>
        ) : (
          <span className="inline-flex items-center">
            <span className="mr-2">{habit.emoji}</span>{habit.name}
            {renderNoteButton(habit)}
          </span>
        )}
      </td>
      {weekDays.map((day, dayIndex) => {
        const checked = !!habitHistory[weekDates[dayIndex]]?.[habit.id]
        return (
          <td key={day} className="py-2.5 text-center">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => toggle(habit.id, dayIndex)}
              aria-pressed={checked}
              aria-label={`${habit.name} — ${day}`}
              className={cn(
                checked
                  ? 'border-success/25 bg-success/10 text-success hover:bg-success/15 hover:text-success'
                  : 'bg-secondary hover:bg-secondary/80'
              )}
            >
              {checked && <span className="text-xs">✓</span>}
            </Button>
          </td>
        )
      })}
      <td className="py-2.5 text-center">
        {(() => {
          const p = getProgress(habit)
          return (
            <span className={cn(
              'font-mono text-sm tabular-nums',
              p.goal === 0 ? 'text-foreground-faint' : p.met ? 'text-success' : 'text-muted-foreground'
            )}>
              {Math.min(p.done, p.goal)}/{p.goal}
              {p.cadence === 'monthly' && <span className="ml-0.5 text-3xs font-normal text-foreground-faint" title={`Monthly goal · ${monthLabel}`}>/mo</span>}
            </span>
          )
        })()}
      </td>
      <td className="py-2.5 text-center">
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {editingId === habit.id ? (
            <Button variant="ghost" size="icon-xs" onClick={saveEdit} aria-label="Save habit">
              <Check />
            </Button>
          ) : (
            <Button variant="ghost" size="icon-xs" onClick={() => startEdit(habit)} aria-label="Edit habit">
              <Pencil />
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" onClick={() => removeHabit(habit.id)} aria-label="Delete habit" className="hover:text-destructive">
            <X />
          </Button>
        </div>
      </td>
    </tr>
    {expandedNoteId === habit.id && (
      <tr>
        <td colSpan={weekDays.length + 3} className="px-0 pb-3 pt-0">
          {renderNoteEditor(habit)}
        </td>
      </tr>
    )}
    </Fragment>
  )

  return (
    <PageShell>
      {/* ── Week navigation ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xs uppercase tracking-widest text-foreground-faint">Week score</span>
          <span className="font-mono text-2xl font-medium tabular-nums md:hidden">{weeklyScore}%</span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground md:text-sm">{totalCompleted}/{totalGoals}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setWeekOffset(w => w - 1)} aria-label="Previous week">
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekOffset(0)}
            className={cn('font-mono', weekOffset === 0 && 'text-foreground')}
          >
            {weekOffset === 0 ? 'This week' : getWeekLabel(weekDates[0])}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setWeekOffset(w => Math.min(w + 1, 0))} aria-label="Next week" disabled={weekOffset >= 0}>
            <ChevronRight />
          </Button>
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
                <p className="pt-2 font-mono text-2xs uppercase tracking-widest text-foreground-faint">{cat}</p>
              )}
              {catHabits.map((habit) => {
          const { cadence, goal, done, met } = getProgress(habit)
          const streak = getStreakFor(habit)
          const streakUnit = cadence === 'monthly' ? 'mo' : 'd'

          return (
            <div key={habit.id} className="surface rounded-xl p-4">
              {editingId === habit.id ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Input value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} className="h-9 w-12 px-1 text-center" />
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} className="h-9 flex-1" autoFocus />
                    <select value={editCadence} onChange={(e) => setEditCadence(e.target.value as Cadence)} className={cn(selectClass, 'h-9 px-1 text-xs')}>
                      <option value="weekly">/wk</option>
                      <option value="monthly">/mo</option>
                    </select>
                    <Input value={editGoal} onChange={(e) => setEditGoal(e.target.value)} className="h-9 w-14 px-1 text-center" placeholder={editCadence === 'monthly' ? '1' : '7'} type="number" min={0} max={editCadence === 'monthly' ? 31 : 7} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="lg" className="flex-1" onClick={saveEdit}>Save</Button>
                    <Button variant="ghost" size="lg" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Header row: emoji + name + streak + actions */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-lg">{habit.emoji}</span>
                      <span className="truncate text-sm font-medium">{habit.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {streak > 0 && (
                        <Chip size="sm" variant="success" className="tabular-nums">
                          <Flame />
                          {streak}{streakUnit}
                        </Chip>
                      )}
                      <span className={cn(
                        'font-mono text-xs tabular-nums',
                        goal === 0 ? 'text-foreground-faint' : met ? 'text-success' : 'text-muted-foreground'
                      )}>
                        {Math.min(done, goal)}/{goal}
                        {cadence === 'monthly' && <span className="ml-0.5 text-3xs font-normal text-foreground-faint">/mo</span>}
                      </span>
                      {renderNoteButton(habit, { mobile: true })}
                      <Button variant="ghost" size="icon-sm" onClick={() => startEdit(habit)} aria-label="Edit habit">
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => removeHabit(habit.id)} aria-label="Delete habit" className="active:text-destructive">
                        <X />
                      </Button>
                    </div>
                  </div>
                  {/* Day circles */}
                  <div className="flex items-center justify-between">
                    {weekDays.map((day, i) => {
                      const isChecked = !!habitHistory[weekDates[i]]?.[habit.id]
                      const isToday = i === todayDayIndex
                      return (
                        <Button
                          key={day}
                          variant="ghost"
                          onClick={() => toggle(habit.id, i)}
                          aria-pressed={isChecked}
                          aria-label={`${habit.name} — ${day}`}
                          className="h-auto flex-col gap-1 px-1 py-1"
                        >
                          <span className={cn('font-mono text-2xs', isToday ? 'text-foreground' : 'text-foreground-faint')}>{day}</span>
                          <span className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                            isChecked
                              ? 'border border-success/25 bg-success/10 text-success'
                              : isToday
                                ? 'bg-secondary ring-1 ring-input'
                                : 'bg-secondary'
                          )}>
                            {isChecked && <span className="text-sm">✓</span>}
                          </span>
                        </Button>
                      )
                    })}
                  </div>
                  {expandedNoteId === habit.id && (
                    <div className="mt-3">{renderNoteEditor(habit)}</div>
                  )}
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
          <Input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} placeholder="🎯" className="h-10 w-12 px-1 text-center" />
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addHabit()} placeholder="New habit..." className="h-10 min-w-[120px] flex-1" />
          {customCategory ? (
            <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Category name" className="h-10 w-28 text-sm" autoFocus onKeyDown={(e) => e.key === 'Escape' && setCustomCategory(false)} />
          ) : (
            <select value={newCategory} onChange={(e) => handleCategoryChange(e.target.value)} className={cn(selectClass, 'h-10 px-2 text-sm')}>
              <option value="">No category</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__new">+ New...</option>
            </select>
          )}
          <select value={newCadence} onChange={(e) => setNewCadence(e.target.value as Cadence)} className={cn(selectClass, 'h-10 px-2 text-sm')}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <Input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder={newCadence === 'monthly' ? '1' : '7'} type="number" min={0} max={newCadence === 'monthly' ? 31 : 7} className="h-10 w-14 px-1 text-center" title={newCadence === 'monthly' ? 'Days per month goal' : 'Days per week goal'} />
          <Button variant="secondary" size="icon-lg" className="size-10" onClick={addHabit} aria-label="Add habit">
            <Plus className="size-5" />
          </Button>
        </div>
      </div>

      {/* ── Desktop: table layout ─────────────────────────────────── */}
      <div className="hidden grid-cols-1 gap-6 md:grid xl:grid-cols-3">
        {/* Habit Grid */}
        <WidgetCard title="Weekly habit grid" className="xl:col-span-2" delay={0}>
          <table className="w-full">
            <thead>
              <tr>
                <th className="pb-3 text-left font-mono text-2xs font-medium uppercase tracking-wider text-muted-foreground">Habit</th>
                {weekDays.map((day) => (
                  <th key={day} className="w-12 pb-3 text-center font-mono text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                    {day}
                  </th>
                ))}
                <th className="w-14 pb-3 text-center font-mono text-2xs font-medium uppercase tracking-wider text-muted-foreground">Goal</th>
                <th className="w-16 pb-3" />
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const catHabits = habits.filter(h => h.category === cat)
                if (catHabits.length === 0) return null
                return [
                  <tr key={`cat-${cat}`}>
                    <td colSpan={weekDays.length + 3} className="px-0 pb-1 pt-4">
                      <span className="font-mono text-2xs uppercase tracking-widest text-foreground-faint">{cat}</span>
                    </td>
                  </tr>,
                  ...catHabits.map((habit) => renderHabitRow(habit)),
                ]
              })}
              {uncategorized.map((habit) => renderHabitRow(habit))}
            </tbody>
          </table>

          {/* Add new habit */}
          <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-4">
            <Input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} placeholder="🎯" className="h-8 w-12 px-1 text-center text-sm" />
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addHabit()} placeholder="New habit..." className="h-8 flex-1 text-sm" />
            {customCategory ? (
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Category name" className="h-8 w-28 text-xs" autoFocus onKeyDown={(e) => e.key === 'Escape' && setCustomCategory(false)} />
            ) : (
              <select value={newCategory} onChange={(e) => handleCategoryChange(e.target.value)} className={cn(selectClass, 'h-8 px-2 text-xs')}>
                <option value="">No category</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__new">+ New...</option>
              </select>
            )}
            <select value={newCadence} onChange={(e) => setNewCadence(e.target.value as Cadence)} className={cn(selectClass, 'h-8 px-2 text-xs')} title="Cadence">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <Input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder={newCadence === 'monthly' ? '1' : '7'} type="number" min={0} max={newCadence === 'monthly' ? 31 : 7} className="h-8 w-14 px-1 text-center text-sm" title={newCadence === 'monthly' ? 'Days per month goal' : 'Days per week goal'} />
            <Button variant="secondary" size="icon" onClick={addHabit} aria-label="Add habit">
              <Plus />
            </Button>
          </div>
        </WidgetCard>

        {/* Stats Column */}
        <div className="flex flex-col gap-6">
          <StatTile
            label="Weekly consistency"
            value={`${weeklyScore}%`}
            sub={`${totalCompleted} of ${totalGoals} goal completions`}
          />

          <WidgetCard title="Streaks" delay={0.2}>
            <div className="flex flex-col gap-2">
              {habits.map((habit) => {
                const { cadence, goal } = getProgress(habit)
                const unit = cadence === 'monthly' ? 'mo' : 'd'
                const label = cadence === 'monthly' ? `${goal}x/mo` : (goal < 7 ? `${goal}x/wk` : null)
                const streak = getStreakFor(habit)
                return (
                  <div key={habit.id} className="flex items-center justify-between rounded-md px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm text-foreground">{habit.emoji} {habit.name}</span>
                      {label && <span className="shrink-0 font-mono text-3xs text-foreground-faint">{label}</span>}
                    </div>
                    <Chip variant={streak > 0 ? 'success' : 'neutral'} className="shrink-0 tabular-nums">
                      <Flame />
                      {streak}{unit}
                    </Chip>
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
                <div key={achievement.label} className="flex items-center gap-3 rounded-md px-2 py-1.5">
                  <Trophy className={cn('h-4 w-4', achievement.unlocked ? 'text-foreground' : 'text-foreground-faint')} />
                  <span className={cn('text-sm', achievement.unlocked ? 'text-foreground' : 'text-muted-foreground')}>{achievement.label}</span>
                  <Chip size="sm" variant={achievement.unlocked ? 'success' : 'neutral'} className="ml-auto">
                    {achievement.unlocked ? 'unlocked' : 'locked'}
                  </Chip>
                </div>
              ))}
            </div>
          </WidgetCard>
        </div>
      </div>
    </PageShell>
  )
}
