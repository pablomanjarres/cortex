import { useState, useMemo, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { FilterChips } from '@/components/shared/FilterChips'
import { DisclosureCard, DisclosureTableRow } from '@/components/shared/RecordDisclosure'
import { SearchInput } from '@/components/shared/SearchInput'
import { SortableHeader, tableHeaderClassName } from '@/components/shared/SortableHeader'
import { useStore } from '@/lib/store'
import { NoelleCrmPanel } from './noelle-crm-panel'
import { useOpenOnce, useRecordParam } from '@/lib/use-url-param'
import {
  Plus,
  Trash2,
  Building2,
  DollarSign,
  Users,
} from 'lucide-react'
import {
  ALL_STATUSES, DEFAULT_DATA, fmtDate, fmtMoney, statusConfig,
  type CrmContact, type CrmData, type CrmStatus, type SortKey,
} from './crm-model'
import { CrmContactEditor, CrmStatusChip } from './CrmContactFields'

/** Stable fallback so memoized views do not recompute when no org is active. */
const EMPTY_CONTACTS: CrmContact[] = []

// ── Component ────────────────────────────────────────────────────────────────

export function CrmPage() {
  const [data, updateData] = useStore<CrmData>('cortex-crm', DEFAULT_DATA)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CrmStatus | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [newOrgName, setNewOrgName] = useState('')
  const [showNewOrg, setShowNewOrg] = useState(false)

  const activeOrg = data.orgs.find((o) => o.id === data.activeOrg) || data.orgs[0]
  const contacts = activeOrg?.contacts ?? EMPTY_CONTACTS

  const setActiveOrg = (id: string) => updateData((p) => ({ ...p, activeOrg: id }))

  // `?record=crm:<id>` opens that contact, switching to its org when needed.
  const recordId = useRecordParam('crm')
  const recordOrg = recordId ? data.orgs.find((o) => o.contacts.some((c) => c.id === recordId))?.id ?? null : null
  useOpenOnce(recordOrg ? recordId : null, setExpanded)
  useEffect(() => {
    if (recordOrg) updateData((p) => (p.activeOrg === recordOrg ? p : { ...p, activeOrg: recordOrg }))
  }, [recordOrg, updateData])

  const updateContacts = (fn: (prev: CrmContact[]) => CrmContact[]) =>
    updateData((p) => ({
      ...p,
      orgs: p.orgs.map((o) => o.id === p.activeOrg ? { ...o, contacts: fn(o.contacts) } : o),
    }))

  const setField = (id: string, f: Partial<CrmContact>) =>
    updateContacts((prev) => prev.map((c) => c.id === id ? { ...c, ...f } : c))

  const deleteContact = (id: string) => {
    updateContacts((prev) => prev.filter((c) => c.id !== id))
    if (expanded === id) setExpanded(null)
  }

  const addContact = () => {
    const c: CrmContact = {
      id: `crm-${Date.now()}`, name: 'New Contact', company: '', role: '',
      email: '', phone: '', website: '', status: 'lead', value: 0,
      notes: '', lastContact: '', tags: [],
    }
    updateContacts((prev) => [c, ...prev])
    setExpanded(c.id)
  }

  const addOrg = () => {
    const name = newOrgName.trim()
    if (!name) return
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    updateData((p) => ({
      ...p,
      orgs: [...p.orgs, { id, name, contacts: [] }],
      activeOrg: id,
    }))
    setNewOrgName('')
    setShowNewOrg(false)
  }

  const deleteOrg = (id: string) => {
    if (data.orgs.length <= 1) return
    updateData((p) => ({
      ...p,
      orgs: p.orgs.filter((o) => o.id !== id),
      activeOrg: p.activeOrg === id ? p.orgs[0].id : p.activeOrg,
    }))
  }

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((p) => !p)
    else { setSortKey(k); setSortAsc(true) }
  }
  const sortProps = (k: SortKey) => ({ active: sortKey === k, ascending: sortAsc, onSort: () => toggleSort(k) })
  const toggleExpanded = (id: string) => setExpanded(expanded === id ? null : id)

  const filtered = useMemo(() => {
    const lowerSearch = search.toLowerCase()
    const list = contacts.filter((c) =>
      (!statusFilter || c.status === statusFilter) &&
      (!search || c.name.toLowerCase().includes(lowerSearch) || c.company.toLowerCase().includes(lowerSearch) || c.role.toLowerCase().includes(lowerSearch))
    )
    list.sort((a, b) => {
      let v = 0
      switch (sortKey) {
        case 'name': v = a.name.localeCompare(b.name); break
        case 'company': v = a.company.localeCompare(b.company); break
        case 'value': v = a.value - b.value; break
        case 'status': v = ALL_STATUSES.indexOf(a.status) - ALL_STATUSES.indexOf(b.status); break
        case 'lastContact': v = (a.lastContact || '').localeCompare(b.lastContact || ''); break
      }
      return sortAsc ? v : -v
    })
    return list
  }, [contacts, search, statusFilter, sortKey, sortAsc])

  // Stats
  const totalValue = contacts.filter((c) => c.status === 'active').reduce((s, c) => s + c.value, 0)
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of contacts) counts[c.status] = (counts[c.status] || 0) + 1
    return counts
  }, [contacts])
  const emptyState = (
    <EmptyState
      message={contacts.length === 0 ? 'No contacts yet.' : 'No contacts match.'}
      hint={contacts.length === 0 ? 'Press Add to create one.' : 'Try clearing a filter.'}
    />
  )

  return (
    <PageShell>
      <NoelleCrmPanel />
      {/* Org switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {data.orgs.map((org) => (
          <Chip
            key={org.id}
            selectable
            selected={data.activeOrg === org.id}
            onClick={() => setActiveOrg(org.id)}
          >
            <Building2 />
            {org.name}
            <span className="tabular-nums opacity-60">{org.contacts.length}</span>
          </Chip>
        ))}
        {showNewOrg ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addOrg()}
              placeholder="Org name..."
              aria-label="Organization name"
              className="h-7 w-32 text-xs"
              autoFocus
            />
            <Button size="sm" onClick={addOrg}>Add</Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowNewOrg(false); setNewOrgName('') }}>Cancel</Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setShowNewOrg(true)}>
            <Plus /> New org
          </Button>
        )}
        {/* Delete current org */}
        {data.orgs.length > 1 && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete this org"
            title="Delete this org"
            className="ml-auto hover:bg-destructive/10 hover:text-destructive"
            onClick={() => deleteOrg(data.activeOrg)}
          >
            <Trash2 />
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total contacts" value={contacts.length} icon={<Users />} />
        <StatTile label="Active value" value={fmtMoney(totalValue) || '$0'} icon={<DollarSign />} />
        <StatTile label="Active" value={statusCounts.active || 0} />
        <StatTile label="Leads" value={statusCounts.lead || 0} />
      </div>

      {/* Search + Filters + Add */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput label="Search CRM contacts" placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="max-w-xs flex-1" className="h-8 text-xs" />
        <FilterChips label="Filter by status" size="md" value={statusFilter} onChange={setStatusFilter}
          options={ALL_STATUSES.map((s) => ({ value: s, label: statusConfig[s].label, variant: statusConfig[s].chip }))} />
        <Button size="sm" className="ml-auto" onClick={addContact}>
          <Plus /> Add
        </Button>
      </div>

      {/* Mobile: Contact cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {filtered.length === 0 ? emptyState : filtered.map((c) => (
          <DisclosureCard key={c.id} name={c.name} detailsId={`crm-card-${c.id}`} expanded={expanded === c.id} onToggle={() => toggleExpanded(c.id)}
            subtitle={[c.company, c.role].filter(Boolean).join(' · ') || 'No company'}
            aside={<CrmStatusChip status={c.status} className="mt-1" />}
            meta={(
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                {c.value > 0 && <span className="font-mono tabular-nums">{fmtMoney(c.value)}</span>}
                {c.lastContact && <span className="font-mono">{fmtDate(c.lastContact)}</span>}
                {c.tags.length > 0 && <span className="truncate">{c.tags.join(', ')}</span>}
              </div>
            )}>
            <CrmContactEditor contact={c} onChange={(patch) => setField(c.id, patch)} onDelete={() => deleteContact(c.id)} />
          </DisclosureCard>
        ))}
      </div>

      {/* Desktop: Table */}
      <WidgetCard title={activeOrg?.name || 'CRM'} description={`${filtered.length} contacts`} delay={0.1} className="hidden md:block">
        {filtered.length === 0 ? emptyState : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <SortableHeader label="Name" {...sortProps('name')} className="min-w-[160px] px-4" />
                  <SortableHeader label="Company" {...sortProps('company')} className="min-w-[120px]" />
                  <th scope="col" className={tableHeaderClassName}>Role</th>
                  <SortableHeader label="Status" {...sortProps('status')} />
                  <SortableHeader label="Value" {...sortProps('value')} className="text-right" />
                  <SortableHeader label="Last" {...sortProps('lastContact')} className="text-right" />
                  <th className="w-6 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <DisclosureTableRow key={c.id} name={c.name} detailsId={`crm-row-${c.id}`} expanded={expanded === c.id} onToggle={() => toggleExpanded(c.id)}
                    colSpan={7} details={<CrmContactEditor contact={c} onChange={(patch) => setField(c.id, patch)} onDelete={() => deleteContact(c.id)} />}>
                    {(toggle) => <>
                      <td className="px-4 py-2.5">{toggle}</td>
                      <td className="py-2.5 text-muted-foreground">{c.company || '—'}</td>
                      <td className="py-2.5 text-muted-foreground">{c.role || '—'}</td>
                      <td className="py-2.5"><CrmStatusChip status={c.status} /></td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">{fmtMoney(c.value) || '—'}</td>
                      <td className="py-2.5 text-right font-mono text-muted-foreground">{c.lastContact ? fmtDate(c.lastContact) : '—'}</td>
                      <td className="py-2.5 pr-4">
                        <Button variant="ghost" size="icon-xs" aria-label="Delete contact" className="opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteContact(c.id) }}>
                          <Trash2 />
                        </Button>
                      </td>
                    </>}
                  </DisclosureTableRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>
    </PageShell>
  )
}
