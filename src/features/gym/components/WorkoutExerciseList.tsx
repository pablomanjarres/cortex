import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Exercise } from '@/types/gym'
import { ExerciseImage } from './ExerciseImage'

export function WorkoutExerciseList({ exercises, onPreview, variant = 'detail' }: {
  exercises: Exercise[]
  onPreview: (exercise: Exercise) => void
  variant?: 'overview' | 'detail'
}) {
  if (exercises.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">No exercises yet. Add them in Edit plan.</p>
  }

  return (
    <ol className="divide-y divide-border/60">
      {exercises.map((exercise, index) => (
        <li key={exercise.id}>
        <Button
          variant="ghost"
          onClick={() => onPreview(exercise)}
          aria-label={`Preview ${exercise.name}`}
          className="h-auto min-h-24 w-full justify-start gap-2 rounded-lg px-0 py-3 text-left whitespace-normal sm:gap-3 sm:px-1"
        >
          <span aria-hidden="true" className="w-5 shrink-0 self-start pt-1 font-mono text-xs font-normal text-muted-foreground">
            {String(index + 1).padStart(2, '0')}
          </span>
          <ExerciseImage name={exercise.name} gifMediaId={exercise.gifMediaId} showBadge={false} className={cn('size-14 shrink-0 rounded-lg', variant === 'overview' ? 'sm:size-20' : 'sm:size-24')} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-snug text-foreground sm:text-base">{exercise.name}</span>
            <span className="mt-1 block text-sm font-normal text-muted-foreground">
              {exercise.sets} sets · {exercise.repsRange} reps
            </span>
            {exercise.startWeight && <span className="mt-1 block text-xs font-normal text-muted-foreground">Starting at {exercise.startWeight}</span>}
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Button>
        </li>
      ))}
    </ol>
  )
}
