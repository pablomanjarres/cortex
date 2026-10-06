import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/shared/Modal'

interface TrainingHeaderProps {
  name: string
  elapsed: string
  completedSets: number
  totalSets: number
  onFinish: () => void
  onDiscard: () => void
}

export function TrainingHeader({ name, elapsed, completedSets, totalSets, onFinish, onDiscard }: TrainingHeaderProps) {
  const [confirmation, setConfirmation] = useState<'finish' | 'discard' | null>(null)
  const finishing = confirmation === 'finish'
  return (
    <>
      <header className="surface rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Workout in progress</p>
            <h2 className="mt-1 text-lg font-semibold">{name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{completedSets} of {totalSets} sets <span aria-hidden="true">·</span> <span className="font-mono tabular-nums">{elapsed}</span></p>
          </div>
          <Button variant="outline" size="lg" onClick={() => setConfirmation('finish')}>Finish workout</Button>
        </div>
        <div role="progressbar" aria-label="Workout progress" aria-valuemin={0} aria-valuemax={totalSets || 1} aria-valuenow={completedSets} className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${totalSets ? completedSets / totalSets * 100 : 0}%` }} />
        </div>
      </header>
      <Button variant="ghost" size="lg" className="w-full" onClick={() => setConfirmation('discard')}>Discard workout</Button>
      <Modal
        open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null) }}
        title={finishing ? 'Finish this workout?' : 'Discard this workout?'}
        description={finishing ? 'Save your logged sets. Any unfinished sets will stay incomplete.' : 'Your sets from this workout will be removed.'}
        footer={<>
          <Button variant="outline" size="lg" onClick={() => setConfirmation(null)}>Keep training</Button>
          <Button variant={finishing ? 'default' : 'destructive'} size="lg" onClick={finishing ? onFinish : onDiscard}>
            {finishing ? 'Save workout' : 'Discard workout'}
          </Button>
        </>}
      >
        <p className="text-sm text-muted-foreground">{completedSets} of {totalSets} sets logged.</p>
      </Modal>
    </>
  )
}
