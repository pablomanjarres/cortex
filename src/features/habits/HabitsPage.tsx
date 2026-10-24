import { DateStepper } from '@/components/shared/DateStepper'
import { useState, useEffect, useRef, Fragment } from 'react'
import { readStore, useStore } from '@/lib/store'
import { getWeekDates, localDate, getWeekLabel } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { Chip } from '@/components/ui/chip'
import { Flame, Trophy } from 'lucide-react'
import type { Habit } from '@/lib/habits'
import { isActiveHabit } from '@/lib/habits'
import { HabitAddForm, HabitEditFields, HabitEditPanel } from './HabitForms'
import { ActiveHabitActions, HabitDayToggle, HabitGoalProgress } from './HabitControls'
import { HabitNoteButton, HabitNoteEditor } from './HabitNotes'
import { OnHoldHabitsSection } from './OnHoldHabitsSection'
import { emptyHabitDraft, type HabitDraft } from './habitFormState'
import { migrateLegacyHabitHistory, weekDays, type HabitHistory } from './habit-migration'
import { DEFAULT_HABITS, LEGACY_DEFAULT_HABIT_IDS } from './habit-defaults'
import { habitGoalLabel, habitProgress, habitStreak, weeklyHabitScore, withGoal } from './habit-progress'
import { useHabitEditor } from './useHabitEditor'

function getWeekDatesWithOffset(offset: number): string[] {
  const anchor = new Date()
  anchor.setDate(anchor.getDate() + offset * 7)
  return getWeekDates(localDate(anchor))
}

function getMonthLabel(anchorDateStr: string): string {
  return new Date(anchorDateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'long' })
}

export function HabitsPage() {
  const [habits, setHabits] = useStore<Habit[]>('cortex-habits', DEFAULT_HABITS)
  const [grid, setGrid] = useStore<HabitHistory>('cortex-habits-grid', {})
  const [habitHistory, setHabitHistory] = useStore<HabitHistory>('cortex-habits-history', {})
  const [activeDraft, setActiveDraft] = useState<HabitDraft>(() => emptyHabitDraft())
  const [holdDraft, setHoldDraft] = useState<HabitDraft>(() => emptyHabitDraft())
  const [customCategory, setCustomCategory] = useState({ active: false, hold: false })
  const editor = useHabitEditor(setHabits)
  const [weekOffset, setWeekOffset] = useState(0)
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)

  const weekDates = getWeekDatesWithOffset(weekOffset)
  // Monthly-cadence habits are scored over the calendar month of the viewed week.
  const monthLabel = getMonthLabel(weekDates[0])

  // One-time migration from old weekly grid to date-based history
  useEffect(() => {
    if (Object.keys(grid).length === 0 || Object.keys(habitHistory).length > 0) return
    let cancelled = false
    void migrateLegacyHabitHistory(
      grid,
      getWeekDatesWithOffset(0),
      () => readStore<HabitHistory>('cortex-habits-history', {}),
      (update) => { if (!cancelled) setHabitHistory(update) },
    )
    return () => { cancelled = true }
  }, [grid, habitHistory, setHabitHistory])

  // One-time migration from old default habits to new categorized ones
  const migratedRef = useRef(false)
  useEffect(() => {
    if (migratedRef.current) return
    const hasOldIds = habits.length > 0 && habits.every(h => LEGACY_DEFAULT_HABIT_IDS.includes(h.id))
    const hasNoCategories = habits.every(h => !h.category)
    if (hasOldIds && hasNoCategories) {
      migratedRef.current = true
      setHabits(DEFAULT_HABITS)
    }
  }, [habits, setHabits])

  const activeHabits = habits.filter(isActiveHabit)
  const heldHabits = habits.filter(h => h.onHold)
  const categoryOptions = [...new Set(habits.map(h => h.category).filter(Boolean))] as string[]

  // Group active habits by category for rendering
  const categories = [...new Set(activeHabits.map(h => h.category).filter(Boolean))] as string[]
  const uncategorized = activeHabits.filter(h => !h.category)

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

  const addHabit = (
    draft: HabitDraft,
    setDraft: (draft: HabitDraft) => void,
    draftKey: 'active' | 'hold',
    onHold = false
  ) => {
    if (!draft.name.trim()) return
    const habit = withGoal<Habit>({
      id: Date.now().toString(),
      name: draft.name.trim(),
      emoji: draft.emoji || '⭐',
      category: draft.category || undefined,
      onHold,
    }, draft.cadence, draft.goal)
    setHabits((prev) => [...prev, habit])
    setDraft(emptyHabitDraft())
    setCustomCategory((prev) => ({ ...prev, [draftKey]: false }))
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
          const rest = { ...next[date] }
          delete rest[id]
          next[date] = rest
        }
      }
      return next
    })
  }

  const setHabitOnHold = (id: string, onHold: boolean) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, onHold } : h)))
  }

  const toggleNote = (id: string) => setExpandedNoteId((cur) => (cur === id ? null : id))
  const setHabitContext = (id: string, value: string) =>
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, context: value.trim() ? value : undefined } : h)))

  const getProgress = (habit: Habit) => habitProgress(habit, habitHistory, weekDates)
  const { score: weeklyScore, completed: totalCompleted, goals: totalGoals } = weeklyHabitScore(habits, habitHistory, weekDates)

  const todayDayIndex = (() => {
    const d = new Date().getDay()
    return (d + 6) % 7 // 0=Mon, 6=Sun
  })()

  const habitActions = (habit: Habit, dense: boolean) => (
    <ActiveHabitActions
      dense={dense}
      editing={editor.editingId === habit.id}
      onEdit={() => editor.start(habit)}
      onSave={editor.save}
      onArchive={() => setHabitOnHold(habit.id, true)}
      onDelete={() => removeHabit(habit.id)}
    />
  )

  const renderHabitRow = (habit: Habit) => (
    <Fragment key={habit.id}>
    <tr className="group border-t border-border/60">
      <td className="py-2.5 pr-4 text-sm text-foreground">
        {editor.editingId === habit.id ? (
          <HabitEditFields editor={editor} compact />
        ) : (
          <span className="inline-flex items-center">
            <span className="mr-2">{habit.emoji}</span>{habit.name}
            <HabitNoteButton habit={habit} expanded={expandedNoteId === habit.id} onToggle={() => toggleNote(habit.id)} />
          </span>
        )}
      </td>
      {weekDays.map((day, dayIndex) => (
        <td key={day} className="py-2.5 text-center">
          <HabitDayToggle
            habitName={habit.name}
            day={day}
            checked={!!habitHistory[weekDates[dayIndex]]?.[habit.id]}
            isToday={dayIndex === todayDayIndex}
            dense
            onToggle={() => toggle(habit.id, dayIndex)}
          />
        </td>
      ))}
      <td className="py-2.5 text-center">
        <HabitGoalProgress progress={getProgress(habit)} monthLabel={monthLabel} className="text-sm" />
      </td>
      <td className="py-2.5 text-center">
        {habitActions(habit, true)}
      </td>
    </tr>
    {expandedNoteId === habit.id && (
      <tr>
        <td colSpan={weekDays.length + 3} className="px-0 pb-3 pt-0">
          <HabitNoteEditor habit={habit} onChange={(value) => setHabitContext(habit.id, value)} />
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
        <DateStepper label={weekOffset === 0 ? 'This week' : getWeekLabel(weekDates[0])}
          previousLabel="Previous week" nextLabel="Next week" onPrevious={() => setWeekOffset(w => w - 1)}
          onNext={() => setWeekOffset(w => Math.min(w + 1, 0))} nextDisabled={weekOffset >= 0}
          onReset={() => setWeekOffset(0)} resetActive={weekOffset === 0} />
      </div>

      {/* ── Mobile: card layout ───────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:hidden">
        {[...categories, null].map((cat) => {
          const catHabits = cat ? activeHabits.filter(h => h.category === cat) : uncategorized
          if (catHabits.length === 0) return null
          return (
            <div key={cat || 'none'} className="space-y-3">
              {cat && (
                <p className="pt-2 font-mono text-2xs uppercase tracking-widest text-foreground-faint">{cat}</p>
              )}
              {catHabits.map((habit) => {
          const progress = getProgress(habit)
          const streak = habitStreak(habit, habitHistory)
          const streakUnit = progress.cadence === 'monthly' ? 'mo' : 'd'

          return (
            <div key={habit.id} className="surface rounded-xl p-4">
              {editor.editingId === habit.id ? (
                <HabitEditPanel editor={editor} size="lg" />
              ) : (
                <>
                  {/* Header row: emoji + name + streak + actions */}
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-1 sm:flex-nowrap">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="text-lg">{habit.emoji}</span>
                      <span className="truncate text-sm font-medium">{habit.name}</span>
                    </div>
                    <div className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto sm:gap-2">
                      {streak > 0 && (
                        <Chip size="sm" variant="success" className="tabular-nums">
                          <Flame />
                          {streak}{streakUnit}
                        </Chip>
                      )}
                      <HabitGoalProgress progress={progress} monthLabel={monthLabel} className="text-xs" />
                      <HabitNoteButton habit={habit} expanded={expandedNoteId === habit.id} onToggle={() => toggleNote(habit.id)} mobile />
                      {habitActions(habit, false)}
                    </div>
                  </div>
                  {/* Day circles */}
                  <div className="grid grid-cols-7 gap-0.5">
                    {weekDays.map((day, i) => (
                      <HabitDayToggle
                        key={day}
                        habitName={habit.name}
                        day={day}
                        checked={!!habitHistory[weekDates[i]]?.[habit.id]}
                        isToday={i === todayDayIndex}
                        dense={false}
                        onToggle={() => toggle(habit.id, i)}
                      />
                    ))}
                  </div>
                  {expandedNoteId === habit.id && (
                    <div className="mt-3">
                      <HabitNoteEditor habit={habit} onChange={(value) => setHabitContext(habit.id, value)} />
                    </div>
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
        <HabitAddForm
          draft={activeDraft}
          setDraft={setActiveDraft}
          customCategory={customCategory.active}
          setCustomCategory={(value) => setCustomCategory((prev) => ({ ...prev, active: value }))}
          categoryOptions={categoryOptions}
          onAdd={() => addHabit(activeDraft, setActiveDraft, 'active')}
          className="pt-2"
        />

        <OnHoldHabitsSection
          habits={heldHabits}
          layout="mobile"
          draft={holdDraft}
          setDraft={setHoldDraft}
          customCategory={customCategory.hold}
          setCustomCategory={(value) => setCustomCategory((prev) => ({ ...prev, hold: value }))}
          categoryOptions={categoryOptions}
          editor={editor}
          expandedNoteId={expandedNoteId}
          onAdd={() => addHabit(holdDraft, setHoldDraft, 'hold', true)}
          onActivate={(id) => setHabitOnHold(id, false)}
          onDelete={removeHabit}
          onToggleNote={toggleNote}
          onContextChange={setHabitContext}
        />
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
                const catHabits = activeHabits.filter(h => h.category === cat)
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
          <HabitAddForm
            draft={activeDraft}
            setDraft={setActiveDraft}
            customCategory={customCategory.active}
            setCustomCategory={(value) => setCustomCategory((prev) => ({ ...prev, active: value }))}
            categoryOptions={categoryOptions}
            onAdd={() => addHabit(activeDraft, setActiveDraft, 'active')}
            compact
            className="mt-4 border-t border-border/60 pt-4"
          />
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
              {activeHabits.map((habit) => {
                const unit = habit.cadence === 'monthly' ? 'mo' : 'd'
                const label = habitGoalLabel(habit)
                const streak = habitStreak(habit, habitHistory)
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

          <OnHoldHabitsSection
            habits={heldHabits}
            layout="desktop"
            draft={holdDraft}
            setDraft={setHoldDraft}
            customCategory={customCategory.hold}
            setCustomCategory={(value) => setCustomCategory((prev) => ({ ...prev, hold: value }))}
            categoryOptions={categoryOptions}
            editor={editor}
            expandedNoteId={expandedNoteId}
            onAdd={() => addHabit(holdDraft, setHoldDraft, 'hold', true)}
            onActivate={(id) => setHabitOnHold(id, false)}
              onDelete={removeHabit}
            onToggleNote={toggleNote}
            onContextChange={setHabitContext}
          />

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
