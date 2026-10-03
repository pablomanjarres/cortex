import { useState } from 'react'
import { CreditCard, Plus, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/shared/Skeleton'
import { Modal } from '@/components/shared/Modal'
import { creditCardCycles, creditCardMonth, creditCardOverview, creditCardSchedule } from '../../../../electron/credit-card-model'
import type { CreditCardPayment, CreditCardPurchase, CreditCardState } from '../../../../electron/credit-card-types'
import { CardOverview, CardReadiness } from './CardOverview'
import { PaymentRunway } from './PaymentRunway'
import { CardLedger } from './CardLedger'
import { CardSettingsForm } from './CardSettingsForm'
import { PurchaseForm } from './PurchaseForm'
import { StatementForm, ReserveForm } from './CycleForms'
import { PaymentForm } from './PaymentForm'
import { SnapshotForm } from './SnapshotForm'
import { ReminderSettings } from './ReminderSettings'
import { cardDate, cardMonthLabel, shiftCardMonth } from './card-format'
import type { SaveCardCommand } from './use-credit-card'

type CardDialog = 'settings' | 'purchase' | 'statement' | 'reserve' | 'payment' | 'snapshot' | 'reminders'
const titles: Record<CardDialog, string> = { settings: 'Card settings', purchase: 'Purchase preview',
  statement: 'Statement checkpoint', reserve: 'Set money aside', payment: 'Record card payment',
  snapshot: 'Bank snapshot', reminders: 'Card reminders' }

export function CreditCardSection({ state, yearMonth, today, loading, pending, error, onSave }: {
  state: CreditCardState; yearMonth: string; today: string; loading: boolean; pending: boolean
  error: string | null; onSave: SaveCardCommand
}) {
  const [dialog, setDialog] = useState<CardDialog | null>(null)
  const [purchase, setPurchase] = useState<CreditCardPurchase | undefined>()
  const [payment, setPayment] = useState<CreditCardPayment | undefined>()
  const [selectedCycle, setSelectedCycle] = useState<string | null>(null)
  const [runwayMonth, setRunwayMonth] = useState<string | null>(null)
  const overview = creditCardOverview(state, today)
  const financeCycle = creditCardMonth(state, yearMonth, today).cycles[0]
  const cycleId = selectedCycle ?? financeCycle?.id ?? overview.nextCycle?.id ?? yearMonth
  const cycle = creditCardSchedule(state, cycleId, 1, today)[0]
  const runwayStart = runwayMonth ?? cycleId
  const runway = creditCardSchedule(state, runwayStart, 3, today)
  const allCycles = creditCardCycles(state, today)
  const endMonth = allCycles.filter((entry) => entry.target > 0).at(-1)?.id
  const checkpoint = allCycles.find((entry) => entry.remaining > 0 && !entry.statementConfirmed && entry.closingDate <= today)
  const close = () => setDialog(null)
  return <section id="credit-card" aria-labelledby="credit-card-title" className="min-w-0 space-y-4 scroll-mt-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="credit-card-title" className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><CreditCard className="size-5 text-accent" />Credit card</h2>
        <p className="mt-1 text-sm text-muted-foreground">{state.card?.name ?? 'Know what is coming. Be ready before it is due.'} · Finance {cardMonthLabel(yearMonth)}</p>
      </div>
      {state.card && <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => { setPurchase(undefined); setDialog('purchase') }}><Plus />Add purchase</Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog('settings')}><Settings2 />Card settings</Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog('reminders')}>Reminders</Button>
      </div>}
    </div>
    {error && !dialog && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {loading ? <div aria-label="Loading credit card" className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      : !state.card ? <WidgetCard title="Your card, month by month"><EmptyState message="Set up your credit card." hint="Track installments, prepare your payment, and confirm the bank's figures."
        action={<Button onClick={() => setDialog('settings')}>Set up credit card</Button>} /></WidgetCard>
      : <>
        {checkpoint && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/25 bg-warning/5 p-4">
          <p className="text-sm">Statement needs confirmation · Closed {cardDate(checkpoint.closingDate)}</p>
          <Button size="sm" variant="secondary" onClick={() => { setSelectedCycle(checkpoint.id); setDialog('statement') }}>Confirm statement</Button>
        </div>}
        <div className="grid gap-3 lg:grid-cols-2">
          <CardOverview card={state.card} overview={overview} onSnapshot={() => setDialog('snapshot')} />
          <CardReadiness cycle={cycle.target > 0 ? cycle : null} onReserve={() => setDialog('reserve')}
            onPay={() => { setPayment(undefined); setDialog('payment') }} onStatement={() => setDialog('statement')} />
        </div>
        <PaymentRunway cycles={runway} selected={cycleId} onSelect={setSelectedCycle}
          onShift={(offset) => setRunwayMonth(shiftCardMonth(runwayStart, offset))} endMonth={endMonth} />
        <CardLedger purchases={state.purchases} payments={state.payments} pending={pending} error={error} onSave={onSave}
          onEditPurchase={(entry) => { setPurchase(entry); setDialog('purchase') }}
          onEditPayment={(entry) => { setPayment(entry); setDialog('payment') }} />
        <Button size="sm" variant="ghost" onClick={() => setDialog('statement')}>Open statement checkpoint for {cardMonthLabel(cycleId)}</Button>
      </>}
    <Modal open={dialog !== null} onOpenChange={(open) => { if (!open) close() }} title={dialog ? titles[dialog] : ''}
      description={dialog === 'purchase' ? 'Previewing saves nothing. Save explicitly when the plan is ready.' : undefined}
      size={dialog === 'purchase' || dialog === 'payment' || dialog === 'reminders' ? 'lg' : 'sm'} className="max-h-[90dvh] overflow-y-auto">
      {dialog === 'settings' && <CardSettingsForm card={state.card} pending={pending} onSave={onSave} onClose={close} />}
      {dialog === 'purchase' && <PurchaseForm state={state} purchase={purchase} firstDueDate={cycle.dueDate} today={today} pending={pending} onSave={onSave} onClose={close} />}
      {dialog === 'statement' && <StatementForm cycle={cycle} saved={state.cycles.find((entry) => entry.id === cycle.id)} pending={pending} onSave={onSave} onClose={close} />}
      {dialog === 'reserve' && <ReserveForm cycle={cycle} pending={pending} onSave={onSave} onClose={close} />}
      {dialog === 'payment' && <PaymentForm payment={payment} cycle={cycle} purchases={state.purchases} today={today} pending={pending} onSave={onSave} onClose={close} />}
      {dialog === 'snapshot' && <SnapshotForm today={today} pending={pending} onSave={onSave} onClose={close} />}
      {dialog === 'reminders' && <ReminderSettings settings={state.reminders} pending={pending} onSave={onSave} onClose={close} />}
      {error && dialog && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </Modal>
  </section>
}
