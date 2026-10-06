import { Dumbbell, List, Pencil, Play, Square, Waves } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Exercise, WorkoutDay, WorkoutSession } from '@/types/gym'
import { WorkoutSessionSummary } from './WorkoutSessionSummary'
import { WorkoutExerciseList } from './WorkoutExerciseList'
import { WorkoutWeekSelector } from './WorkoutWeekSelector'
import { isSwimWorkout, isWorkoutScheduledToday } from '../domain/workout-plan'

export function WorkoutOverview({ plans, selectedDay, onSelect, onStart, onView, onEdit, onPreview, session, swimElapsed, onStopSwim }: {
  plans: WorkoutDay[]
  selectedDay: WorkoutDay
  onSelect: (dayId: string) => void
  onStart: () => void
  onView: () => void
  onEdit: () => void
  onPreview: (exercise: Exercise) => void
  session?: WorkoutSession
  swimElapsed: number | null
  onStopSwim: () => void
}) {
  const isSwim = isSwimWorkout(selectedDay.name)
  const isRedo = session?.workoutDayId === selectedDay.id
  const totalSets = selectedDay.exercises.reduce((total, exercise) => total + exercise.sets, 0)
  const scheduledToday = isWorkoutScheduledToday(selectedDay)

  return (
    <div className="min-w-0 space-y-4">
      <WorkoutWeekSelector plans={plans} selectedId={selectedDay.id} onSelect={onSelect} disabled={swimElapsed !== null} />
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-4 lg:sticky lg:top-6">
          <section className="surface overflow-hidden rounded-xl">
            <div className="relative flex h-56 flex-col justify-end overflow-hidden bg-focus-surface p-5 sm:p-6 lg:h-72">
              {isSwim ? (
                <Waves aria-hidden="true" className="absolute -right-4 top-4 size-52 text-accent/20" strokeWidth={1} />
              ) : (
                <>
                  <img src="/images/gym-strength-hero.webp" alt="" className="absolute inset-0 size-full object-cover object-[65%_center]" />
                  <div className="absolute inset-0 bg-linear-to-r from-card/95 via-card/50 to-card/10" />
                  <div className="absolute inset-0 bg-linear-to-t from-card/90 via-card/10 to-transparent" />
                </>
              )}
              <div className="relative">
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-accent">
                  {isSwim ? <Waves className="size-4" /> : <Dumbbell className="size-4" />}
                  {swimElapsed !== null ? 'Swim in progress' : scheduledToday ? 'Today’s workout' : 'Your workout'}
                </p>
                <h2 className="break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{selectedDay.name}</h2>
                {swimElapsed !== null && (
                  <p className="mt-3 font-mono text-4xl font-semibold tabular-nums" aria-label="Swim time">
                    {String(Math.floor(swimElapsed / 60)).padStart(2, '0')}:{String(swimElapsed % 60).padStart(2, '0')}
                  </p>
                )}
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <p>{selectedDay.dayOfWeek} · {selectedDay.time}</p>
                <p>{isSwim ? 'Swim timer' : `${selectedDay.exercises.length} exercises · ${totalSets} sets`}</p>
              </div>
              <Button
                size="lg"
                className="mt-4 min-h-14 w-full text-base"
                variant={swimElapsed !== null ? 'destructive' : 'default'}
                onClick={swimElapsed !== null ? onStopSwim : onStart}
                disabled={!isSwim && selectedDay.exercises.length === 0}
              >
                {swimElapsed !== null ? <Square className="fill-current" /> : <Play />}
                {swimElapsed !== null ? 'Stop & log swim' : isRedo ? (isSwim ? 'Redo swim' : 'Redo workout') : isSwim ? 'Start swim' : 'Start workout'}
              </Button>
            </div>
          </section>
          {session && <WorkoutSessionSummary session={session} />}
        </div>
        <section className="surface min-w-0 rounded-xl p-4 sm:p-5" aria-label={isSwim ? 'Swim session' : 'Exercise plan'}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold">{isSwim ? 'Swim session' : 'Exercise plan'}</h3>
            <Button variant="ghost" size="lg" className="min-h-11 px-2" onClick={onEdit} disabled={swimElapsed !== null}>
              <Pencil /> Edit plan
            </Button>
          </div>
          {isSwim ? (
            <p className="py-4 text-sm leading-relaxed text-muted-foreground">Start the timer when you enter the pool. Stop to save your swim.</p>
          ) : <WorkoutExerciseList exercises={selectedDay.exercises} onPreview={onPreview} variant="overview" />}
          <Button variant="ghost" size="lg" className="mt-2 min-h-11 w-full" onClick={onView}>
            <List /> {isSwim ? 'View swim plan' : 'View exercises'}
          </Button>
        </section>
      </div>
    </div>
  )
}
