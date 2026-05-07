import { useState, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
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

const statusConfig: Record<CrmContact['status'], { label: string; color: string }> = {
  lead: { label: 'Lead', color: 'bg-yellow-500/15 text-yellow-400' },
  prospect: { label: 'Prospect', color: 'bg-blue-500/15 text-blue-400' },
  active: { label: 'Active', color: 'bg-green-500/15 text-green-400' },
  churned: { label: 'Churned', color: 'bg-red-500/15 text-red-400' },
  paused: { label: 'Paused', color: 'bg-secondary text-muted-foreground' },
}

const ALL_STATUSES: CrmContact['status'][] = ['lead', 'prospect', 'active', 'churned', 'paused']

type SortKey = 'name' | 'company' | 'value' | 'status' | 'lastContact'

function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '' }
function fmtMoney(n: number) { return n > 0 ? `$${n.toLocaleString('en-US')}` : '' }

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
    let list = contacts.filter((c) =>
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
      <div className="flex items-center gap-2 flex-wrap">
        {data.orgs.map((org) => (
          <button
            key={org.id}
            onClick={() => setActiveOrg(org.id)}
            className={`cursor-pointer flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs md:text-sm font-medium transition-all ${
              data.activeOrg === org.id
                ? 'bg-foreground text-background'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            {org.name}
            <span className="text-[10px] opacity-60">{org.contacts.length}</span>
          </button>
        ))}
        {showNewOrg ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addOrg()}
              placeholder="Org name..."
              className="h-8 w-32 text-xs"
              autoFocus
            />
            <button onClick={addOrg} className="cursor-pointer text-xs text-foreground bg-foreground/10 px-2 py-1 rounded hover:bg-foreground/20 transition-colors">Add</button>
            <button onClick={() => { setShowNewOrg(false); setNewOrgName('') }} className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewOrg(true)}
            className="cursor-pointer flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground/40 border border-dashed border-border hover:text-muted-foreground hover:border-muted-foreground/30 transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> New org
          </button>
        )}
        {/* Delete current org */}
        {data.orgs.length > 1 && (
          <button
            onClick={() => deleteOrg(data.activeOrg)}
            className="cursor-pointer ml-auto text-[10px] text-muted-foreground/30 hover:text-red-400 transition-colors"
            title="Delete this org"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="liquid-glass flex items-center gap-3 rounded-xl px-4 py-3">
          <Users className="h-5 w-5 text-blue-400" />
          <div>
            <p className="text-lg font-bold tabular-nums">{contacts.length}</p>
            <p className="text-[10px] text-muted-foreground">Total contacts</p>
          </div>
        </div>
        <div className="liquid-glass flex items-center gap-3 rounded-xl px-4 py-3">
          <DollarSign className="h-5 w-5 text-green-400" />
          <div>
            <p className="text-lg font-bold tabular-nums">{fmtMoney(totalValue) || '$0'}</p>
            <p className="text-[10px] text-muted-foreground">Active value</p>
          </div>
        </div>
        {(['active', 'lead'] as const).map((s) => (
          <div key={s} className="liquid-glass flex items-center gap-3 rounded-xl px-4 py-3">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${statusConfig[s].color}`}>
              {statusCounts[s] || 0}
            </span>
            <div>
              <p className="text-lg font-bold tabular-nums">{statusCounts[s] || 0}</p>
              <p className="text-[10px] text-muted-foreground">{statusConfig[s].label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filters + Add */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {ALL_STATUSES.map((s) => (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? null : s)}
              className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${statusFilter === s ? `${statusConfig[s].color} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
              {statusConfig[s].label}
            </button>
          ))}
        </div>
        <button onClick={addContact} className="cursor-pointer ml-auto flex items-center gap-1 text-xs text-foreground bg-foreground/10 px-3 py-1.5 rounded-lg hover:bg-foreground/20 transition-colors">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {/* Mobile: Contact cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {contacts.length === 0 ? 'No contacts yet. Click Add to create one.' : 'No contacts match your filters.'}
          </p>
        ) : filtered.map((c) => (
          <div key={c.id} className="liquid-glass rounded-xl border border-border p-4">
            <div className="flex items-start justify-between" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground truncate">{[c.company, c.role].filter(Boolean).join(' · ') || 'No company'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${statusConfig[c.status].color}`}>{statusConfig[c.status].label}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {c.value > 0 && <span className="tabular-nums">{fmtMoney(c.value)}</span>}
              {c.lastContact && <span>{fmtDate(c.lastContact)}</span>}
              {c.tags.length > 0 && <span className="truncate">{c.tags.join(', ')}</span>}
            </div>
            {expanded === c.id && (
              <div className="mt-4 pt-3 border-t border-border/30 flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-muted-foreground">Name</label>
                  <input value={c.name} onChange={(e) => setField(c.id, { name: e.target.value })} className="bg-transparent outline-none text-sm font-semibold border-b border-border/30 pb-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] text-muted-foreground">Company</label><input value={c.company} onChange={(e) => setField(c.id, { company: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                  <div><label className="text-[10px] text-muted-foreground">Role</label><input value={c.role} onChange={(e) => setField(c.id, { role: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                </div>
                <div><label className="text-[10px] text-muted-foreground">Status</label>
                  <select value={c.status} onChange={(e) => setField(c.id, { status: e.target.value as CrmContact['status'] })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">
                    {ALL_STATUSES.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.phone} onChange={(e) => setField(c.id, { phone: e.target.value })} placeholder="Phone" className="bg-transparent outline-none text-xs flex-1 border-b border-border/30 py-1 placeholder:text-muted-foreground/30" /></div>
                <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.email} onChange={(e) => setField(c.id, { email: e.target.value })} placeholder="Email" className="bg-transparent outline-none text-xs flex-1 border-b border-border/30 py-1 placeholder:text-muted-foreground/30" /></div>
                <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.website} onChange={(e) => setField(c.id, { website: e.target.value })} placeholder="Website" className="bg-transparent outline-none text-xs flex-1 border-b border-border/30 py-1 placeholder:text-muted-foreground/30" /></div>
                <div className="flex items-center gap-2"><DollarSign className="h-3.5 w-3.5 text-muted-foreground" /><input type="number" value={c.value || ''} onChange={(e) => setField(c.id, { value: parseInt(e.target.value) || 0 })} placeholder="Deal value" className="bg-transparent outline-none text-xs flex-1 border-b border-border/30 py-1 placeholder:text-muted-foreground/30 tabular-nums" /></div>
                <div><label className="text-[10px] text-muted-foreground">Last Contact</label><input type="date" value={c.lastContact} onChange={(e) => setField(c.id, { lastContact: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 cursor-pointer" /></div>
                <div><label className="text-[10px] text-muted-foreground">Notes</label>
                  <textarea value={c.notes} onChange={(e) => setField(c.id, { notes: e.target.value })} className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none" rows={3} placeholder="Notes..." />
                </div>
                <div><label className="text-[10px] text-muted-foreground">Tags (comma-separated)</label>
                  <input value={c.tags.join(', ')} onChange={(e) => setField(c.id, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" placeholder="vip, priority..." />
                </div>
                <button onClick={() => deleteContact(c.id)} className="cursor-pointer flex items-center justify-center gap-1.5 text-xs text-red-400/60 active:text-red-400 px-3 py-2.5 rounded-lg border border-red-400/20">
                  <Trash2 className="h-3 w-3" /> Delete contact
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: Table */}
      <WidgetCard title={activeOrg?.name || 'CRM'} description={`${filtered.length} contacts`} delay={0.1} className="hidden md:block">
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-5 py-2 text-left font-medium min-w-[160px]">
                  <button onClick={() => toggleSort('name')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Name <SortIcon k="name" /></button>
                </th>
                <th className="py-2 text-left font-medium min-w-[120px]">
                  <button onClick={() => toggleSort('company')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Company <SortIcon k="company" /></button>
                </th>
                <th className="py-2 text-left font-medium">Role</th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('status')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Status <SortIcon k="status" /></button>
                </th>
                <th className="py-2 text-right font-medium">
                  <button onClick={() => toggleSort('value')} className="cursor-pointer flex items-center gap-1 ml-auto hover:text-foreground">Value <SortIcon k="value" /></button>
                </th>
                <th className="py-2 text-right font-medium">
                  <button onClick={() => toggleSort('lastContact')} className="cursor-pointer flex items-center gap-1 ml-auto hover:text-foreground">Last <SortIcon k="lastContact" /></button>
                </th>
                <th className="py-2 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <>
                  <tr key={c.id} onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    className={`cursor-pointer border-b border-border/20 transition-colors hover:bg-secondary/30 group ${expanded === c.id ? 'bg-secondary/20' : ''}`}>
                    <td className="px-5 py-2.5"><span className="font-medium">{c.name}</span></td>
                    <td className="py-2.5 text-muted-foreground">{c.company || '—'}</td>
                    <td className="py-2.5 text-muted-foreground">{c.role || '—'}</td>
                    <td className="py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full ${statusConfig[c.status].color}`}>{statusConfig[c.status].label}</span></td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{fmtMoney(c.value) || '—'}</td>
                    <td className="py-2.5 text-right text-muted-foreground">{c.lastContact ? fmtDate(c.lastContact) : '—'}</td>
                    <td className="py-2.5 pr-4">
                      <button onClick={(e) => { e.stopPropagation(); deleteContact(c.id) }} className="cursor-pointer opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400 transition-all">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr key={`${c.id}-edit`}>
                      <td colSpan={7} className="px-5 py-4 border-b border-border/20 bg-foreground/[0.02]">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                          <div className="flex flex-col gap-2">
                            <label className="text-[10px] text-muted-foreground">Name</label>
                            <input value={c.name} onChange={(e) => setField(c.id, { name: e.target.value })} className="bg-transparent outline-none text-sm font-semibold border-b border-border/30 pb-1" />
                            <div className="grid grid-cols-2 gap-2">
                              <div><label className="text-[10px] text-muted-foreground">Company</label><input value={c.company} onChange={(e) => setField(c.id, { company: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                              <div><label className="text-[10px] text-muted-foreground">Role</label><input value={c.role} onChange={(e) => setField(c.id, { role: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                            </div>
                            <div><label className="text-[10px] text-muted-foreground">Status</label>
                              <select value={c.status} onChange={(e) => setField(c.id, { status: e.target.value as CrmContact['status'] })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">
                                {ALL_STATUSES.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.phone} onChange={(e) => setField(c.id, { phone: e.target.value })} placeholder="Phone" className="bg-transparent outline-none text-xs flex-1 border-b border-border/30 py-1 placeholder:text-muted-foreground/30" /></div>
                            <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.email} onChange={(e) => setField(c.id, { email: e.target.value })} placeholder="Email" className="bg-transparent outline-none text-xs flex-1 border-b border-border/30 py-1 placeholder:text-muted-foreground/30" /></div>
                            <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.website} onChange={(e) => setField(c.id, { website: e.target.value })} placeholder="Website" className="bg-transparent outline-none text-xs flex-1 border-b border-border/30 py-1 placeholder:text-muted-foreground/30" /></div>
                            <div className="flex items-center gap-2"><DollarSign className="h-3.5 w-3.5 text-muted-foreground" /><input type="number" value={c.value || ''} onChange={(e) => setField(c.id, { value: parseInt(e.target.value) || 0 })} placeholder="Deal value" className="bg-transparent outline-none text-xs flex-1 border-b border-border/30 py-1 placeholder:text-muted-foreground/30 tabular-nums" /></div>
                            <div><label className="text-[10px] text-muted-foreground">Last Contact</label><input type="date" value={c.lastContact} onChange={(e) => setField(c.id, { lastContact: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 cursor-pointer" /></div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-[10px] text-muted-foreground">Notes</label>
                            <textarea value={c.notes} onChange={(e) => setField(c.id, { notes: e.target.value })} className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none" rows={4} placeholder="Notes about this contact..." />
                            <label className="text-[10px] text-muted-foreground">Tags (comma-separated)</label>
                            <input value={c.tags.join(', ')} onChange={(e) => setField(c.id, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" placeholder="vip, priority, follow-up..." />
                          </div>
                          <div className="flex items-end justify-end lg:col-span-3 pt-2">
                            <button onClick={() => deleteContact(c.id)} className="cursor-pointer flex items-center gap-1.5 text-xs text-red-400/60 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-red-400/20 hover:border-red-400/40 hover:bg-red-400/5">
                              <Trash2 className="h-3 w-3" /> Delete contact
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {contacts.length === 0 ? 'No contacts yet. Click Add to create one.' : 'No contacts match your filters.'}
            </p>
          )}
        </div>
      </WidgetCard>
    </PageShell>
  )
}
