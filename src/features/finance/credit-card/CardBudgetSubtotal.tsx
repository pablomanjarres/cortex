import { cardMoney } from './card-format'

export function CardBudgetSubtotal({ amounts, selectedMonth, compact }: {
  amounts: number[]; selectedMonth: number; compact: boolean
}) {
  const total = amounts.reduce((sum, amount) => sum + amount, 0)
  if (total === 0) return null
  return <tr className="border-t border-border/40">
    <td className="sticky left-0 z-10 bg-card px-4 py-1.5 font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Credit card Subtotal</td>
    <td /><td />
    {(compact ? [selectedMonth] : amounts.map((_, index) => index)).map((month) => <td key={month}
      className={`py-1.5 text-right font-mono text-2xs font-semibold tabular-nums text-muted-foreground ${month === selectedMonth ? 'bg-foreground/[0.03]' : ''}`}>{cardMoney(amounts[month])}</td>)}
    <td className="py-1.5 text-right font-mono text-2xs font-semibold tabular-nums text-muted-foreground">{cardMoney(total)}</td><td />
  </tr>
}
