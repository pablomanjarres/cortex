import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Modal } from '@/components/shared/Modal'
import type { CreditCardPayment, CreditCardPurchase } from '../../../../electron/credit-card-types'
import { CardInput, CardFormActions } from './CardForm'
import { cardDate, cardMoney, cardMonthLabel } from './card-format'
import type { SaveCardCommand } from './use-credit-card'

function PurchaseList({ purchases, pending, onEdit, onCancel }: {
  purchases: CreditCardPurchase[]; pending: boolean; onEdit: (purchase: CreditCardPurchase) => void; onCancel: (id: string) => void
}) {
  if (!purchases.length) return <EmptyState message="No card purchases yet." hint="Preview a purchase to see its monthly impact before saving." />
  return <ul className="divide-y divide-border">{purchases.map((purchase) => <li key={purchase.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
    <div className="min-w-0 flex-1"><p className="break-words font-medium">{purchase.name}</p>
      <p className="mt-1 text-xs text-muted-foreground">{purchase.installments} installments · First due {cardDate(purchase.firstDueDate)}{purchase.purchaseDate ? ` · Purchased ${cardDate(purchase.purchaseDate)}` : ' · Purchase date unknown'}</p>
    </div>
    <div className="flex flex-wrap items-center gap-2"><span className="font-mono tabular-nums">{cardMoney(purchase.amount)}</span>
      <Chip size="sm" variant={purchase.status === 'pending' ? 'warning' : 'neutral'}>{purchase.status}</Chip>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => onEdit(purchase)} aria-label={`Edit purchase ${purchase.name}`}>Edit</Button>
      {purchase.status !== 'cancelled' && <Button size="sm" variant="ghost" disabled={pending} onClick={() => onCancel(purchase.id)} aria-label={`Cancel purchase ${purchase.name}`}>Cancel</Button>}
    </div>
  </li>)}</ul>
}

function PaymentHistory({ payments, pending, onEdit, onVoid }: {
  payments: CreditCardPayment[]; pending: boolean; onEdit: (payment: CreditCardPayment) => void; onVoid: (payment: CreditCardPayment) => void
}) {
  if (!payments.length) return <EmptyState message="No card payments recorded." hint="Set-aside money appears in readiness; completed payments appear here." />
  return <ul className="divide-y divide-border">{[...payments].sort((a, b) => b.paidDate.localeCompare(a.paidDate)).map((payment) => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
    <div className="min-w-0 flex-1"><p className="font-mono tabular-nums">{cardMoney(payment.amount)} <span className="font-sans text-sm text-muted-foreground">· {cardDate(payment.paidDate)}</span></p>
      <p className="mt-1 text-xs text-muted-foreground">{payment.allocations.map((allocation) => `${cardMonthLabel(allocation.cycleId)} ${cardMoney(allocation.amount)}`).join(' · ') || 'Unallocated payment'}</p>
      {payment.note && <p className="mt-1 break-words text-xs text-muted-foreground">{payment.note}</p>}
    </div>
    <div className="flex items-center gap-2"><Chip size="sm" variant={payment.status === 'completed' ? 'success' : 'neutral'}>{payment.status}</Chip>
      {payment.status !== 'voided' && <><Button size="sm" variant="ghost" disabled={pending} onClick={() => onEdit(payment)} aria-label={`Correct payment of ${cardMoney(payment.amount)} on ${cardDate(payment.paidDate)}`}>Correct</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => onVoid(payment)} aria-label={`Void payment of ${cardMoney(payment.amount)} on ${cardDate(payment.paidDate)}`}>Void</Button></>}
    </div>
  </li>)}</ul>
}

export function CardLedger({ purchases, payments, pending, error, onEditPurchase, onEditPayment, onSave }: {
  purchases: CreditCardPurchase[]; payments: CreditCardPayment[]; pending: boolean; error: string | null
  onEditPurchase: (purchase: CreditCardPurchase) => void; onEditPayment: (payment: CreditCardPayment) => void; onSave: SaveCardCommand
}) {
  const [voiding, setVoiding] = useState<CreditCardPayment | null>(null)
  const [reason, setReason] = useState('')
  return <WidgetCard title="Card ledger">
    <Tabs defaultValue="purchases"><TabsList><TabsTrigger value="purchases">Purchases</TabsTrigger><TabsTrigger value="payments">Payment history</TabsTrigger></TabsList>
      <TabsContent value="purchases"><PurchaseList purchases={purchases} pending={pending} onEdit={onEditPurchase} onCancel={(id) => { void onSave({ type: 'purchase.cancel', id }) }} /></TabsContent>
      <TabsContent value="payments"><PaymentHistory payments={payments} pending={pending} onEdit={onEditPayment} onVoid={(payment) => { setReason(''); setVoiding(payment) }} /></TabsContent>
    </Tabs>
    <Modal open={Boolean(voiding)} onOpenChange={(open) => { if (!open) setVoiding(null) }} title="Void card payment" description="The original payment remains in history. Its cash debit and allocations will be reversed.">
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (voiding && await onSave({ type: 'payment.void', id: voiding.id, reason: reason.trim() })) setVoiding(null) }}>
        <CardInput label="Reason for voiding" required value={reason} onChange={(event) => setReason(event.target.value)} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <CardFormActions pending={pending} label="Void payment" />
      </form>
    </Modal>
  </WidgetCard>
}
