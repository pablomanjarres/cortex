import { WidgetCard } from '@/components/widgets/WidgetCard'
import { upcomingAccountDates, formatAccountMoney, type FinancialAccount } from './account-model'
import { accountDateLabel } from './account-format'

export function AccountDates({ accounts, today }: { accounts: FinancialAccount[]; today: string }) {
  const dates = upcomingAccountDates(accounts, today, 12)
  return <WidgetCard title="Upcoming dates">
    {dates.length === 0 ? <p className="text-sm text-muted-foreground">Add due days, closing days, fee dates, or card expiration months to see them here.</p>
      : <ol className="divide-y divide-border">{dates.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
        <div className="min-w-0"><p className="break-words text-sm">{entry.label} · {entry.accountName}</p>
          {entry.amount !== undefined && <p className="mt-1 font-mono text-xs text-muted-foreground">{formatAccountMoney(entry.amount, entry.currency)}</p>}
        </div>
        <time dateTime={entry.date} className="shrink-0 font-mono text-xs text-muted-foreground">{accountDateLabel(entry.date)}</time>
      </li>)}</ol>}
    <p className="mt-4 text-xs text-muted-foreground">Scheduled dates only. Update balances and statement amounts from your bank.</p>
  </WidgetCard>
}
