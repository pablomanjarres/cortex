import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Exercise } from '@/types/gym'
import { ExerciseImage } from './ExerciseImage'

export function WorkoutExerciseList({ exercises, onPreview }: {
  exercises: Exercise[]
  onPreview: (exercise: Exercise) => void
}) {
  if (exercises.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">No exercises yet. Add them in Edit plan.</p>
  }

  return (
    <div className="divide-y divide-border/60">
      {exercises.map((exercise) => (
        <Button
          key={exercise.id}
          variant="ghost"
          onClick={() => onPreview(exercise)}
          aria-label={`Preview ${exercise.name}`}
          className="h-auto min-h-20 w-full justify-start gap-3 rounded-xl px-2 py-3 text-left whitespace-normal"
        >
          <ExerciseImage name={exercise.name} showBadge={false} className="h-14 w-14 shrink-0 rounded-xl" />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-foreground">{exercise.name}</span>
            <span className="mt-1 block text-sm font-normal text-muted-foreground">
              {exercise.sets} sets of {exercise.repsRange}{exercise.startWeight ? ` · ${exercise.startWeight}` : ''}
            </span>
          </span>
          <ChevronRight className="text-muted-foreground" />
        </Button>
      ))}
    </div>
  )
}
