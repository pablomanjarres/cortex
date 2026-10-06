import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/shared/Modal'
import type { Exercise } from '@/types/gym'
import { ExerciseImage } from './ExerciseImage'

export function ExerciseGuide({ exercise }: { exercise: Exercise }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="lg" onClick={() => setOpen(true)}><BookOpen />Exercise guide</Button>
      <Modal open={open} onOpenChange={setOpen} title={exercise.name} description="Movement guide" size="lg" className="max-h-[calc(100dvh-2rem)] overflow-y-auto [&_[data-slot=dialog-close]]:size-11">
        <ExerciseImage name={exercise.name} animated className="h-64 w-full overflow-hidden rounded-lg sm:h-80" />
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{exercise.notes || 'Use a controlled range of motion and choose a weight you can lift with good form.'}</p>
      </Modal>
    </>
  )
}
