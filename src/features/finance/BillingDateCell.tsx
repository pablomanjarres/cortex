import { useId, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Modal } from '@/components/shared/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cardDate } from './credit-card/card-format'

export function BillingDateCell({ name, date, billingDay, onChange }: {
  name: string; date: string | null; billingDay?: number; onChange: (day: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState('')
  const inputId = useId()
  const save = (value: number | null) => { onChange(value); setOpen(false) }
  return <>
    <Button variant="ghost" size="xs" className="mt-1 h-auto max-w-full justify-start px-1 text-2xs text-muted-foreground"
      aria-label={`${date ? 'Edit' : 'Set'} billing date for ${name}`}
      onClick={() => { setDay(String(billingDay ?? '')); setOpen(true) }}>
      <CalendarDays className="size-3" />{date ? `Bills ${cardDate(date)}` : 'Set billing date'}
    </Button>
    <Modal open={open} onOpenChange={setOpen} title={`Billing date for ${name}`}
      description="Choose the day this bill is due each month. Shorter months use their last day.">
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault()
        const value = Number(day)
        if (Number.isInteger(value) && value >= 1 && value <= 31) save(value)
      }}>
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="text-sm font-medium">Monthly billing day</label>
          <Input id={inputId} type="number" min={1} max={31} step={1} required value={day}
            onChange={(event) => setDay(event.target.value)} placeholder="1–31" autoFocus />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={billingDay === undefined} onClick={() => save(null)}>Clear billing date</Button>
          <Button type="submit">Save billing date</Button>
        </div>
      </form>
    </Modal>
  </>
}
