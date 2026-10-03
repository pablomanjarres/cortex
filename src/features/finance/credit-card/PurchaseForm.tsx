import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { applyCreditCardCommand, creditCardOverview, creditCardSchedule } from '../../../../electron/credit-card-model'
import type { CreditCardPurchase, CreditCardState } from '../../../../electron/credit-card-types'
import { CardInput, CardSelect, CardFormActions } from './CardForm'
import { cardMoney, cardMonthLabel, optionalMoney } from './card-format'
import type { CardMutation, SaveCardCommand } from './use-credit-card'

export function PurchaseForm({ state, purchase, firstDueDate, today, pending, onSave, onClose }: {
  state: CreditCardState; purchase?: CreditCardPurchase; firstDueDate: string; today: string
  pending: boolean; onSave: SaveCardCommand; onClose: () => void
}) {
  const [id] = useState(() => purchase?.id ?? crypto.randomUUID())
  const [name, setName] = useState(purchase?.name ?? '')
  const [amount, setAmount] = useState(String(purchase?.amount ?? ''))
  const [installments, setInstallments] = useState(String(purchase?.installments ?? 1))
  const [date, setDate] = useState(purchase?.purchaseDate ?? '')
  const [dueDate, setDueDate] = useState(purchase?.firstDueDate ?? firstDueDate)
  const [status, setStatus] = useState<CreditCardPurchase['status']>(purchase?.status ?? 'pending')
  const [interest, setInterest] = useState('')
  const [fees, setFees] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const existingCycle = state.cycles.find((cycle) => cycle.id === dueDate.slice(0, 7))
  const knownInterest = optionalMoney(interest) ?? existingCycle?.interest
  const knownFees = optionalMoney(fees) ?? existingCycle?.fees
  const mutation: CardMutation = { type: 'purchase.save', purchase: {
    id, name: name.trim(), amount: Number(amount), installments: Number(installments),
    ...(date ? { purchaseDate: date } : {}), firstDueDate: dueDate, status,
  }, ...((interest !== '' || fees !== '') ? { cycle: { ...existingCycle,
    id: dueDate.slice(0, 7), interest: knownInterest, fees: knownFees,
    chargesConfirmed: knownInterest !== undefined && knownFees !== undefined } } : {}) }
  const preview = useMemo(() => {
    if (!previewing) return null
    try {
      const projected = applyCreditCardCommand(state, { ...mutation, requestId: 'preview-only' }, `${today}T12:00:00Z`)
      return { overview: creditCardOverview(projected, today), cycles: creditCardSchedule(projected, dueDate.slice(0, 7), Math.min(12, Number(installments) || 1), today) }
    } catch (error) { return { error: error instanceof Error ? error.message : 'Enter valid purchase details.' } }
    // The draft intentionally recomputes whenever any form field changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, name, amount, installments, date, dueDate, status, interest, fees, previewing, today])

  return <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (await onSave(mutation)) onClose() }}>
    <CardInput label="Purchase name" required value={name} onChange={(event) => setName(event.target.value)} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <CardInput label="Purchase amount (COP)" type="number" min={1} step={1} required value={amount} onChange={(event) => setAmount(event.target.value)} />
      <CardInput label="Installments" type="number" min={1} max={120} step={1} required value={installments} onChange={(event) => setInstallments(event.target.value)} />
      <CardInput label="Purchase date (optional)" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <CardInput label="First due date" type="date" required value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
    </div>
    <CardSelect label="Purchase status" value={status} onChange={(event) => setStatus(event.target.value as CreditCardPurchase['status'])}>
      <option value="pending">Pending</option><option value="posted">Posted</option><option value="cancelled">Cancelled</option>
    </CardSelect>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <CardInput label="Known first-cycle interest (COP)" hint="Whole cycle total; leave blank if unknown" type="number" min={0} step={1} value={interest} onChange={(event) => setInterest(event.target.value)} />
      <CardInput label="Known first-cycle fees (COP)" hint="Whole cycle total; leave blank if unknown" type="number" min={0} step={1} value={fees} onChange={(event) => setFees(event.target.value)} />
    </div>
    <Button type="button" variant="secondary" onClick={() => setPreviewing(true)}>Preview purchase</Button>
    {preview && <div aria-live="polite" className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm">
      {'error' in preview ? <p role="alert" className="text-destructive">{preview.error}</p> : <>
        <Chip variant="accent">Unsaved preview</Chip><p className="mt-2">Estimated available credit {cardMoney(preview.overview.estimatedAvailable)}</p>
        <ul className="mt-2 space-y-1">{preview.cycles.map((cycle) => <li key={cycle.id} className="flex justify-between gap-2"><span>{cardMonthLabel(cycle.id)}</span><span className="font-mono">{cardMoney(cycle.target)}</span></li>)}</ul>
        {Number(installments) > 12 && <p className="mt-2 text-xs text-muted-foreground">Showing the first 12 cycles. The saved runway includes the complete plan.</p>}
      </>}
    </div>}
    <CardFormActions pending={pending} label="Save purchase" />
  </form>
}
