export function BudgetSubtotalRow({ label, amounts, selectedMonth, compact, concealed = false, formatAmount }: {
  label: string; amounts: number[]; selectedMonth: number; compact: boolean; concealed?: boolean; formatAmount: (amount: number) => string
}) {
  const display = (amount: number) => concealed ? '•••' : formatAmount(amount)
  return <tr className="border-t border-border/40">
    <td className="sticky left-0 z-10 bg-card px-4 py-1.5 font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</td>
    <td /><td />
    {(compact ? [selectedMonth] : amounts.map((_, index) => index)).map((month) => <td key={month}
      className={`py-1.5 text-right font-mono text-2xs font-semibold tabular-nums text-muted-foreground ${month === selectedMonth ? 'bg-foreground/[0.03]' : ''}`}>{display(amounts[month])}</td>)}
    <td className="py-1.5 text-right font-mono text-2xs font-semibold tabular-nums text-muted-foreground">{display(amounts.reduce((sum, amount) => sum + amount, 0))}</td><td />
  </tr>
}
