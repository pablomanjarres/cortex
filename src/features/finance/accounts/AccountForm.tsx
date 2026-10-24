import { useState, type FormEvent } from 'react'
import { Field } from '@/components/shared/Field'
import { Notice } from '@/components/shared/Notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { AccountFeesEditor, type FeeDraft } from './AccountFeesEditor'
import { AccountCycleFields, type CycleMonths } from './AccountCycleFields'
import { validateAccount, type AccountKind, type FinancialAccount } from './account-model'
import { ACCOUNT_KINDS } from './account-options'
import { parseAccountAmount } from './account-input'

type NumericField = 'balance' | 'creditLimit' | 'minimumPayment' | 'annualInterestRate' | 'closingDay' | 'dueDay'
const optionalNumber = (value: string) => value.trim() === '' ? undefined : Number(value)

export function AccountForm({ account, accounts, onSave, onCancel }: {
  account?: FinancialAccount; accounts: FinancialAccount[]; onSave: (account: FinancialAccount) => string | null; onCancel: () => void
}) {
  const [id] = useState(() => account?.id ?? crypto.randomUUID())
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'bank')
  const [name, setName] = useState(account?.name ?? '')
  const [institution, setInstitution] = useState(account?.institution ?? '')
  const [currency, setCurrency] = useState(account?.currency ?? 'COP')
  const [last4, setLast4] = useState(account?.last4 ?? '')
  const [linkedAccountId, setLinkedAccountId] = useState(account?.linkedAccountId ?? '')
  const [expiresOn, setExpiresOn] = useState(account?.expiresOn ?? '')
  const [notes, setNotes] = useState(account?.notes ?? '')
  const [cycleMonths, setCycleMonths] = useState<CycleMonths>({ closingStartMonth: account?.closingStartMonth ?? '', dueStartMonth: account?.dueStartMonth ?? '' })
  const [numbers, setNumbers] = useState<Record<NumericField, string>>(() => Object.fromEntries(
    (['balance', 'creditLimit', 'minimumPayment', 'annualInterestRate', 'closingDay', 'dueDay'] as const)
      .map((key) => [key, account?.[key]?.toString() ?? '']),
  ) as Record<NumericField, string>)
  const [fees, setFees] = useState<FeeDraft[]>(() => (account?.fees ?? []).map((fee) => ({ ...fee, amount: String(fee.amount), nextChargeDate: fee.nextChargeDate ?? '', budgetAmountCOP: fee.budgetAmountCOP?.toString() ?? '', budgetStartMonth: fee.budgetStartMonth ?? fee.nextChargeDate?.slice(0, 7) ?? '' })))
  const [error, setError] = useState<string | null>(null)
  const numberField = (key: Exclude<NumericField, 'closingDay' | 'dueDay'>, label: string, hint?: string) => <Field key={key} label={label} hint={hint}>{(fieldId) => <Input
    id={fieldId} inputMode="decimal" value={numbers[key]}
    onChange={(e) => setNumbers((previous) => ({ ...previous, [key]: e.target.value }))} />}</Field>
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const entry: FinancialAccount = {
      id, kind, name: name.trim(), institution: institution.trim(), currency: currency.trim().toUpperCase(),
      archived: account?.archived ?? false, last4: last4.trim() || undefined, notes: notes.trim() || undefined,
      ...(kind !== 'debit' ? { balance: parseAccountAmount(numbers.balance, currency) } : { linkedAccountId: linkedAccountId || undefined }),
      ...(kind !== 'bank' ? { expiresOn: expiresOn || undefined } : {}),
      ...(kind === 'credit' ? Object.fromEntries((['creditLimit', 'minimumPayment', 'annualInterestRate', 'closingDay', 'dueDay'] as const)
        .map((key) => [key, key === 'creditLimit' || key === 'minimumPayment' ? parseAccountAmount(numbers[key], currency) : optionalNumber(numbers[key])])) : {}),
      ...(kind === 'credit' ? { closingStartMonth: cycleMonths.closingStartMonth || undefined, dueStartMonth: cycleMonths.dueStartMonth || undefined } : {}),
      fees: fees.map((fee) => ({ ...fee, name: fee.name.trim(), amount: parseAccountAmount(fee.amount, currency) ?? NaN, nextChargeDate: fee.nextChargeDate || undefined,
        budgetAmountCOP: currency === 'COP' ? undefined : parseAccountAmount(fee.budgetAmountCOP, 'COP'), budgetStartMonth: fee.nextChargeDate ? undefined : fee.budgetStartMonth || undefined })),
    }
    const invalid = validateAccount(entry, accounts)
    if (invalid) { setError(invalid); return }
    setError(onSave(entry))
  }
  return <form onSubmit={submit} className="space-y-4" noValidate>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Type">{(fieldId) => <Select id={fieldId} value={kind} onChange={(e) => setKind(e.target.value as AccountKind)} disabled={Boolean(account)}>
        {ACCOUNT_KINDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>}</Field>
      <Field label="Currency" hint="Three-letter code, such as COP or USD.">{(fieldId) => <Input id={fieldId} value={currency} maxLength={3} autoCapitalize="characters"
        onChange={(e) => setCurrency(e.target.value.toUpperCase())} />}</Field>
      <Field label="Name">{(fieldId) => <Input id={fieldId} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Everyday savings" />}</Field>
      <Field label="Institution">{(fieldId) => <Input id={fieldId} value={institution} maxLength={80} onChange={(e) => setInstitution(e.target.value)} placeholder="Bank or card issuer" />}</Field>
      <Field label="Last 4 digits" hint="Optional identifier.">{(fieldId) => <Input id={fieldId} value={last4} inputMode="numeric" maxLength={4} autoComplete="off"
        onChange={(e) => setLast4(e.target.value)} placeholder="1234" />}</Field>
      {kind !== 'bank' && <Field label="Expiration month">{(fieldId) => <Input id={fieldId} type="month" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />}</Field>}
      {kind !== 'debit' && numberField('balance', kind === 'credit' ? 'Current debt' : 'Balance', 'Leave blank if unknown.')}
      {kind === 'debit' && <Field label="Linked bank account" hint="Uses the bank account’s balance.">{(fieldId) => <Select id={fieldId} value={linkedAccountId} onChange={(e) => setLinkedAccountId(e.target.value)}>
        <option value="">Unlinked</option>
        {accounts.filter((entry) => entry.kind === 'bank' && !entry.archived && entry.currency === currency).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </Select>}</Field>}
      {kind === 'credit' && <>
        {numberField('creditLimit', 'Credit limit')}
        {numberField('minimumPayment', 'Minimum payment', 'Current statement amount; update when it changes.')}
        {numberField('annualInterestRate', 'Annual interest (%)')}
        <AccountCycleFields days={numbers} months={cycleMonths}
          onDayChange={(key, value) => setNumbers((previous) => ({ ...previous, [key]: value }))}
          onMonthChange={(key, value) => setCycleMonths((previous) => ({ ...previous, [key]: value }))} />
      </>}
    </div>
    <AccountFeesEditor fees={fees} currency={currency} onChange={setFees} />
    <Field label="Notes">{(fieldId) => <Textarea id={fieldId} value={notes} maxLength={1000} rows={3} onChange={(e) => setNotes(e.target.value)} placeholder="Benefits, fee waivers, payment instructions…" />}</Field>
    {error && <Notice tone="danger">{error}</Notice>}
    <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
      <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button type="submit">Save account</Button>
    </div>
  </form>
}
