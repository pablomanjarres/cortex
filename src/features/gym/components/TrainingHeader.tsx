import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/shared/Modal'
import { Trash2 } from 'lucide-react'

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
      <header className="pb-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight sm:text-xl">{name}</h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span><span className="tabular-nums text-foreground">{completedSets}/{totalSets}</span> sets logged</span>
              <span className="font-mono tabular-nums">{elapsed}</span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-lg" aria-label="Discard workout" onClick={() => setConfirmation('discard')}><Trash2 /></Button>
            <Button variant="secondary" size="lg" className="px-4" aria-label="Finish workout" onClick={() => setConfirmation('finish')}>Finish</Button>
          </div>
        </div>
        <div role="progressbar" aria-label="Workout progress" aria-valuemin={0} aria-valuemax={totalSets || 1} aria-valuenow={completedSets} className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${totalSets ? completedSets / totalSets * 100 : 0}%` }} />
        </div>
      </header>
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
