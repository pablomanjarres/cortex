import { useId, useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/shared/Modal'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { FINANCE_CATEGORIES, type OneTimePayment } from './finance-model'

interface Props {
  year: number
  month: number
  monthLabel: string
  payments: OneTimePayment[]
  formatAmount: (amount: number) => string
  onSave: (payment: OneTimePayment) => void
  onDelete: (id: string) => void
}

type Draft = Omit<OneTimePayment, 'amount' | 'paid'> & { amount: string; status: 'Paid' | 'Upcoming'; mode: 'add' | 'edit' }

const pad = (value: number) => String(value).padStart(2, '0')

function initialDate(year: number, month: number): string {
  const today = new Date()
  const day = today.getFullYear() === year && today.getMonth() === month ? today.getDate() : 1
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

export function OneTimePayments({ year, month, monthLabel, payments, formatAmount, onSave, onDelete }: Props) {
  const formId = useId()
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0)

  const add = () => setDraft({
    id: crypto.randomUUID(), name: '', amount: '', date: initialDate(year, month),
    category: 'Other', status: 'Paid', mode: 'add',
  })
  const edit = (payment: OneTimePayment) => setDraft({
    ...payment, amount: String(payment.amount), status: payment.paid ? 'Paid' : 'Upcoming', mode: 'edit',
  })
  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft) return
    const name = draft.name.trim()
    const amount = Number(draft.amount)
    if (!name || !Number.isSafeInteger(amount) || amount <= 0 || !draft.date.startsWith(`${year}-`)) return
    onSave({ id: draft.id, name, amount, date: draft.date, category: draft.category, paid: draft.status === 'Paid' })
    setDraft(null)
    setExpanded(true)
  }

  return (
    <>
      <WidgetCard title="One-time payments" description={`${monthLabel} · extra expenses outside regular budget rows`} delay={0.22} compact>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`${expanded ? 'Hide' : 'Show'} one-time payments for ${monthLabel}`}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-secondary/30 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
            <span className="min-w-0 flex-1 text-sm text-muted-foreground">{payments.length} {payments.length === 1 ? 'payment' : 'payments'}</span>
            <span className="font-mono text-sm font-semibold tabular-nums">{formatAmount(total)}</span>
          </button>
          <Button variant="outline" size="xs" onClick={add} aria-label="Add one-time payment" className="shrink-0">
            <Plus /> Add payment
          </Button>
        </div>
        {expanded && (
          <div className="mt-2 border-t border-border/40 pt-2">
            {payments.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">No one-time payments in {monthLabel}.</p>
            ) : payments.map((payment) => (
              <div key={payment.id} className="flex items-center gap-2 border-b border-border/20 px-2 py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{payment.name}</p>
                  <p className="text-xs text-muted-foreground">{monthLabel} {Number(payment.date.slice(8))} · {payment.category} · {payment.paid ? 'Paid' : 'Upcoming'}</p>
                </div>
                <span className="shrink-0 font-mono text-sm tabular-nums">{formatAmount(payment.amount)}</span>
                <Button variant="ghost" size="icon-xs" onClick={() => edit(payment)} aria-label={`Edit ${payment.name}`}><Pencil /></Button>
                <Button variant="ghost" size="icon-xs" onClick={() => onDelete(payment.id)} aria-label={`Delete ${payment.name}`} className="hover:text-destructive"><Trash2 /></Button>
              </div>
            ))}
          </div>
        )}
      </WidgetCard>

      <Modal open={draft !== null} onOpenChange={(open) => { if (!open) setDraft(null) }} title={draft?.mode === 'edit' ? 'Edit one-time payment' : 'Add one-time payment'} description="Record an extra expense for one date.">
        {draft && (
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1 text-sm font-medium">
              <label htmlFor={`${formId}-name`}>Name</label>
              <Input id={`${formId}-name`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required maxLength={100} autoFocus />
            </div>
            <div className="space-y-1 text-sm font-medium">
              <label htmlFor={`${formId}-amount`}>Amount (COP)</label>
              <Input id={`${formId}-amount`} value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value.replace(/\D/g, '') })} inputMode="numeric" pattern="[1-9][0-9]*" required />
            </div>
            <div className="space-y-1 text-sm font-medium">
              <label htmlFor={`${formId}-date`}>Date</label>
              <Input id={`${formId}-date`} type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} min={`${year}-01-01`} max={`${year}-12-31`} required />
            </div>
            <div className="space-y-1 text-sm font-medium">
              <label htmlFor={`${formId}-category`}>Category</label>
              <select id={`${formId}-category`} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                {FINANCE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div className="space-y-1 text-sm font-medium">
              <label htmlFor={`${formId}-status`}>Status</label>
              <select id={`${formId}-status`} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Draft['status'] })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="Paid">Paid</option>
                <option value="Upcoming">Upcoming</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
              <Button type="submit">Save payment</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
