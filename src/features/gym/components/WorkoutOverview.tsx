import { Check, Dumbbell, List, Pencil, Play, Square, Waves } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WorkoutDay, WorkoutSession } from '@/types/gym'
import { WorkoutSessionSummary } from './WorkoutSessionSummary'

export function WorkoutOverview({ plans, selectedDay, onSelect, onStart, onView, onEdit, session, swimElapsed, onStopSwim }: {
  plans: WorkoutDay[]
  selectedDay: WorkoutDay
  onSelect: (dayId: string) => void
  onStart: () => void
  onView: () => void
  onEdit: () => void
  session?: WorkoutSession
  swimElapsed: number | null
  onStopSwim: () => void
}) {
  const isSwim = selectedDay.name.trim().toUpperCase() === 'SWIM'
  const isRedo = session?.workoutDayId === selectedDay.id
  const totalSets = selectedDay.exercises.reduce((total, exercise) => total + exercise.sets, 0)
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const scheduledToday = selectedDay.dayOfWeek.trim().toLowerCase() === weekday.toLowerCase()

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-accent/20 bg-focus-surface p-5 text-foreground shadow-card sm:p-7">
        <div className="flex items-center gap-2 text-sm font-semibold text-accent">
          {isSwim ? <Waves className="size-4" /> : <Dumbbell className="size-4" />}
          {swimElapsed !== null ? 'Swim in progress' : scheduledToday ? 'Today’s workout' : 'Your workout'}
        </div>
        <h2 className="mt-6 break-words font-serif text-4xl italic sm:text-5xl">{selectedDay.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{selectedDay.dayOfWeek} · {selectedDay.time}</p>
        {swimElapsed !== null ? (
          <p className="mt-5 font-mono text-5xl font-semibold tabular-nums" aria-label="Swim time">
            {String(Math.floor(swimElapsed / 60)).padStart(2, '0')}:{String(swimElapsed % 60).padStart(2, '0')}
          </p>
        ) : (
          <p className="mt-5 text-base">
            {isSwim ? 'Warm-up, continuous swimming, then cool down.' : `${selectedDay.exercises.length} exercises · ${totalSets} sets`}
          </p>
        )}
        <Button
          size="lg"
          className="mt-6 min-h-14 w-full text-base"
          variant={swimElapsed !== null ? 'destructive' : 'default'}
          onClick={swimElapsed !== null ? onStopSwim : onStart}
          disabled={!isSwim && selectedDay.exercises.length === 0}
        >
          {swimElapsed !== null ? <Square className="fill-current" /> : <Play />}
          {swimElapsed !== null ? 'Stop & log swim' : isRedo ? (isSwim ? 'Redo swim' : 'Redo workout') : isSwim ? 'Start swim' : 'Start workout'}
        </Button>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="ghost" size="lg" className="min-h-12 px-2" onClick={onView}>
            <List /> {isSwim ? 'View swim plan' : 'View exercises'}
          </Button>
          <Button variant="ghost" size="lg" className="min-h-12 px-2" onClick={onEdit} disabled={swimElapsed !== null}>
            <Pencil /> Edit plan
          </Button>
        </div>
        {session && <div className="mt-5"><WorkoutSessionSummary session={session} /></div>}
      </section>

      <section aria-label="Workout plans" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h3 className="mb-3 text-base font-semibold">Choose a workout</h3>
        <div className="space-y-1">
          {plans.map((day) => (
            <Button
              key={day.id}
              variant={day.id === selectedDay.id ? 'accent-outline' : 'ghost'}
              aria-pressed={day.id === selectedDay.id}
              onClick={() => onSelect(day.id)}
              disabled={swimElapsed !== null}
              className="h-auto min-h-14 w-full justify-start gap-3 px-3 py-3 text-left whitespace-normal"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">{day.name}</span>
                <span className="mt-1 block text-sm font-normal text-muted-foreground">{day.dayOfWeek}</span>
              </span>
              {day.id === selectedDay.id && <Check className="text-accent" />}
            </Button>
          ))}
        </div>
      </section>
    </div>
  )
}
