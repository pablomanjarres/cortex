import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { localDate } from '@/lib/date-utils'
import type { WorkoutDay } from '@/types/gym'
import { workoutWeek } from '../domain/workout-week'

export function WorkoutWeekSelector({ plans, selectedId, onSelect, disabled }: {
  plans: WorkoutDay[]
  selectedId: string
  onSelect: (dayId: string) => void
  disabled: boolean
}) {
  const rail = useRef<HTMLDivElement>(null)
  const selectedButton = useRef<HTMLButtonElement>(null)
  const today = localDate()

  useEffect(() => {
    if (!rail.current || !selectedButton.current) return
    rail.current.scrollLeft = selectedButton.current.offsetLeft - (rail.current.clientWidth - selectedButton.current.clientWidth) / 2
  }, [selectedId])

  return (
    <section aria-label="Workout plans" className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <h3 className="font-semibold">This week</h3>
        <span className="text-muted-foreground">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
      </div>
      <div ref={rail} className="max-w-full overflow-x-auto overscroll-x-contain pb-1">
        <div className="relative flex min-w-max gap-2 p-1">
          {workoutWeek(plans).map(({ date, weekday, plan }) => {
            const selected = plan?.id === selectedId
            const shortDay = date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' }) : weekday
            const content = <>
              <span className="text-xs font-medium">{shortDay}</span>
              <span className="font-mono text-xl font-semibold tabular-nums">{date ? date.slice(-2) : '—'}</span>
              <span className="block w-full truncate text-xs">{plan?.name ?? 'No plan'}</span>
            </>
            return plan ? (
              <Button
                key={`${date ?? 'custom'}-${plan.id}`}
                ref={selected ? selectedButton : undefined}
                variant={selected ? 'default' : 'outline'}
                aria-label={`${weekday}${date ? ` ${date}` : ''}, ${plan.name}`}
                aria-pressed={selected}
                aria-current={date === today ? 'date' : undefined}
                disabled={disabled}
                onClick={() => onSelect(plan.id)}
                className="relative h-22 w-20 min-w-20 flex-1 flex-col gap-1 px-2"
              >
                {selected && <Check className="absolute right-1.5 top-1.5 size-3" />}
                {content}
              </Button>
            ) : (
              <div key={date} aria-label={`${weekday}, no workout planned`} className="flex h-22 w-20 min-w-20 flex-1 flex-col items-center justify-center gap-1 rounded-md border border-border/50 px-2 text-muted-foreground">
                {content}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
