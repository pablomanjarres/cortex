import { Archive, Pencil, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { availableCreditFor, formatAccountMoney, nextAccountCycleDate, type FinancialAccount } from './account-model'
import { ACCOUNT_KINDS, FEE_CADENCES } from './account-options'
import { accountDateLabel } from './account-format'

export function AccountCard({ account, accounts, today, onEdit, onArchive, onRestore }: {
  account: FinancialAccount; accounts: FinancialAccount[]; today: string
  onEdit: () => void; onArchive: () => void; onRestore: () => void
}) {
  const { kind, currency } = account
  const linked = accounts.find((entry) => entry.id === account.linkedAccountId)
  const money = (value: number | undefined) => value === undefined ? 'Not recorded' : formatAccountMoney(value, currency)
  const balance = kind === 'debit' ? linked?.balance : account.balance
  const closing = nextAccountCycleDate(account, 'closing', today)
  const payment = nextAccountCycleDate(account, 'payment', today)
  const details = [
    ...(kind === 'debit' ? [{ label: 'Linked bank', value: linked?.name ?? 'Unlinked' }] : []),
    ...(kind === 'credit' ? [
      { label: 'Credit limit', value: money(account.creditLimit) },
      { label: 'Available credit', value: money(availableCreditFor(account)) },
      { label: 'Minimum payment', value: money(account.minimumPayment) },
      { label: 'Annual interest', value: account.annualInterestRate === undefined ? 'Not recorded' : `${account.annualInterestRate}%` },
      { label: 'Statement closes', value: closing ? `${accountDateLabel(closing)} · day ${account.closingDay}` : 'Not set' },
      { label: 'Payment due', value: payment ? `${accountDateLabel(payment)} · day ${account.dueDay}` : 'Not set' },
    ] : []),
    ...(account.expiresOn ? [{ label: 'Expires', value: account.expiresOn }] : []),
  ]
  return <WidgetCard title={account.name} className="min-w-0">
    <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Chip size="sm">{ACCOUNT_KINDS.find((option) => option.value === kind)?.label}</Chip>
      {account.archived && <Chip size="sm">Archived</Chip>}
      <span className="break-words">{account.institution}</span>
      {account.last4 && <span className="font-mono">•••• {account.last4}</span>}
      <Button variant="ghost" size="icon-sm" className="ml-auto shrink-0" aria-label={`Edit ${account.name}`} onClick={onEdit}><Pencil /></Button>
    </div>
    <div>
      <p className="text-xs text-muted-foreground">{kind === 'credit' ? 'Current debt' : kind === 'debit' ? 'Linked bank balance' : 'Balance'}</p>
      <p className="mt-1 break-words font-mono text-xl font-medium tabular-nums">{money(balance)}</p>
    </div>
    {details.length > 0 && <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {details.map((detail) => <div key={detail.label} className="min-w-0"><dt className="text-xs text-muted-foreground">{detail.label}</dt>
        <dd className="mt-1 break-words text-sm">{detail.value}</dd></div>)}
    </dl>}
    {account.fees.length > 0 && <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">Fees</p>
      {account.fees.map((fee) => <div key={fee.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs">
        <span className="break-words">{fee.name}</span>
        <span className="font-mono">{money(fee.amount)} · {FEE_CADENCES.find((cadence) => cadence.value === fee.cadence)?.label}</span>
      </div>)}
    </div>}
    {account.notes && <p className="whitespace-pre-wrap break-words border-t border-border pt-3 text-sm text-muted-foreground">{account.notes}</p>}
    <div className="flex justify-end border-t border-border pt-2">
      {account.archived ? <Button variant="ghost" size="sm" onClick={onRestore} aria-label={`Restore ${account.name}`}><RotateCcw />Restore</Button>
        : <Button variant="ghost" size="sm" onClick={onArchive} aria-label={`Archive ${account.name}`}><Archive />Archive</Button>}
    </div>
    </div>
  </WidgetCard>
}
