import { ChevronLeft, ChevronRight } from 'lucide-react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/shared/EmptyState'
import type { CreditCardCycleSummary } from '../../../../electron/credit-card-types'
import { cardDate, cardMoney, cardMonthLabel } from './card-format'

export function PaymentRunway({ cycles, selected, onSelect, onShift, endMonth }: {
  cycles: CreditCardCycleSummary[]; selected: string; onSelect: (id: string) => void
  onShift: (offset: number) => void; endMonth?: string
}) {
  return <WidgetCard title="Payment runway" description={endMonth ? `Principal plan ends ${cardMonthLabel(endMonth)} · Unconfirmed charges remain estimated` : 'Future monthly commitments'}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">Select a cycle to see its breakdown</p>
      <div className="flex gap-1">
        <Button size="icon-sm" variant="ghost" aria-label="Previous payment cycles" onClick={() => onShift(-3)}><ChevronLeft /></Button>
        <Button size="icon-sm" variant="ghost" aria-label="Next payment cycles" onClick={() => onShift(3)}><ChevronRight /></Button>
      </div>
    </div>
    {cycles.length ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {cycles.map((cycle) => <Button key={cycle.id} variant={selected === cycle.id ? 'accent-outline' : 'secondary'}
        aria-pressed={selected === cycle.id} onClick={() => onSelect(cycle.id)} className="h-auto min-w-0 flex-col items-stretch gap-3 whitespace-normal p-4 text-left">
        <span className="text-sm">{cardMonthLabel(cycle.id)}</span>
        <span className="font-mono text-xl font-normal tabular-nums">{cardMoney(cycle.target)}</span>
        <span className="flex flex-wrap items-center justify-between gap-2 text-xs font-normal text-muted-foreground">
          Due {cardDate(cycle.dueDate)}<Chip size="sm" variant={cycle.estimated ? 'warning' : 'neutral'}>{cycle.estimated ? 'Estimate' : 'Confirmed'}</Chip>
        </span>
      </Button>)}
    </div> : <EmptyState message="No commitments in these cycles." hint="Use the arrows to view a different date range." />}
    {cycles.find((cycle) => cycle.id === selected)?.installments.length ? <ul className="mt-4 space-y-2 border-t border-border pt-4">
      {cycles.find((cycle) => cycle.id === selected)!.installments.map((installment) => <li key={`${installment.purchaseId}-${installment.number}`} className="flex flex-wrap justify-between gap-2 text-sm">
        <span>{installment.name} <span className="text-muted-foreground">· {installment.number}/{installment.count}{installment.pending ? ' · Pending' : ''}</span></span>
        <span className="font-mono tabular-nums">{cardMoney(installment.amount)}</span>
      </li>)}
    </ul> : null}
  </WidgetCard>
}
