import { useState, useMemo, Fragment } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import {
  Search,
  Plus,
  Trash2,
  Building2,
  Phone,
  Mail,
  Globe,
  DollarSign,
  Users,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface CrmContact {
  id: string
  name: string
  company: string
  role: string
  email: string
  phone: string
  website: string
  status: 'lead' | 'prospect' | 'active' | 'churned' | 'paused'
  value: number
  notes: string
  lastContact: string
  tags: string[]
}

interface CrmOrg {
  id: string
  name: string
  contacts: CrmContact[]
}

interface CrmData {
  orgs: CrmOrg[]
  activeOrg: string
}

const DEFAULT_DATA: CrmData = {
  orgs: [
    { id: 'freelancing', name: 'Freelancing', contacts: [] },
  ],
  activeOrg: 'freelancing',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Pipeline states map to the semantic Chip trio (see OpportunitiesPage):
// only truly semantic states carry a tone; new/incoming stays neutral.
type ChipVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const statusConfig: Record<CrmContact['status'], { label: string; chip: ChipVariant }> = {
  lead: { label: 'Lead', chip: 'neutral' },
  prospect: { label: 'Prospect', chip: 'accent' },
  active: { label: 'Active', chip: 'success' },
  churned: { label: 'Churned', chip: 'danger' },
  paused: { label: 'Paused', chip: 'warning' },
}

const ALL_STATUSES: CrmContact['status'][] = ['lead', 'prospect', 'active', 'churned', 'paused']

type SortKey = 'name' | 'company' | 'value' | 'status' | 'lastContact'

function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '' }
function fmtMoney(n: number) { return n > 0 ? `$${n.toLocaleString('en-US')}` : '' }

// Shared token styles (same quiet patterns as the other contact tables).
const selectCls =
  'h-8 w-full cursor-pointer rounded-md border border-input bg-input/20 px-2 text-xs text-foreground transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const textareaCls =
  'w-full resize-none rounded-md border border-input bg-input/20 px-3 py-2 text-xs text-foreground outline-none placeholder:text-foreground-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const lineInputCls = 'w-full border-b border-border/60 bg-transparent py-1 text-xs outline-none placeholder:text-foreground-faint'
const labelCls = 'text-2xs text-muted-foreground'
const thCls = 'py-2 text-left font-mono text-2xs font-normal uppercase tracking-wider'
const thBtnCls = 'flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground'

// ── Component ────────────────────────────────────────────────────────────────

export function CrmPage() {
  const [data, updateData] = useStore<CrmData>('cortex-crm', DEFAULT_DATA)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CrmContact['status'] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [newOrgName, setNewOrgName] = useState('')
  const [showNewOrg, setShowNewOrg] = useState(false)

  const activeOrg = data.orgs.find((o) => o.id === data.activeOrg) || data.orgs[0]
  const contacts = activeOrg?.contacts || []

  const setActiveOrg = (id: string) => updateData((p) => ({ ...p, activeOrg: id }))

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
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />

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

  return (
    <PageShell>
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
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-faint" />
          <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_STATUSES.map((s) => (
            <Chip key={s} selectable variant={statusConfig[s].chip} selected={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? null : s)}>
              {statusConfig[s].label}
            </Chip>
          ))}
        </div>
        <Button size="sm" className="ml-auto" onClick={addContact}>
          <Plus /> Add
        </Button>
      </div>

      {/* Mobile: Contact cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {filtered.length === 0 ? (
          <EmptyState
            message={contacts.length === 0 ? 'No contacts yet.' : 'No contacts match.'}
            hint={contacts.length === 0 ? 'Press Add to create one.' : 'Try clearing a filter.'}
          />
        ) : filtered.map((c) => (
          <div key={c.id} className="surface rounded-xl p-4">
            <div className="flex items-start justify-between" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">{[c.company, c.role].filter(Boolean).join(' · ') || 'No company'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Chip size="sm" variant={statusConfig[c.status].chip}>{statusConfig[c.status].label}</Chip>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              {c.value > 0 && <span className="font-mono tabular-nums">{fmtMoney(c.value)}</span>}
              {c.lastContact && <span className="font-mono">{fmtDate(c.lastContact)}</span>}
              {c.tags.length > 0 && <span className="truncate">{c.tags.join(', ')}</span>}
            </div>
            {expanded === c.id && (
              <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-3">
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Name</label>
                  <input value={c.name} onChange={(e) => setField(c.id, { name: e.target.value })} className={`${lineInputCls} pb-1 text-sm font-semibold`} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>Company</label><input value={c.company} onChange={(e) => setField(c.id, { company: e.target.value })} className={lineInputCls} /></div>
                  <div><label className={labelCls}>Role</label><input value={c.role} onChange={(e) => setField(c.id, { role: e.target.value })} className={lineInputCls} /></div>
                </div>
                <div><label className={labelCls}>Status</label>
                  <select value={c.status} onChange={(e) => setField(c.id, { status: e.target.value as CrmContact['status'] })} className={selectCls}>
                    {ALL_STATUSES.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.phone} onChange={(e) => setField(c.id, { phone: e.target.value })} placeholder="Phone" className={`${lineInputCls} flex-1 font-mono`} /></div>
                <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.email} onChange={(e) => setField(c.id, { email: e.target.value })} placeholder="Email" className={`${lineInputCls} flex-1`} /></div>
                <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.website} onChange={(e) => setField(c.id, { website: e.target.value })} placeholder="Website" className={`${lineInputCls} flex-1 font-mono`} /></div>
                <div className="flex items-center gap-2"><DollarSign className="h-3.5 w-3.5 text-muted-foreground" /><input type="number" value={c.value || ''} onChange={(e) => setField(c.id, { value: parseInt(e.target.value) || 0 })} placeholder="Deal value" className={`${lineInputCls} flex-1 font-mono tabular-nums`} /></div>
                <div><label className={labelCls}>Last Contact</label><input type="date" value={c.lastContact} onChange={(e) => setField(c.id, { lastContact: e.target.value })} className={`${lineInputCls} cursor-pointer font-mono`} /></div>
                <div><label className={labelCls}>Notes</label>
                  <textarea value={c.notes} onChange={(e) => setField(c.id, { notes: e.target.value })} className={textareaCls} rows={3} placeholder="Notes..." />
                </div>
                <div><label className={labelCls}>Tags (comma-separated)</label>
                  <input value={c.tags.join(', ')} onChange={(e) => setField(c.id, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} className={lineInputCls} placeholder="vip, priority..." />
                </div>
                <Button variant="destructive" size="sm" className="w-full" onClick={() => deleteContact(c.id)}>
                  <Trash2 /> Delete contact
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: Table */}
      <WidgetCard title={activeOrg?.name || 'CRM'} description={`${filtered.length} contacts`} delay={0.1} className="hidden md:block">
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                {/* Sort headers: compact table-header toggles (focus ring from the global rule). */}
                <th className={`${thCls} min-w-[160px] px-4`}>
                  <button onClick={() => toggleSort('name')} className={thBtnCls}>Name <SortIcon k="name" /></button>
                </th>
                <th className={`${thCls} min-w-[120px]`}>
                  <button onClick={() => toggleSort('company')} className={thBtnCls}>Company <SortIcon k="company" /></button>
                </th>
                <th className={thCls}>Role</th>
                <th className={thCls}>
                  <button onClick={() => toggleSort('status')} className={thBtnCls}>Status <SortIcon k="status" /></button>
                </th>
                <th className={`${thCls} text-right`}>
                  <button onClick={() => toggleSort('value')} className={`${thBtnCls} ml-auto`}>Value <SortIcon k="value" /></button>
                </th>
                <th className={`${thCls} text-right`}>
                  <button onClick={() => toggleSort('lastContact')} className={`${thBtnCls} ml-auto`}>Last <SortIcon k="lastContact" /></button>
                </th>
                <th className="w-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <Fragment key={c.id}>
                  <tr onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    className={`group cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary/30 ${expanded === c.id ? 'bg-secondary/20' : ''}`}>
                    <td className="px-4 py-2.5"><span className="font-medium">{c.name}</span></td>
                    <td className="py-2.5 text-muted-foreground">{c.company || '—'}</td>
                    <td className="py-2.5 text-muted-foreground">{c.role || '—'}</td>
                    <td className="py-2.5"><Chip size="sm" variant={statusConfig[c.status].chip}>{statusConfig[c.status].label}</Chip></td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">{fmtMoney(c.value) || '—'}</td>
                    <td className="py-2.5 text-right font-mono text-muted-foreground">{c.lastContact ? fmtDate(c.lastContact) : '—'}</td>
                    <td className="py-2.5 pr-4">
                      <Button variant="ghost" size="icon-xs" aria-label="Delete contact" className="opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteContact(c.id) }}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr>
                      <td colSpan={7} className="border-b border-border/60 bg-secondary/10 px-4 py-4">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                          <div className="flex flex-col gap-2">
                            <label className={labelCls}>Name</label>
                            <input value={c.name} onChange={(e) => setField(c.id, { name: e.target.value })} className={`${lineInputCls} pb-1 text-sm font-semibold`} />
                            <div className="grid grid-cols-2 gap-2">
                              <div><label className={labelCls}>Company</label><input value={c.company} onChange={(e) => setField(c.id, { company: e.target.value })} className={lineInputCls} /></div>
                              <div><label className={labelCls}>Role</label><input value={c.role} onChange={(e) => setField(c.id, { role: e.target.value })} className={lineInputCls} /></div>
                            </div>
                            <div><label className={labelCls}>Status</label>
                              <select value={c.status} onChange={(e) => setField(c.id, { status: e.target.value as CrmContact['status'] })} className={selectCls}>
                                {ALL_STATUSES.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.phone} onChange={(e) => setField(c.id, { phone: e.target.value })} placeholder="Phone" className={`${lineInputCls} flex-1 font-mono`} /></div>
                            <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.email} onChange={(e) => setField(c.id, { email: e.target.value })} placeholder="Email" className={`${lineInputCls} flex-1`} /></div>
                            <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.website} onChange={(e) => setField(c.id, { website: e.target.value })} placeholder="Website" className={`${lineInputCls} flex-1 font-mono`} /></div>
                            <div className="flex items-center gap-2"><DollarSign className="h-3.5 w-3.5 text-muted-foreground" /><input type="number" value={c.value || ''} onChange={(e) => setField(c.id, { value: parseInt(e.target.value) || 0 })} placeholder="Deal value" className={`${lineInputCls} flex-1 font-mono tabular-nums`} /></div>
                            <div><label className={labelCls}>Last Contact</label><input type="date" value={c.lastContact} onChange={(e) => setField(c.id, { lastContact: e.target.value })} className={`${lineInputCls} cursor-pointer font-mono`} /></div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className={labelCls}>Notes</label>
                            <textarea value={c.notes} onChange={(e) => setField(c.id, { notes: e.target.value })} className={textareaCls} rows={4} placeholder="Notes about this contact..." />
                            <label className={labelCls}>Tags (comma-separated)</label>
                            <input value={c.tags.join(', ')} onChange={(e) => setField(c.id, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} className={lineInputCls} placeholder="vip, priority, follow-up..." />
                          </div>
                          <div className="flex items-end justify-end pt-2 lg:col-span-3">
                            <Button variant="destructive" size="sm" onClick={() => deleteContact(c.id)}>
                              <Trash2 /> Delete contact
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <EmptyState
              message={contacts.length === 0 ? 'No contacts yet.' : 'No contacts match.'}
              hint={contacts.length === 0 ? 'Press Add to create one.' : 'Try clearing a filter.'}
            />
          )}
        </div>
      </WidgetCard>
    </PageShell>
  )
}
