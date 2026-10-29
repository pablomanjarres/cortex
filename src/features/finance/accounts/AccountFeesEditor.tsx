import { Plus, Trash2 } from 'lucide-react'
import { Field } from '@/components/shared/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { MAX_FEES_PER_ACCOUNT, type FeeCadence } from './account-model'
import { FEE_CADENCES } from './account-options'
import { useToday } from '@/lib/use-today'

export interface FeeDraft { id: string; name: string; amount: string; cadence: FeeCadence; nextChargeDate: string; budgetAmountCOP: string; budgetStartMonth: string }

export function AccountFeesEditor({ fees, currency, onChange }: { fees: FeeDraft[]; currency: string; onChange: (fees: FeeDraft[]) => void }) {
  const today = useToday()
  const change = (id: string, patch: Partial<FeeDraft>) => onChange(fees.map((fee) => fee.id === id ? { ...fee, ...patch } : fee))
  return <fieldset className="min-w-0 space-y-3 border-t border-border pt-4">
    <legend className="pr-2 text-sm font-medium">Fees</legend>
    <div className="flex justify-end">
      <Button type="button" variant="secondary" size="sm" disabled={fees.length >= MAX_FEES_PER_ACCOUNT}
        onClick={() => onChange([...fees, { id: crypto.randomUUID(), name: '', amount: '', cadence: 'monthly', nextChargeDate: '', budgetAmountCOP: '', budgetStartMonth: today.slice(0, 7) }])}><Plus />Add fee</Button>
    </div>
    {fees.length === 0 && <p className="text-xs text-muted-foreground">Add management, insurance, annual, or other charges.</p>}
    {fees.map((fee, index) => <div key={fee.id} className="space-y-3 rounded-md border border-border p-3" role="group" aria-label={`Fee ${index + 1}`}>
      <div className="flex items-start gap-2">
        <Field label="Fee name" className="flex-1">{(id) => <Input id={id} value={fee.name} maxLength={80} onChange={(e) => change(fee.id, { name: e.target.value })} />}</Field>
        <Button type="button" variant="ghost" size="icon" className="mt-4 shrink-0" aria-label={`Remove fee ${index + 1}`}
          onClick={() => onChange(fees.filter((entry) => entry.id !== fee.id))}><Trash2 /></Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fee amount">{(id) => <Input id={id} inputMode="decimal" value={fee.amount} onChange={(e) => change(fee.id, { amount: e.target.value })} />}</Field>
        <Field label="Frequency">{(id) => <Select id={id} value={fee.cadence} onChange={(e) => change(fee.id, { cadence: e.target.value as FeeCadence })}>
          {FEE_CADENCES.map((cadence) => <option key={cadence.value} value={cadence.value}>{cadence.label}</option>)}
        </Select>}</Field>
        <Field label="First charge date" hint="Optional. Use the exact date when known.">{(id) => <Input id={id} type="date" value={fee.nextChargeDate} onChange={(e) => change(fee.id, { nextChargeDate: e.target.value })} />}</Field>
        {!fee.nextChargeDate && <Field label="Budget start month" hint="Schedules budget rows without adding an estimated day to Upcoming dates.">{(id) => <Input id={id} type="month" value={fee.budgetStartMonth} onChange={(e) => change(fee.id, { budgetStartMonth: e.target.value })} />}</Field>}
        {currency !== 'COP' && <Field label="Budget amount (COP)" hint="COP cost per charge. Required to include this fee in budget totals.">{(id) => <Input id={id} inputMode="numeric" value={fee.budgetAmountCOP} onChange={(e) => change(fee.id, { budgetAmountCOP: e.target.value })} />}</Field>}
      </div>
    </div>)}
  </fieldset>
}
