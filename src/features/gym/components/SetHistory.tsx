import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SetLog } from '@/types/gym'

interface SetHistoryProps {
  sets: SetLog[]
  currentIndex: number
  onEdit: (index: number) => void
  onRemove: (index: number) => void
  onAdd: () => void
}

export function SetHistory({ sets, currentIndex, onEdit, onRemove, onAdd }: SetHistoryProps) {
  const completed = sets.filter((set) => set.completed).length
  return (
    <details className="mt-2 border-b border-border">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
        <span>All sets</span><span className="text-muted-foreground"><span className="tabular-nums">{completed}/{sets.length}</span> logged · View</span>
      </summary>
      <ol className="divide-y divide-border border-t border-border">
        {sets.map((set, index) => (
          <li key={index} className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 text-sm">
              <span className="flex items-center gap-1.5 font-medium">{set.completed && <Check className="h-4 w-4 text-success" />}Set {index + 1}{!set.completed && index === currentIndex && <span className="text-accent">· Current</span>}</span>
              <span className="text-muted-foreground">{set.weight} kg × {set.reps}{!set.completed && ' · Upcoming'}</span>
            </span>
            <Button variant="ghost" size="icon-lg" onClick={() => onEdit(index)} aria-label={`Edit set ${index + 1}`}><Pencil /></Button>
            <Button variant="ghost" size="icon-lg" disabled={sets.length <= 1} onClick={() => onRemove(index)} aria-label={`Remove set ${index + 1}`}><Trash2 /></Button>
          </li>
        ))}
      </ol>
      <div className="p-3"><Button variant="outline" size="lg" className="w-full" onClick={onAdd}><Plus />Add set</Button></div>
    </details>
  )
}
