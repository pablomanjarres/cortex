import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Modal } from '@/components/shared/Modal'
import { Notice } from '@/components/shared/Notice'
import { SearchInput } from '@/components/shared/SearchInput'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useStore } from '@/lib/store'
import { useToday } from '@/lib/use-today'
import { AccountCard } from './AccountCard'
import { AccountDates } from './AccountDates'
import { AccountForm } from './AccountForm'
import { ACCOUNT_KINDS } from './account-options'
import { AccountSummary } from './AccountSummary'
import { ACCOUNTS_KEY, EMPTY_ACCOUNTS, MAX_ACCOUNTS, type AccountsData, type FinancialAccount } from './account-model'
import { applyAccountChange, type AccountChange } from './account-update'

const PAGE_SIZE = 12
export function AccountsSection() {
  const [data, update] = useStore<AccountsData>(ACCOUNTS_KEY, EMPTY_ACCOUNTS)
  const today = useToday()
  const [editing, setEditing] = useState<FinancialAccount | 'new' | null>(null)
  const [archiving, setArchiving] = useState<FinancialAccount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [archived, setArchived] = useState(false)
  const [page, setPage] = useState(0)
  const accounts = data.accounts
  const filtered = useMemo(() => accounts.filter((account) => account.archived === archived
    && (kind === 'all' || account.kind === kind)
    && `${account.name} ${account.institution} ${account.last4 ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [accounts, archived, kind, search])
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  const closeEditor = () => setEditing(null)
  const commit = (change: AccountChange) => update((previous) => {
    const result = applyAccountChange(previous, change)
    if (result.error) queueMicrotask(() => {
      setError(result.error)
      window.dispatchEvent(new CustomEvent('cortex:store-error', { detail: { key: ACCOUNTS_KEY } }))
    })
    return result.data
  })
  const save = (account: FinancialAccount): string | null => {
    const result = applyAccountChange(data, { type: 'save', account })
    if (result.error) return result.error
    commit({ type: 'save', account })
    setError(null)
    closeEditor()
    return null
  }
  const changeArchived = (account: FinancialAccount, next: boolean) => {
    const result = applyAccountChange(data, { type: 'archive', id: account.id, archived: next })
    if (result.error) { setError(result.error); return }
    commit({ type: 'archive', id: account.id, archived: next })
    setArchiving(null)
    setError(null)
    if (!next) setArchived(false)
  }
  return <section aria-labelledby="accounts-title" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="accounts-title" className="text-2xl font-semibold tracking-tight">Accounts & cards</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your banks, cards, fees, and key dates in one place.</p></div>
      <Button onClick={() => setEditing('new')} disabled={accounts.length >= MAX_ACCOUNTS}><Plus />Add account</Button>
    </div>
    {accounts.some((account) => !account.archived) && <>
      <AccountSummary accounts={accounts} />
      <AccountDates accounts={accounts} today={today} />
    </>}
    <div className="flex flex-wrap items-center gap-3">
      <SearchInput label="Search accounts" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Search accounts…" containerClassName="min-w-0 flex-1 basis-full sm:basis-0" />
      <Select value={kind} onChange={(event) => { setKind(event.target.value); setPage(0) }} aria-label="Account type" className="w-auto">
        <option value="all">All types</option>{ACCOUNT_KINDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
      <Button variant="ghost" aria-pressed={archived} onClick={() => { setArchived((previous) => !previous); setPage(0) }}>{archived ? 'Show active' : 'Show archived'}</Button>
    </div>
    {filtered.length === 0 ? <EmptyState message={accounts.length === 0 ? 'Add your first account' : 'No matching accounts'}
      hint={accounts.length === 0 ? 'Track bank balances, credit limits, due days, and fees. Link debit cards to their bank accounts.' : 'Try another filter or switch between active and archived accounts.'} />
      : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 items-start">
        {filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((account) => <AccountCard key={account.id} account={account} accounts={accounts} today={today}
          onEdit={() => setEditing(account)} onArchive={() => { setError(null); setArchiving(account) }} onRestore={() => changeArchived(account, false)} />)}
      </div>}
    {lastPage > 0 && <div className="flex items-center justify-end gap-3">
      <Button variant="secondary" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
      <span className="text-xs text-muted-foreground">{currentPage + 1} / {lastPage + 1}</span>
      <Button variant="secondary" size="sm" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next</Button>
    </div>}
    {error && !archiving && <Notice tone="danger">{error}</Notice>}
    <Modal open={editing !== null} onOpenChange={(open) => { if (!open) closeEditor() }} title={editing === 'new' ? 'Add account' : 'Edit account'}
      description="Keep balances, fees, and dates up to date from your bank." size="lg" className="max-h-[90dvh] overflow-y-auto">
      {editing !== null && <AccountForm key={typeof editing === 'string' ? 'new' : editing.id} account={editing === 'new' ? undefined : editing}
        accounts={accounts} onSave={save} onCancel={closeEditor} />}
    </Modal>
    <Modal open={archiving !== null} onOpenChange={(open) => { if (!open) { setArchiving(null); setError(null) } }} title="Archive account" size="sm">
      <p className="text-sm text-muted-foreground">Archive {archiving?.name}? Its details stay saved. Archived accounts leave the totals and upcoming dates.</p>
      {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => { setArchiving(null); setError(null) }}>Cancel</Button>
        <Button onClick={() => { if (archiving) changeArchived(archiving, true) }}>Archive account</Button>
      </div>
    </Modal>
  </section>
}
