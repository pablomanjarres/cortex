import type { CreditCardMonthSummary } from '../../../../electron/credit-card-types'
import { creditCardBudgetRows } from './budget-model'
import { cardDate, cardMoney, cardMonthLabel } from './card-format'

export function CreditCardBudgetRows({ months, selectedMonth, compact, year }: {
  months: CreditCardMonthSummary[]; selectedMonth: number; compact: boolean; year: number
}) {
  const selected = months[selectedMonth]
  const rows = creditCardBudgetRows(months)
  const paid = selected.cycles.reduce((sum, cycle) => sum + cycle.paid, 0)
  const estimated = selected.cycles.some((cycle) => cycle.estimated)
  const indices = compact ? [selectedMonth] : months.map((_, index) => index)
  const monthLabel = cardMonthLabel(`${year}-${String(selectedMonth + 1).padStart(2, '0')}`)
  return <>
    <tr className="border-t border-border/50 bg-secondary/20">
      <td colSpan={compact ? 6 : months.length + 5} className="px-4 py-3">
        <div className="max-w-[220px] space-y-1 sm:max-w-lg">
          <p className="font-medium text-foreground">Credit card installments</p>
          <p className="text-muted-foreground">{monthLabel} · Scheduled {cardMoney(selected.planned)}</p>
          <p className="text-muted-foreground">Paid toward this month {cardMoney(paid)} · Remaining {cardMoney(selected.remaining)}</p>
          {estimated && <p className="text-warning">Estimated · Interest and fees may still need confirmation.</p>}
          <p className="text-2xs text-muted-foreground">Included once in expenses. Payments are recorded in the Credit card section.</p>
        </div>
      </td>
    </tr>
    {rows.map((row) => <tr key={row.id} className="border-b border-border/20 hover:bg-secondary/30">
      <td className="sticky left-0 z-10 min-w-[240px] bg-card px-4 py-2">
        <p className="font-medium text-foreground">{row.name}</p>
        {row.months[selectedMonth] > 0 && <p className="mt-1 font-mono tabular-nums text-foreground">{cardMoney(row.months[selectedMonth])} this month</p>}
        {row.details[selectedMonth].map((detail, index) => <p key={`${detail.dueDate}-${index}`} className="mt-1 text-2xs text-muted-foreground">
          {detail.installmentNumber !== undefined && `Installment ${detail.installmentNumber}/${detail.installmentCount} · `}
          Due {cardDate(detail.dueDate)}
        </p>)}
        {row.months[selectedMonth] === 0 && <p className="mt-1 text-2xs text-muted-foreground">No amount due this month</p>}
      </td>
      <td className="py-2 font-mono text-3xs text-muted-foreground">Card</td>
      <td className="py-2 font-mono text-3xs text-muted-foreground">Credit card</td>
      {indices.map((month) => <td key={month} className={`py-2 text-right font-mono tabular-nums ${month === selectedMonth ? 'bg-foreground/[0.03] text-foreground' : 'text-muted-foreground'}`}>
        {cardMoney(row.months[month])}
      </td>)}
      <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">{cardMoney(row.months.reduce((sum, value) => sum + value, 0))}</td>
      <td />
    </tr>)}
  </>
}
