import { useState } from 'react'
import type { CreditCardCycle, CreditCardCycleSummary } from '../../../../electron/credit-card-types'
import { CardInput, CardFormActions } from './CardForm'
import { cardMoney, optionalMoney } from './card-format'
import type { SaveCardCommand } from './use-credit-card'

export function StatementForm({ cycle, saved, pending, onSave, onClose }: {
  cycle: CreditCardCycleSummary; saved?: CreditCardCycle; pending: boolean; onSave: SaveCardCommand; onClose: () => void
}) {
  const [dueDate, setDueDate] = useState(cycle.dueDate)
  const [target, setTarget] = useState(String(saved?.confirmedAmount ?? ''))
  const [minimum, setMinimum] = useState(String(saved?.minimumAmount ?? ''))
  const [interest, setInterest] = useState(String(saved?.interest ?? ''))
  const [fees, setFees] = useState(String(saved?.fees ?? ''))
  const [confirmed, setConfirmed] = useState(saved?.statementConfirmed ?? false)
  const [minimumEstimated, setMinimumEstimated] = useState(saved?.minimumEstimated ?? false)
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault()
    if (await onSave({ type: 'cycle.save', cycle: { ...saved, id: cycle.id, dueDate,
      confirmedAmount: optionalMoney(target), minimumAmount: optionalMoney(minimum), minimumEstimated,
      interest: optionalMoney(interest), fees: optionalMoney(fees), chargesConfirmed: interest !== '' && fees !== '', statementConfirmed: confirmed } })) onClose()
  }}>
    <p className="text-sm text-muted-foreground">Planned principal {cardMoney(cycle.principal)}. The payment target covers the plan, known charges, and any confirmed unpaid minimum.</p>
    <CardInput label="Statement due date" type="date" required value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <CardInput label="Chosen payment target (COP)" type="number" min={0} step={1} value={target} onChange={(event) => setTarget(event.target.value)} hint="Optional; cannot lower the planned obligation" />
      <CardInput label="Bank minimum (COP)" type="number" min={0} step={1} value={minimum} onChange={(event) => setMinimum(event.target.value)} />
      <CardInput label="Statement interest (COP)" type="number" min={0} step={1} value={interest} onChange={(event) => setInterest(event.target.value)} hint="Blank means unknown; zero means confirmed zero" />
      <CardInput label="Statement fees (COP)" type="number" min={0} step={1} value={fees} onChange={(event) => setFees(event.target.value)} />
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={minimumEstimated} onChange={(event) => setMinimumEstimated(event.target.checked)} />Minimum is an estimate</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I checked these figures against the bank statement</label>
    <CardFormActions pending={pending} label="Save statement" />
  </form>
}

export function ReserveForm({ cycle, pending, onSave, onClose }: {
  cycle: CreditCardCycleSummary; pending: boolean; onSave: SaveCardCommand; onClose: () => void
}) {
  const [amount, setAmount] = useState(String(cycle.reserved))
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault()
    if (await onSave({ type: 'reserve.set', cycleId: cycle.id, amount: Number(amount) })) onClose()
  }}>
    <CardInput label="Money set aside (COP)" type="number" min={0} step={1} required value={amount} onChange={(event) => setAmount(event.target.value)} />
    <p className="text-sm text-muted-foreground">This is an earmark for this cycle. It does not move cash, reduce debt, or stop reminders.</p>
    <CardFormActions pending={pending} label="Save preparation" />
  </form>
}
