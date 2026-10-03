import { useState } from 'react'
import { CardInput, CardFormActions } from './CardForm'
import type { CreditCardProfile } from '../../../../electron/credit-card-types'
import type { SaveCardCommand } from './use-credit-card'

export function CardSettingsForm({ card, pending, onSave, onClose }: {
  card: CreditCardProfile | null; pending: boolean; onSave: SaveCardCommand; onClose: () => void
}) {
  const [name, setName] = useState(card?.name ?? '')
  const [id] = useState(() => card?.id ?? crypto.randomUUID())
  const [limit, setLimit] = useState(String(card?.limit ?? ''))
  const [closingDay, setClosingDay] = useState(String(card?.closingDay ?? 4))
  const [dueDay, setDueDay] = useState(String(card?.dueDay ?? 24))
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault()
    const profile = { id, name: name.trim(),
      limit: Number(limit), closingDay: Number(closingDay), dueDay: Number(dueDay) }
    if (await onSave(card ? { type: 'configure', card: profile } : { type: 'initialize', card: profile, purchases: [] })) onClose()
  }}>
    <CardInput label="Card name" required value={name} onChange={(event) => setName(event.target.value)} />
    <CardInput label="Credit limit (COP)" type="number" min={1} step={1} required value={limit} onChange={(event) => setLimit(event.target.value)} />
    <div className="grid grid-cols-2 gap-3">
      <CardInput label="Closing day" type="number" min={1} max={31} step={1} required value={closingDay} onChange={(event) => setClosingDay(event.target.value)} />
      <CardInput label="Due day" type="number" min={1} max={31} step={1} required value={dueDay} onChange={(event) => setDueDay(event.target.value)} />
    </div>
    <p className="text-xs text-muted-foreground">Dates use America/Bogota. Short months use their last day. Existing first due dates and confirmed cycle dates stay explicit.</p>
    <CardFormActions pending={pending} label={card ? 'Save card settings' : 'Set up card'} />
  </form>
}
