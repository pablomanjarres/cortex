import { ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Assignment } from '@/features/student/student-types'
import type { HabitChip } from './homePanelUtils'

export function NeedsAttention({
  overdue,
  calendarError,
  onOpenStudent,
  onRetryCalendar,
}: {
  overdue: Assignment[]
  calendarError: string | null
  onOpenStudent: () => void
  onRetryCalendar: () => void
}) {
  if (overdue.length === 0 && !calendarError) return null

  return (
    <section className="rounded-[1.5rem] border border-destructive/20 bg-destructive/10 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-destructive/15 p-2 text-destructive"><ClipboardList className="size-5" /></span>
          <div>
            <h2 className="font-semibold text-foreground">Needs attention</h2>
            <p className="text-sm text-muted-foreground">
              {overdue.length > 0 ? `${overdue.length} overdue assignment${overdue.length === 1 ? '' : 's'}` : calendarError}
            </p>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {overdue.length > 0 && <Button variant="secondary" size="sm" onClick={onOpenStudent}>Open Student</Button>}
          {calendarError && <Button variant="secondary" size="sm" onClick={onRetryCalendar}>Retry Calendar</Button>}
        </div>
      </div>
    </section>
  )
}

export function DailyShortcuts({ habits, onOpenStudent, onOpenCalendar }: { habits: HabitChip[]; onOpenStudent: () => void; onOpenCalendar: () => void }) {
  return (
    <section className="surface rounded-[1.5rem] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Today shortcuts</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onOpenStudent}>Student</Button>
          <Button variant="secondary" size="sm" onClick={onOpenCalendar}>Calendar</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {habits.map((habit) => (
          <Button
            key={habit.id}
            variant={habit.done ? 'accent-outline' : 'secondary'}
            size="sm"
            aria-pressed={habit.done}
            onClick={habit.onToggle}
          >
            <span aria-hidden>{habit.emoji}</span>
            {habit.name}
          </Button>
        ))}
      </div>
    </section>
  )
}
