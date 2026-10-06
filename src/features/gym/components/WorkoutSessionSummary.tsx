import { CheckCircle2 } from 'lucide-react'
import type { WorkoutSession } from '@/types/gym'
import { summarizeWorkoutSets } from '../domain/workout-progress'

export function WorkoutSessionSummary({ session }: { session: WorkoutSession }) {
  const { completedSets, totalSets } = summarizeWorkoutSets(session.exercises)
  const isFull = session.completedFully && totalSets > 0 && completedSets === totalSets
  const isSwim = session.workoutName.trim().toUpperCase() === 'SWIM'

  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CheckCircle2 className={isFull ? 'size-4 text-success' : 'size-4 text-muted-foreground'} />
        Saved today
      </p>
      <p className="mt-2 text-base font-semibold">{session.workoutName} — {isFull ? 'Full workout' : 'Partial workout'}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {isSwim
          ? `${session.exercises[0]?.sets[0]?.reps ?? 0} minutes of swimming`
          : `${completedSets} of ${totalSets} sets completed`}
      </p>
    </div>
  )
}
