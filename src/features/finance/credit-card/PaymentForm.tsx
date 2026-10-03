import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CreditCardAllocation, CreditCardCycleSummary, CreditCardPayment, CreditCardPurchase } from '../../../../electron/credit-card-types'
import { CardInput, CardSelect, CardFormActions } from './CardForm'
import { cardMoney, optionalMoney } from './card-format'
import type { SaveCardCommand } from './use-credit-card'

function PaymentAllocation({ allocation, purchases, onChange, onRemove }: {
  allocation: CreditCardAllocation; purchases: CreditCardPurchase[]
  onChange: (allocation: CreditCardAllocation) => void; onRemove: () => void
}) {
  const [classifying, setClassifying] = useState(Boolean(allocation.principal?.length || allocation.feesAmount !== undefined))
  return <fieldset className="space-y-3 rounded-lg border border-border p-3">
    <legend className="px-1 text-xs text-muted-foreground">Cycle allocation</legend>
    <div className="grid grid-cols-2 gap-3">
      <CardInput label="Payment cycle" type="month" required value={allocation.cycleId} onChange={(event) => onChange({ ...allocation, cycleId: event.target.value })} />
      <CardInput label="Allocated amount (COP)" type="number" min={0} step={1} required value={allocation.amount} onChange={(event) => onChange({ ...allocation, amount: Number(event.target.value) })} />
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={classifying} onChange={(event) => {
      setClassifying(event.target.checked)
      if (!event.target.checked) onChange({ cycleId: allocation.cycleId, amount: allocation.amount })
    }} />I know the bank's principal and charge breakdown</label>
    {classifying && <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Enter only confirmed allocation amounts. Blank amounts stay unclassified.</p>
      {purchases.filter((purchase) => purchase.status !== 'cancelled').map((purchase) => <CardInput key={purchase.id}
        label={`Principal for ${purchase.name} (COP)`} type="number" min={0} step={1}
        value={allocation.principal?.find((entry) => entry.purchaseId === purchase.id)?.amount ?? ''}
        onChange={(event) => {
          const rest = (allocation.principal ?? []).filter((entry) => entry.purchaseId !== purchase.id)
          const amount = optionalMoney(event.target.value)
          onChange({ ...allocation, principal: amount === undefined ? rest : [...rest, { purchaseId: purchase.id, amount }] })
        }} />)}
      <CardInput label="Known charges paid (COP)" type="number" min={0} step={1} value={allocation.feesAmount ?? ''}
        onChange={(event) => onChange({ ...allocation, feesAmount: optionalMoney(event.target.value) })} />
    </div>}
    <Button type="button" size="sm" variant="ghost" onClick={onRemove}>Remove allocation</Button>
  </fieldset>
}

export function PaymentForm({ payment, cycle, purchases, today, pending, onSave, onClose }: {
  payment?: CreditCardPayment; cycle: CreditCardCycleSummary; purchases: CreditCardPurchase[]; today: string
  pending: boolean; onSave: SaveCardCommand; onClose: () => void
}) {
  const [id] = useState(() => payment?.id ?? crypto.randomUUID())
  const [amount, setAmount] = useState(String(payment?.amount ?? cycle.remaining))
  const [date, setDate] = useState(payment?.paidDate ?? today)
  const [status, setStatus] = useState<CreditCardPayment['status']>(payment?.status ?? 'completed')
  const [allocations, setAllocations] = useState<CreditCardAllocation[]>(payment?.allocations ?? [{ cycleId: cycle.id, amount: cycle.remaining }])
  const [allocationsEdited, setAllocationsEdited] = useState(Boolean(payment))
  const [note, setNote] = useState(payment?.note ?? '')
  const unallocated = Number(amount) - allocations.reduce((total, allocation) => total + allocation.amount, 0)
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault()
    if (await onSave({ type: 'payment.save', payment: { id, amount: Number(amount), paidDate: date,
      status, allocations, ...(note.trim() ? { note: note.trim() } : {}) } })) onClose()
  }}>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <CardInput label="Actual payment amount (COP)" type="number" min={1} step={1} required value={amount} onChange={(event) => {
        setAmount(event.target.value)
        if (!allocationsEdited) setAllocations([{ cycleId: cycle.id, amount: Math.min(cycle.remaining, Math.max(0, Number(event.target.value))) }])
      }} />
      <CardInput label="Actual payment date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
    </div>
    <CardSelect label="Payment status" value={status} onChange={(event) => setStatus(event.target.value as CreditCardPayment['status'])}>
      <option value="completed">Completed</option><option value="pending">Pending</option>
      {payment?.status === 'voided' && <option value="voided">Voided</option>}
    </CardSelect>
    <p className="text-xs text-muted-foreground">Completed payments debit cash on their actual date. Allocate them to due cycles to settle those obligations.</p>
    {allocations.map((allocation, index) => <PaymentAllocation key={index} allocation={allocation} purchases={purchases}
      onChange={(next) => { setAllocationsEdited(true); setAllocations((rows) => rows.map((row, position) => position === index ? next : row)) }}
      onRemove={() => { setAllocationsEdited(true); setAllocations((rows) => rows.filter((_, position) => position !== index)) }} />)}
    <Button type="button" variant="secondary" size="sm" onClick={() => { setAllocationsEdited(true); setAllocations((rows) => [...rows, { cycleId: cycle.id, amount: 0 }]) }}>Add cycle allocation</Button>
    <p className={`text-xs ${unallocated < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{cardMoney(Math.max(0, unallocated))} unallocated{unallocated < 0 ? ' · Allocations exceed the payment' : ''}. Principal stays unknown until a breakdown is entered.</p>
    <CardInput label="Payment note (optional)" value={note} onChange={(event) => setNote(event.target.value)} />
    <CardFormActions pending={pending} label={payment ? 'Save payment correction' : 'Save card payment'} />
  </form>
}
