import { useState } from 'react'
import { ChevronLeft, ChevronRight, List, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/shared/Modal'
import type { ExerciseLog, WorkoutDay } from '@/types/gym'

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
      <nav aria-label="Workout exercises" className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="lg" onClick={() => onSelect(index - 1)} disabled={index === 0} aria-label="Previous exercise"><ChevronLeft />Previous</Button>
        <Button variant="outline" size="lg" onClick={() => setOpen(true)}><List />Exercises</Button>
        <Button variant="outline" size="lg" onClick={() => onSelect(index + 1)} disabled={index >= logs.length - 1} aria-label="Next exercise">Next<ChevronRight /></Button>
      </nav>
      <Modal open={open} onOpenChange={setOpen} title="Your exercises" description="Choose an exercise to log or edit its sets." size="lg">
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {logs.map((log, exerciseIndex) => {
            const exercise = plan.exercises.find((item) => item.id === log.exerciseId)
            const completed = log.sets.filter((set) => set.completed).length
            return (
              <Button key={log.exerciseId} variant={index === exerciseIndex ? 'accent-outline' : 'outline'}
                className="h-auto min-h-14 w-full justify-start whitespace-normal px-4 py-3 text-left"
                onClick={() => { onSelect(exerciseIndex); setOpen(false) }} aria-current={index === exerciseIndex ? 'step' : undefined}>
                {completed === log.sets.length && completed > 0 ? <Check className="text-success" /> : <span className="w-4 text-muted-foreground">{exerciseIndex + 1}</span>}
                <span className="min-w-0 flex-1">{exercise?.name || log.exerciseName}</span>
                <span className="text-xs text-muted-foreground">{completed}/{log.sets.length}</span>
              </Button>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
