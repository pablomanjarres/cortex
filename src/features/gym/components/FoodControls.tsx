import type { KeyboardEvent, ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { FoodItem } from '@/types/gym'
import type { FoodDraft } from '../domain/nutrition'

/** A logged or planned food: name, quantity, macros, and an optional remove action. */
export function FoodRow({ food, dense = false, onRemove }: {
  food: FoodItem
  dense?: boolean
  onRemove?: () => void
}) {
  return (
    <div className={cn(
      'flex items-center justify-between border-t border-border/60 pb-0.5',
      dense ? 'pt-1.5 text-xs' : 'pt-2.5 text-sm sm:pb-0 sm:pt-1.5 sm:text-xs',
    )}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-foreground">{food.name}</span>
        {food.quantity && <span className="shrink-0 text-foreground-faint">{food.quantity}</span>}
      </div>
      <div className={cn('flex shrink-0 items-center', dense ? 'gap-2' : 'gap-3 sm:gap-2')}>
        <span className="font-mono tabular-nums text-muted-foreground">{food.protein}g · {food.calories}</span>
        {onRemove && (
          <Button
            variant="ghost"
            size={dense ? 'icon-xs' : 'icon-lg'}
            onClick={onRemove}
            aria-label={`Remove ${food.name}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Name, quantity, protein, and calories for a new food. Enter in the name or
 * calories field submits. `actions` sit after the macros.
 */
export function FoodDraftFields({ draft, onChange, onSubmit, dense = false, actions }: {
  draft: FoodDraft
  onChange: (draft: FoodDraft) => void
  onSubmit: () => void
  dense?: boolean
  actions: ReactNode
}) {
  const field = (key: keyof FoodDraft) => ({
    value: draft[key],
    onChange: (e: { target: { value: string } }) => onChange({ ...draft, [key]: e.target.value }),
  })
  const submitOnEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') onSubmit() }

  if (dense) {
    return (
      <div className="flex items-center gap-1.5 pt-1">
        <Input aria-label="Food name" placeholder="Name" {...field('name')} className="h-7 flex-1 text-xs" onKeyDown={submitOnEnter} />
        <Input aria-label="Quantity" placeholder="Qty" {...field('quantity')} className="h-7 w-16 text-xs" />
        <Input aria-label="Protein (g)" type="number" placeholder="Prot" {...field('protein')} className="h-7 w-14 text-xs" />
        <Input aria-label="Calories" type="number" placeholder="Cal" {...field('calories')} className="h-7 w-14 text-xs" onKeyDown={submitOnEnter} />
        {actions}
      </div>
    )
  }

  // Phone: name/quantity on one row, macros and actions on the next. Wider screens: one row.
  return (
    <div className="space-y-2 sm:flex sm:items-end sm:gap-2 sm:space-y-0">
      <div className="flex gap-2 sm:contents">
        <div className="flex-1 sm:flex-1">
          <Input aria-label="Food name" placeholder="Food name" {...field('name')} className="h-11 min-w-0 text-base" onKeyDown={submitOnEnter} />
        </div>
        <div className="w-20 sm:w-16">
          <Input aria-label="Quantity" placeholder="Qty" {...field('quantity')} className="h-11 min-w-0 text-base" />
        </div>
      </div>
      <div className="flex gap-2 sm:contents">
        <div className="min-w-0 flex-1 sm:w-20 sm:flex-none">
          <Input aria-label="Protein (g)" type="number" placeholder="Protein (g)" {...field('protein')} className="h-11 min-w-0 text-base" />
        </div>
        <div className="min-w-0 flex-1 sm:w-20 sm:flex-none">
          <Input aria-label="Calories" type="number" placeholder="Calories" {...field('calories')} className="h-11 min-w-0 text-base" onKeyDown={submitOnEnter} />
        </div>
        {actions}
      </div>
    </div>
  )
}
