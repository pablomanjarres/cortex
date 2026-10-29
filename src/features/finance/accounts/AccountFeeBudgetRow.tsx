import { Link } from 'react-router-dom'
import { SettlementControl } from '../SettlementControl'
import { isPaidFor, settlementFor } from '../finance-model'
import type { AccountFeeBudgetItem } from './account-budget'
import { formatAccountMoney } from './account-model'
import { ACCOUNT_FEE_GROUP } from '../budget-view'

export function AccountFeeBudgetRow({ item, visibleMonths, selectedMonth, format, formatCompact, onSettle }: {
  item: AccountFeeBudgetItem; visibleMonths: number[]; selectedMonth: number
  format: (amount: number) => string; formatCompact: (amount: number) => string; onSettle: (amount: number | null) => void
}) {
  const displayMonths = item.missingRate ? item.originalMonths : item.months
  const displayAmount = item.missingRate ? (amount: number) => formatAccountMoney(amount, item.originalCurrency) : format
  return <tr className="border-b border-border/20 hover:bg-secondary/30">
    <td className="sticky left-0 z-10 min-w-[240px] bg-card px-4 py-2">
      <SettlementControl key={selectedMonth} name={item.name} settlement={settlementFor(item, selectedMonth)} formatAmount={formatCompact} onSave={onSettle}>
        <Link to="/finance?view=accounts" className="block text-sm font-medium hover:underline">{item.name}</Link>
        <p className="text-2xs text-muted-foreground">{item.missingDate ? 'Set a charge date in Accounts' : item.missingRate ? `${item.originalCurrency} · set COP amount to include in totals` : 'Account fee · managed in Accounts'}</p>
      </SettlementControl>
    </td>
    <td className="py-2 text-muted-foreground">{ACCOUNT_FEE_GROUP}</td>
    <td className="py-2 text-muted-foreground">Other</td>
    {visibleMonths.map((month) => <td key={month} className={`py-2 text-right font-mono tabular-nums ${isPaidFor(item, month) ? 'bg-success/10 text-success' : month === selectedMonth ? 'bg-foreground/[0.03]' : 'text-muted-foreground'}`}>
      {displayMonths[month] ? displayAmount(displayMonths[month]) : '—'}
    </td>)}
    <td className="py-2 text-right font-mono font-medium tabular-nums">{displayAmount(displayMonths.reduce((total, amount) => total + amount, 0))}</td>
    <td className="py-2 pr-4" />
  </tr>
}
