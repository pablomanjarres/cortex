import { Select } from '@/components/ui/select'
import type { Dispatch, SetStateAction } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Cadence } from '@/lib/habits'
import { type HabitDraft } from './habitFormState'
import type { HabitEditor } from './useHabitEditor'

interface HabitEditFieldsProps {
  editor: HabitEditor
  compact?: boolean
}

export function HabitEditFields({ editor, compact = false }: HabitEditFieldsProps) {
  const { draft, setField, save } = editor
  return (
    <div className="flex items-center gap-1.5">
      <Input aria-label="Habit emoji" value={draft.emoji} onChange={(e) => setField('emoji', e.target.value)} className={cn(compact ? 'h-7 w-10 text-sm' : 'h-9 w-12', 'px-1 text-center')} />
      <Input aria-label="Habit name" value={draft.name} onChange={(e) => setField('name', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} className={compact ? 'h-7 text-sm' : 'h-9 flex-1'} autoFocus />
      <Select aria-label="Habit cadence" value={draft.cadence} onChange={(e) => setField('cadence', e.target.value as Cadence)} className={cn('w-auto', compact ? 'h-7 px-1 text-xs' : 'h-9 px-1 text-xs')}>
        <option value="weekly">/wk</option>
        <option value="monthly">/mo</option>
      </Select>
      <Input aria-label="Habit goal" value={draft.goal} onChange={(e) => setField('goal', e.target.value)} className={cn(compact ? 'h-7 w-12 text-sm' : 'h-9 w-14', 'px-1 text-center')} placeholder={draft.cadence === 'monthly' ? '1' : '7'} type="number" min={0} max={draft.cadence === 'monthly' ? 31 : 7} />
    </div>
  )
}

/** Edit fields with explicit Save and Cancel, for card layouts without a row action column. */
export function HabitEditPanel({ editor, compact = false, size }: HabitEditFieldsProps & { size: 'sm' | 'lg' }) {
  return (
    <div className="flex flex-col gap-2">
      <HabitEditFields editor={editor} compact={compact} />
      <div className="flex gap-2">
        <Button size={size} className="flex-1" onClick={editor.save}>Save</Button>
        <Button variant="ghost" size={size} onClick={editor.cancel}>Cancel</Button>
      </div>
    </div>
  )
}

interface HabitAddFormProps {
  draft: HabitDraft
  setDraft: Dispatch<SetStateAction<HabitDraft>>
  customCategory: boolean
  setCustomCategory: (value: boolean) => void
  categoryOptions: string[]
  onAdd: () => void
  compact?: boolean
  onHold?: boolean
  className?: string
}

export function HabitAddForm({
  draft,
  setDraft,
  customCategory,
  setCustomCategory,
  categoryOptions,
  onAdd,
  compact = false,
  onHold = false,
  className,
}: HabitAddFormProps) {
  const sizeClass = compact ? 'h-8' : 'h-10'
  const setField = <K extends keyof HabitDraft,>(key: K, value: HabitDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const handleCategoryChange = (value: string) => {
    if (value === '__new') {
      setCustomCategory(true)
      setField('category', '')
      return
    }
    setCustomCategory(false)
    setField('category', value)
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Input aria-label={onHold ? 'On hold habit emoji' : 'Habit emoji'} value={draft.emoji} onChange={(e) => setField('emoji', e.target.value)} placeholder="🎯" className={cn(sizeClass, compact ? 'w-12 text-sm' : 'w-12', 'px-1 text-center')} />
      <Input aria-label={onHold ? 'On hold habit name' : 'Habit name'} value={draft.name} onChange={(e) => setField('name', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAdd()} placeholder={onHold ? 'Save for later...' : 'New habit...'} className={cn(sizeClass, compact ? 'flex-1 text-sm' : 'min-w-[120px] flex-1')} />
      {customCategory ? (
        <Input
          value={draft.category}
          aria-label={onHold ? 'On hold habit category' : 'Habit category'}
          onChange={(e) => setField('category', e.target.value)}
          placeholder="Category name"
          className={cn(sizeClass, compact ? 'w-28 text-xs' : 'w-28 text-sm')}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') setCustomCategory(false)
          }}
        />
      ) : (
        <Select aria-label={onHold ? 'On hold habit category' : 'Habit category'} value={draft.category} onChange={(e) => handleCategoryChange(e.target.value)} className={cn('w-auto', sizeClass, compact ? 'px-2 text-xs' : 'px-2 text-sm')}>
          <option value="">No category</option>
          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="__new">+ New...</option>
        </Select>
      )}
      <Select aria-label={onHold ? 'On hold habit cadence' : 'Habit cadence'} value={draft.cadence} onChange={(e) => setField('cadence', e.target.value as Cadence)} className={cn('w-auto', sizeClass, compact ? 'px-2 text-xs' : 'px-2 text-sm')} title="Cadence">
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </Select>
      <Input aria-label={onHold ? 'On hold habit goal' : 'Habit goal'} value={draft.goal} onChange={(e) => setField('goal', e.target.value)} placeholder={draft.cadence === 'monthly' ? '1' : '7'} type="number" min={0} max={draft.cadence === 'monthly' ? 31 : 7} className={cn(sizeClass, compact ? 'w-14 text-sm' : 'w-14', 'px-1 text-center')} title={draft.cadence === 'monthly' ? 'Days per month goal' : 'Days per week goal'} />
      <Button variant="secondary" size={compact ? 'icon' : 'icon-lg'} className={compact ? undefined : 'size-10'} onClick={onAdd} aria-label={onHold ? 'Add habit on hold' : 'Add habit'}>
        <Plus className={compact ? undefined : 'size-5'} />
      </Button>
    </div>
  )
}
