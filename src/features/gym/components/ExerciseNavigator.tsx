import { useState } from 'react'
import { ChevronLeft, ChevronRight, List, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/shared/Modal'
import type { ExerciseLog, WorkoutDay } from '@/types/gym'
import { ExerciseImage } from './ExerciseImage'

interface ExerciseNavigatorProps {
  plan: WorkoutDay
  logs: ExerciseLog[]
  index: number
  onSelect: (index: number) => void
}

export function ExerciseNavigator({ plan, logs, index, onSelect }: ExerciseNavigatorProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <nav aria-label="Workout exercises" className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Exercise <span className="tabular-nums text-foreground">{index + 1}/{logs.length}</span></p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-lg" onClick={() => onSelect(index - 1)} disabled={index === 0} aria-label="Previous exercise"><ChevronLeft /></Button>
          <Button variant="ghost" size="lg" className="px-2" onClick={() => setOpen(true)}><List />Exercises</Button>
          <Button variant="ghost" size="icon-lg" onClick={() => onSelect(index + 1)} disabled={index >= logs.length - 1} aria-label="Next exercise"><ChevronRight /></Button>
        </div>
      </nav>
      <Modal open={open} onOpenChange={setOpen} title="Your exercises" description="Choose an exercise to log or edit its sets." size="lg">
        <div className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {logs.map((log, exerciseIndex) => {
            const exercise = plan.exercises.find((item) => item.id === log.exerciseId)
            const completed = log.sets.filter((set) => set.completed).length
            return (
              <Button key={log.exerciseId} variant={index === exerciseIndex ? 'accent-outline' : 'ghost'}
                className="h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-none px-2 py-3 text-left"
                onClick={() => { onSelect(exerciseIndex); setOpen(false) }} aria-current={index === exerciseIndex ? 'step' : undefined}>
                <ExerciseImage name={exercise?.name || log.exerciseName} gifMediaId={exercise?.gifMediaId} className="h-12 w-12 shrink-0 rounded-md" showBadge={false} />
                <span className="min-w-0 flex-1">{exercise?.name || log.exerciseName}</span>
                {completed === log.sets.length && completed > 0 && <Check className="text-success" />}
                <span className="text-xs text-muted-foreground">{completed}/{log.sets.length}</span>
              </Button>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
