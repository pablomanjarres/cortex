import { StatTile } from '@/components/shared/StatTile'
import { accountSummaries, formatAccountMoney, type FinancialAccount } from './account-model'

export function AccountSummary({ accounts }: { accounts: FinancialAccount[] }) {
  const money = (amount: number, currency: string) => <span className="block text-base sm:text-lg [overflow-wrap:anywhere]">{formatAccountMoney(amount, currency)}</span>
  return <div className="space-y-4">{accountSummaries(accounts).map((summary) => <section key={summary.currency} aria-label={`${summary.currency} summary`} className="space-y-2">
    <h3 className="text-sm font-medium text-muted-foreground">{summary.currency}</h3>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile label="Bank balances" value={money(summary.bankBalance, summary.currency)} className="min-w-0" />
      <StatTile label="Credit card debt" value={money(summary.creditDebt, summary.currency)} className="min-w-0" />
      <StatTile label="Credit limits" value={money(summary.creditLimit, summary.currency)} className="min-w-0" />
      <StatTile label="Fees / month" value={money(summary.monthlyFees, summary.currency)} sub="Monthly equivalent of recurring fees" className="min-w-0" />
    </div>
    {accounts.some((account) => !account.archived && account.currency === summary.currency && account.kind !== 'debit' && account.balance === undefined)
      && <p className="text-xs text-muted-foreground">Totals include recorded balances only.</p>}
  </section>)}</div>
}
