import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Chip } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import type { CreditCardCycleSummary, CreditCardOverview, CreditCardProfile } from '../../../../electron/credit-card-types'
import { cardDate, cardMoney } from './card-format'

export function CardOverview({ card, overview, onSnapshot }: {
  card: CreditCardProfile; overview: CreditCardOverview; onSnapshot: () => void
}) {
  const snapshot = overview.lastSnapshot
  return <WidgetCard title="Committed on your card" className="min-w-0 border border-accent/20 bg-accent/5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-mono text-3xl tracking-tight tabular-nums sm:text-4xl">{cardMoney(overview.committed)}</p>
      {overview.pending > 0 && <Chip variant="warning">Pending charges</Chip>}
    </div>
    <p className="mt-2 text-sm text-muted-foreground">{cardMoney(overview.trackedPrincipal)} tracked principal · {cardMoney(overview.pending)} pending</p>
    <div role="progressbar" aria-label="Estimated credit utilization" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.round(overview.utilization * 100))} className="mt-5 h-2 overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, overview.utilization * 100))}%` }} />
    </div>
    <p className="mt-2 text-xs text-muted-foreground">{Math.round(overview.utilization * 100)}% of your {cardMoney(card.limit)} limit</p>
    <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
      <div><dt className="text-muted-foreground">Estimated available</dt><dd className="mt-1 font-mono text-accent">{cardMoney(overview.estimatedAvailable)}</dd></div>
      <div><dt className="text-muted-foreground">Last reported debt</dt><dd className="mt-1 font-mono">{snapshot ? cardMoney(snapshot.reportedDebt) : 'Not entered'}</dd></div>
    </dl>
    {snapshot && <p className="mt-3 text-xs text-muted-foreground">Bank observation · {cardDate(snapshot.observedDate)} · {cardMoney(snapshot.availableCredit)} available{overview.snapshotStale ? ' · Predates a ledger change' : ''}</p>}
    {overview.unclassifiedPaid > 0 && <p className="mt-3 text-xs text-warning">{cardMoney(overview.unclassifiedPaid)} paid without a known principal breakdown.</p>}
    <Button size="sm" variant="ghost" className="mt-3" onClick={onSnapshot}>Update bank snapshot</Button>
  </WidgetCard>
}

const statusLabels = { paid: 'Paid', overdue: 'Overdue', ready: 'Ready to pay', 'needs-funding': 'Needs funding' } as const
export function CardReadiness({ cycle, onReserve, onPay, onStatement }: {
  cycle: CreditCardCycleSummary | null; onReserve: () => void; onPay: () => void; onStatement: () => void
}) {
  return <WidgetCard title="Payment readiness" className="min-w-0">
    {cycle ? <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-3xl tabular-nums">{cardMoney(cycle.remaining)}</p>
        <Chip variant={cycle.status === 'overdue' ? 'danger' : cycle.status === 'needs-funding' ? 'warning' : 'success'}>{statusLabels[cycle.status]}</Chip>
      </div>
      <p className="mt-2 text-sm font-medium text-accent">Due {cardDate(cycle.dueDate)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{cycle.estimated ? 'Estimated · Confirm interest and fees' : 'Statement confirmed'} · Target {cardMoney(cycle.target)}</p>
      {cycle.minimum !== null && <p className="mt-2 text-xs text-muted-foreground">Bank minimum {cardMoney(cycle.minimum)} · Planned installments {cardMoney(cycle.principal)}</p>}
      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
        <div><dt className="text-muted-foreground">Set aside</dt><dd className="mt-1 font-mono">{cardMoney(cycle.reserved)}</dd></div>
        <div><dt className="text-muted-foreground">Still to prepare</dt><dd className="mt-1 font-mono">{cardMoney(cycle.fundingGap)}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Set aside marks preparation. Record a payment after money leaves your account.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={onReserve}>Set aside</Button>
        <Button size="sm" variant="secondary" onClick={onPay}>Record payment</Button>
        <Button size="sm" variant="ghost" onClick={onStatement}>Statement checkpoint</Button>
      </div>
    </> : <p className="py-5 text-sm text-muted-foreground">No payment is scheduled in this cycle.</p>}
  </WidgetCard>
}
