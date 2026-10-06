import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SetLog } from '@/types/gym'
import { SetValueControl } from './SetValueControl'

interface SetEntryProps {
  index: number
  count: number
  set: SetLog
  previous?: SetLog
  onChange: (field: 'weight' | 'reps', value: number) => void
  onAdjust: (field: 'weight' | 'reps', delta: number) => void
  onComplete: (completedAt: number) => void
}

export function SetEntry({ index, count, set, previous, onChange, onAdjust, onComplete }: SetEntryProps) {
  return (
    <section aria-label={`Current set ${index + 1}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xl font-semibold">Set {index + 1} <span className="text-base font-normal text-muted-foreground">of {count}</span></h4>
        {previous?.completed && <p className="text-sm text-muted-foreground">Last time: {previous.weight} kg × {previous.reps}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <SetValueControl value={set.weight} unit="kg" onDec={() => onAdjust('weight', -2.5)} onInc={() => onAdjust('weight', 2.5)} onChange={(value) => onChange('weight', value)} />
        <SetValueControl value={set.reps} unit="reps" onDec={() => onAdjust('reps', -1)} onInc={() => onAdjust('reps', 1)} onChange={(value) => onChange('reps', value)} />
      </div>
      <Button className="mt-4 h-14 w-full text-base" onClick={() => onComplete(Date.now())}><Check />Log set</Button>
    </section>
  )
}
