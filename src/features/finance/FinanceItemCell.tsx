import { Input } from '@/components/ui/input'
import type { Settlement } from './finance-model'
import { SettlementControl } from './SettlementControl'

interface Props {
  name: string
  onNameChange: (name: string) => void
  /** Selected month; a new month or side starts a fresh settlement editor. */
  month: number
  settlement: Settlement
  concealed?: boolean
  formatAmount: (amount: number) => string
  onSettle: (amount: number | null) => void
}

export function FinanceItemCell({ name, onNameChange, month, settlement, concealed, formatAmount, onSettle }: Props) {
  return (
    <SettlementControl
      key={`${settlement.kind}-${month}`}
      name={name}
      settlement={settlement}
      concealed={concealed}
      formatAmount={formatAmount}
      onSave={onSettle}
    >
      <Input
        variant="inline"
        aria-label={`Item name for ${name}`}
        title={name}
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        className="block h-5 py-0 text-sm font-medium"
      />
    </SettlementControl>
  )
}
