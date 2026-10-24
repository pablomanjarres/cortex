interface Props {
  label: string
  /** One value per month; only `visibleMonths` render. */
  values: number[]
  total: number
  visibleMonths: number[]
  selectedMonth: number
  format: (amount: number) => string
  concealed?: boolean
  /** `net` tones every value by its sign; `subtotal` stays quiet. */
  variant?: 'subtotal' | 'net'
}

const styles = {
  subtotal: { row: 'border-t border-border/40', pad: 'py-1.5', value: 'text-2xs font-semibold text-muted-foreground' },
  net: { row: 'border-t border-border/50 font-medium', pad: 'py-2.5', value: '' },
} as const

/** A totals row of the budget table: label, the visible month columns, and the year total. */
export function BudgetSummaryRow({ label, values, total, visibleMonths, selectedMonth, format, concealed, variant = 'subtotal' }: Props) {
  const style = styles[variant]
  const tone = (amount: number) => variant !== 'net' ? '' : concealed ? 'text-foreground-faint' : amount >= 0 ? 'text-success' : 'text-destructive'
  const cell = (amount: number, selected: boolean) =>
    `${style.pad} text-right font-mono tabular-nums ${style.value} ${tone(amount)} ${selected ? 'bg-foreground/[0.03]' : ''}`
  const text = (amount: number) => concealed ? '•••' : format(amount)
  return (
    <tr className={style.row}>
      <td className={`sticky left-0 z-10 bg-card px-4 ${style.pad} font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground`}>{label}</td>
      <td></td>
      <td></td>
      {visibleMonths.map((month) => (
        <td key={month} className={cell(values[month], month === selectedMonth)}>{text(values[month])}</td>
      ))}
      <td className={cell(total, false)}>{text(total)}</td>
      <td></td>
    </tr>
  )
}
