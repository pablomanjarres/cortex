import { useState } from 'react'
import { CardInput, CardFormActions } from './CardForm'
import type { SaveCardCommand } from './use-credit-card'

export function SnapshotForm({ today, pending, onSave, onClose }: {
  today: string; pending: boolean; onSave: SaveCardCommand; onClose: () => void
}) {
  const [id] = useState(() => crypto.randomUUID())
  const [date, setDate] = useState(today)
  const [debt, setDebt] = useState('')
  const [available, setAvailable] = useState('')
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault()
    if (await onSave({ type: 'snapshot.save', snapshot: { id, observedDate: date,
      reportedDebt: Number(debt), availableCredit: Number(available) } })) onClose()
  }}>
    <CardInput label="Bank observation date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
    <CardInput label="Bank reported debt (COP)" type="number" min={0} step={1} required value={debt} onChange={(event) => setDebt(event.target.value)} />
    <CardInput label="Bank available credit (COP)" type="number" min={0} step={1} required value={available} onChange={(event) => setAvailable(event.target.value)} />
    <p className="text-xs text-muted-foreground">Save a dated bank observation. Tracked purchases and payments stay separate from this reported balance.</p>
    <CardFormActions pending={pending} label="Save bank snapshot" />
  </form>
}
