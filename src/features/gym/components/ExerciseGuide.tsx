import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Modal } from '@/components/shared/Modal'
import type { Exercise } from '@/types/gym'
import { ExerciseImage } from './ExerciseImage'
import { GYM_SCROLL_DIALOG_CLASS } from './gym-dialog'

/** Movement guide for one exercise: animated demo, prescription, and notes. */
export function ExerciseGuideDialog({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  return (
    <Modal
      open={!!exercise}
      onOpenChange={(open) => !open && onClose()}
      title={exercise?.name}
      description="Movement guide"
      size="lg"
      className={GYM_SCROLL_DIALOG_CLASS}
    >
      {exercise && (
        <>
          <ExerciseImage name={exercise.name} gifMediaId={exercise.gifMediaId} animated className="h-64 w-full overflow-hidden rounded-lg sm:h-80" />
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Chip size="sm" className="tabular-nums text-foreground">
              {exercise.sets}×{exercise.repsRange}
            </Chip>
            {exercise.startWeight && <Chip size="sm">{exercise.startWeight}</Chip>}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{exercise.notes || 'Use a controlled range of motion and choose a weight you can lift with good form.'}</p>
        </>
      )}
    </Modal>
  )
}

export function ExerciseGuide({ exercise }: { exercise: Exercise }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="lg" onClick={() => setOpen(true)}><BookOpen />Exercise guide</Button>
      <ExerciseGuideDialog exercise={open ? exercise : null} onClose={() => setOpen(false)} />
    </>
  )
}
