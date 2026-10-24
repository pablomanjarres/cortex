import { Field } from '@/components/shared/Field'
import { Input } from '@/components/ui/input'

export type CycleMonths = { closingStartMonth: string; dueStartMonth: string }

const CYCLES = [
  { day: 'closingDay', month: 'closingStartMonth', label: 'Statement closing day', monthLabel: 'First statement month', hint: 'Day of month · fecha de corte.' },
  { day: 'dueDay', month: 'dueStartMonth', label: 'Payment due day', monthLabel: 'First payment month', hint: 'Day of month, from 1 to 31.' },
] as const

export function AccountCycleFields({ days, months, onDayChange, onMonthChange }: {
  days: { closingDay: string; dueDay: string }
  months: CycleMonths
  onDayChange: (key: 'closingDay' | 'dueDay', value: string) => void
  onMonthChange: (key: keyof CycleMonths, value: string) => void
}) {
  return CYCLES.map((cycle) => <div key={cycle.day} className="space-y-4">
    <Field label={cycle.label} hint={cycle.hint}>{(id) => <Input id={id} inputMode="numeric" value={days[cycle.day]}
      onChange={(event) => onDayChange(cycle.day, event.target.value)} />}</Field>
    <Field label={cycle.monthLabel} hint="Optional. Leave blank to include the current cycle.">{(id) => <Input id={id} type="month" value={months[cycle.month]}
      onChange={(event) => onMonthChange(cycle.month, event.target.value)} />}</Field>
  </div>)
}
