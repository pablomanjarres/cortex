import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import {
  Phone,
  Mail,
  Search,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Cake,
  Clock,
  RotateCcw,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'title' | 'birthday' | 'lastContact'

interface Contact {
  id: string
  name: string
  title: string
  nickname: string
  categories: string[]
  fields: string[]
  followUp: boolean
  birthday: string
  phone: string
  lastContact: string
  interval: number
  email: string
  socialProfiles: string
  address: string
}

// ── Data ─────────────────────────────────────────────────────────────────────

const DEFAULT_CONTACTS: Contact[] = []

import { useStore } from '@/lib/store'
import { syncBirthdayToCalendar } from '@/lib/calendar-sync'

// ── Helpers ──────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = ['Relative 👨‍👩‍👦', 'High Potential 🚀', 'Ally 🤝', 'Connector 🧠', 'Friend 😊', 'Acquaintance 👋', 'Routine Contact 🧺', 'Dormant 💤', 'Positive Rival 🥊', 'Mentor 🧓', 'Close Friend 🫂']

const ALL_FIELDS = ['Tech', 'Business', 'Education', 'Health', 'Design', 'Law', 'Gastronomy', 'Music', 'Industry', 'Media', 'Construction', 'Fin']

function daysUntilBirthday(bday: string): number | null {
  if (!bday) return null
  const today = new Date()
  const birth = new Date(bday)
  const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
  if (next < today) next.setFullYear(next.getFullYear() + 1)
  return Math.ceil((next.getTime() - today.getTime()) / 86_400_000)
}

function calcAge(bday: string): number | null {
  if (!bday) return null
  const today = new Date()
  const birth = new Date(bday)
  let age = today.getFullYear() - birth.getFullYear()
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--
  return age
}

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Shared token styles: native <select>-free page, but the same quiet
// inline-edit patterns as the rest of the app.
const lineInputCls = 'w-full border-b border-border/60 bg-transparent py-1 text-xs outline-none placeholder:text-foreground-faint'
const labelCls = 'text-2xs text-muted-foreground'
const thCls = 'py-2 text-left font-mono text-2xs font-normal uppercase tracking-wider'
const thBtnCls = 'flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground'

// ── Component ────────────────────────────────────────────────────────────────

export function SocialPage() {
  const [contacts, updateContacts] = useStore<Contact[]>('cortex-contacts', DEFAULT_CONTACTS)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  // Scroll to expanded contact row when selected from widgets
  useEffect(() => {
    if (expanded && rowRefs.current[expanded]) {
      rowRefs.current[expanded]!.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [expanded])

  // Calendar sync: push inline birthday/name edits
  const prevContactsRef = useRef<Contact[] | null>(null)
  useEffect(() => {
    const prev = prevContactsRef.current
    if (prev) {
      for (const c of contacts) {
        const old = prev.find((p) => p.id === c.id)
        if (!old) continue
        if (old.birthday !== c.birthday || old.name !== c.name) {
          syncBirthdayToCalendar(c, 'upsert')
        }
      }
    }
    prevContactsRef.current = contacts
  }, [contacts])

  const update = updateContacts

  const setField = (id: string, f: Partial<Contact>) => {
    update((p) => p.map((c) => c.id === id ? { ...c, ...f } : c))
  }
  const deleteContact = (id: string) => {
    const c = contacts.find((x) => x.id === id)
    if (c) syncBirthdayToCalendar(c, 'delete')
    update((p) => p.filter((x) => x.id !== id))
    if (expanded === id) setExpanded(null)
  }
  const addContact = () => {
    const c: Contact = { id: `c-${Date.now()}`, name: 'New Contact', title: '', nickname: '', categories: [], fields: [], followUp: false, birthday: '', phone: '', lastContact: '', interval: 0, email: '', socialProfiles: '', address: '' }
    update((p) => [c, ...p]); setExpanded(c.id)
  }

  const toggleSort = (k: SortKey) => { if (sortKey === k) setSortAsc((p) => !p); else { setSortKey(k); setSortAsc(true) } }
  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />

  const filtered = useMemo(() =>
    contacts
      .filter((c) => !filterCat || c.categories.includes(filterCat))
      .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.title.toLowerCase().includes(search.toLowerCase()) || c.address.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        let v = 0
        switch (sortKey) {
          case 'name': v = a.name.localeCompare(b.name); break
          case 'title': v = a.title.localeCompare(b.title); break
          case 'birthday': v = (a.birthday || '9999').localeCompare(b.birthday || '9999'); break
          case 'lastContact': v = (b.lastContact || '0000').localeCompare(a.lastContact || '0000'); break
        }
        return sortAsc ? v : -v
      }),
    [contacts, filterCat, search, sortKey, sortAsc],
  )

  const upcomingBdays = useMemo(() =>
    contacts
      .filter((c) => c.birthday && daysUntilBirthday(c.birthday)! <= 30)
      .sort((a, b) => daysUntilBirthday(a.birthday)! - daysUntilBirthday(b.birthday)!),
    [contacts],
  )

  const needsReachOut = useMemo(() =>
    contacts.filter((c) => {
      if (!c.lastContact || !c.interval) return false
      const last = new Date(c.lastContact)
      const daysSince = Math.ceil((Date.now() - last.getTime()) / 86_400_000)
      return daysSince > c.interval
    }).sort((a, b) => {
      const da = Math.ceil((Date.now() - new Date(a.lastContact).getTime()) / 86_400_000) - a.interval
      const db = Math.ceil((Date.now() - new Date(b.lastContact).getTime()) / 86_400_000) - b.interval
      return db - da
    }),
    [contacts],
  )

  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Upcoming Birthdays */}
        <WidgetCard title="Upcoming Birthdays" description={`${upcomingBdays.length} in 30 days`} delay={0}>
          {upcomingBdays.length === 0 ? (
            <EmptyState className="py-4" message="No birthdays soon." />
          ) : (
            <div className="flex flex-col gap-1">
              {upcomingBdays.map((c) => {
                const days = daysUntilBirthday(c.birthday)!
                const age = calcAge(c.birthday)
                const imminent = days <= 3
                return (
                  <button key={c.id} onClick={() => setExpanded(expanded === c.id ? null : c.id)} className={`flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150 ${imminent ? 'bg-warning/5 hover:bg-warning/10' : 'hover:bg-secondary/50'} ${expanded === c.id ? 'ring-1 ring-accent/40' : ''}`}>
                    <Cake className={`h-3.5 w-3.5 shrink-0 ${imminent ? 'text-warning' : 'text-muted-foreground'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-2xs text-muted-foreground">{c.title}{age !== null ? ` · turns ${age + 1}` : ''}</p>
                    </div>
                    <Chip size="sm" variant={imminent ? 'warning' : 'neutral'} className="tabular-nums">
                      {days === 0 ? 'Today' : `${days}d`}
                    </Chip>
                  </button>
                )
              })}
            </div>
          )}
        </WidgetCard>

        {/* Reach Out */}
        <WidgetCard title="Reach Out" description={`${needsReachOut.length} overdue`} delay={0.05} className="lg:col-span-2">
          {needsReachOut.length === 0 ? (
            <EmptyState className="py-4" message="All caught up." />
          ) : (
            <div className="flex max-h-[200px] flex-col gap-1 overflow-y-auto">
              {needsReachOut.map((c) => {
                const daysSince = Math.ceil((Date.now() - new Date(c.lastContact).getTime()) / 86_400_000)
                const overdue = daysSince - c.interval
                return (
                  <div key={c.id} className={`flex items-center gap-3 rounded-md px-3 py-2 transition-colors duration-150 hover:bg-secondary/50 ${expanded === c.id ? 'ring-1 ring-accent/40' : ''}`}>
                    <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-warning" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-2xs text-muted-foreground">{c.title} · last: <span className="font-mono">{fmtDate(c.lastContact)}</span></p>
                      </div>
                      <Chip size="sm" variant="warning" className="tabular-nums">{overdue}d overdue</Chip>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Reset last contact"
                      title="Reset last contact"
                      onClick={(e) => { e.stopPropagation(); setField(c.id, { lastContact: '' }) }}
                    >
                      <RotateCcw />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </WidgetCard>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." className="h-8 pl-8 text-xs" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_CATEGORIES.slice(0, 8).map((cat) => (
            <Chip key={cat} selectable selected={filterCat === cat} onClick={() => setFilterCat(filterCat === cat ? null : cat)}>
              {cat}
            </Chip>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={addContact}>
          <Plus /> Add
        </Button>
      </div>

      {/* Mobile: Contact cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {filtered.map((c) => (
          <div key={c.id} className="surface rounded-xl p-4" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}{c.nickname ? <span className="ml-1 text-2xs text-muted-foreground">({c.nickname})</span> : null}</p>
                <p className="truncate text-xs text-muted-foreground">{c.title || 'No title'}</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Delete contact" className="shrink-0 active:text-destructive" onClick={(e) => { e.stopPropagation(); deleteContact(c.id) }}>
                <Trash2 />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {c.categories.map((cat) => <Chip key={cat} size="sm">{cat}</Chip>)}
              {c.fields.map((f) => <Chip key={f} size="sm">{f}</Chip>)}
            </div>
            <div className="mt-2 flex items-center gap-3 font-mono text-2xs text-muted-foreground">
              {c.phone && <span>{c.phone}</span>}
              {calcAge(c.birthday) != null && <span className="tabular-nums">Age {calcAge(c.birthday)}</span>}
              {c.lastContact && <span>{fmtDate(c.lastContact)}</span>}
            </div>
            {expanded === c.id && (
              <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-3" onClick={(e) => e.stopPropagation()}>
                <div><label className={labelCls}>Name</label><input value={c.name} onChange={(e) => setField(c.id, { name: e.target.value })} className={`${lineInputCls} pb-1 text-sm font-semibold`} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>Title</label><input value={c.title} onChange={(e) => setField(c.id, { title: e.target.value })} className={lineInputCls} /></div>
                  <div><label className={labelCls}>Nickname</label><input value={c.nickname} onChange={(e) => setField(c.id, { nickname: e.target.value })} className={lineInputCls} /></div>
                  <div><label className={labelCls}>Birthday</label><input type="date" value={c.birthday} onChange={(e) => setField(c.id, { birthday: e.target.value })} className={`${lineInputCls} cursor-pointer font-mono`} /></div>
                  <div><label className={labelCls}>Interval (days)</label><input type="number" value={c.interval || ''} onChange={(e) => setField(c.id, { interval: parseInt(e.target.value) || 0 })} className={`${lineInputCls} font-mono tabular-nums`} /></div>
                </div>
                <div><label className={labelCls}>Address</label><input value={c.address} onChange={(e) => setField(c.id, { address: e.target.value })} className={lineInputCls} /></div>
                <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.phone} onChange={(e) => setField(c.id, { phone: e.target.value })} placeholder="Phone" className={`${lineInputCls} flex-1 font-mono`} /></div>
                <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.email} onChange={(e) => setField(c.id, { email: e.target.value })} placeholder="Email" className={`${lineInputCls} flex-1`} /></div>
                <div><label className={labelCls}>Social Profiles</label><input value={c.socialProfiles} onChange={(e) => setField(c.id, { socialProfiles: e.target.value })} className={lineInputCls} /></div>
                <div><label className={labelCls}>Last Contact</label><input type="date" value={c.lastContact} onChange={(e) => setField(c.id, { lastContact: e.target.value })} className={`${lineInputCls} cursor-pointer font-mono`} /></div>
                <label className={labelCls}>Categories</label>
                <div className="flex flex-wrap gap-1">
                  {ALL_CATEGORIES.map((cat) => {
                    const on = c.categories.includes(cat)
                    return <Chip key={cat} size="sm" selectable selected={on} onClick={() => setField(c.id, { categories: on ? c.categories.filter((x) => x !== cat) : [...c.categories, cat] })}>{cat}</Chip>
                  })}
                </div>
                <label className={labelCls}>Fields</label>
                <div className="flex flex-wrap gap-1">
                  {ALL_FIELDS.map((f) => {
                    const on = c.fields.includes(f)
                    return <Chip key={f} size="sm" selectable selected={on} onClick={() => setField(c.id, { fields: on ? c.fields.filter((x) => x !== f) : [...c.fields, f] })}>{f}</Chip>
                  })}
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
      <WidgetCard title="Contacts" description={`${filtered.length} of ${contacts.length}`} delay={0.1} className="hidden md:block">
        {filtered.length === 0 ? (
          <EmptyState message="No one here yet." hint="Press Add to keep your first contact." />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  {/* Sort headers: compact table-header toggles (focus ring from the global rule). */}
                  <th className={`${thCls} px-4`}><button onClick={() => toggleSort('name')} className={thBtnCls}>Name <SortIcon k="name" /></button></th>
                  <th className={thCls}><button onClick={() => toggleSort('title')} className={thBtnCls}>Title <SortIcon k="title" /></button></th>
                  <th className={thCls}>Category</th>
                  <th className={thCls}>Field</th>
                  <th className={thCls}><button onClick={() => toggleSort('birthday')} className={thBtnCls}>Age <SortIcon k="birthday" /></button></th>
                  <th className={thCls}>Phone</th>
                  <th className={thCls}><button onClick={() => toggleSort('lastContact')} className={thBtnCls}>Last <SortIcon k="lastContact" /></button></th>
                  <th className="w-6 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <Fragment key={c.id}>
                    <tr ref={(el) => { rowRefs.current[c.id] = el }} onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                      className={`group cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary/30 ${expanded === c.id ? 'bg-secondary/20' : ''}`}>
                      <td className="px-4 py-2.5"><span className="font-medium">{c.name}</span>{c.nickname && <span className="ml-1.5 text-2xs text-muted-foreground">({c.nickname})</span>}</td>
                      <td className="py-2.5 text-muted-foreground">{c.title}</td>
                      <td className="py-2.5"><div className="flex flex-wrap gap-1">{c.categories.slice(0, 2).map((cat) => <Chip key={cat} size="sm">{cat}</Chip>)}{c.categories.length > 2 && <span className="font-mono text-3xs text-foreground-faint">+{c.categories.length - 2}</span>}</div></td>
                      <td className="py-2.5"><div className="flex flex-wrap gap-1">{c.fields.map((f) => <Chip key={f} size="sm">{f}</Chip>)}</div></td>
                      <td className="py-2.5 font-mono tabular-nums text-muted-foreground">{calcAge(c.birthday) ?? '—'}</td>
                      <td className="py-2.5 font-mono text-muted-foreground">{c.phone || '—'}</td>
                      <td className="py-2.5 font-mono tabular-nums text-muted-foreground">{c.lastContact ? fmtDate(c.lastContact) : '—'}</td>
                      <td className="py-2.5 pr-4"><Button variant="ghost" size="icon-xs" aria-label="Delete contact" className="opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteContact(c.id) }}><Trash2 /></Button></td>
                    </tr>
                    {expanded === c.id && (
                      <tr>
                        <td colSpan={8} className="border-b border-border/60 bg-secondary/10 px-4 py-4">
                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                            <div className="flex flex-col gap-2">
                              <label className={labelCls}>Name</label>
                              <input value={c.name} onChange={(e) => setField(c.id, { name: e.target.value })} className={`${lineInputCls} pb-1 text-sm font-semibold`} />
                              <div className="grid grid-cols-2 gap-2">
                                <div><label className={labelCls}>Title</label><input value={c.title} onChange={(e) => setField(c.id, { title: e.target.value })} className={lineInputCls} /></div>
                                <div><label className={labelCls}>Nickname</label><input value={c.nickname} onChange={(e) => setField(c.id, { nickname: e.target.value })} className={lineInputCls} /></div>
                                <div><label className={labelCls}>Birthday</label><input type="date" value={c.birthday} onChange={(e) => setField(c.id, { birthday: e.target.value })} className={`${lineInputCls} cursor-pointer font-mono`} /></div>
                                <div><label className={labelCls}>Interval (days)</label><input type="number" value={c.interval || ''} onChange={(e) => setField(c.id, { interval: parseInt(e.target.value) || 0 })} className={`${lineInputCls} font-mono tabular-nums`} /></div>
                              </div>
                              <div><label className={labelCls}>Address</label><input value={c.address} onChange={(e) => setField(c.id, { address: e.target.value })} className={lineInputCls} /></div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.phone} onChange={(e) => setField(c.id, { phone: e.target.value })} placeholder="Phone" className={`${lineInputCls} flex-1 font-mono`} /></div>
                              <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.email} onChange={(e) => setField(c.id, { email: e.target.value })} placeholder="Email" className={`${lineInputCls} flex-1`} /></div>
                              <div><label className={labelCls}>Social Profiles</label><input value={c.socialProfiles} onChange={(e) => setField(c.id, { socialProfiles: e.target.value })} className={lineInputCls} /></div>
                              <div><label className={labelCls}>Last Contact</label><input type="date" value={c.lastContact} onChange={(e) => setField(c.id, { lastContact: e.target.value })} className={`${lineInputCls} cursor-pointer font-mono`} /></div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className={labelCls}>Categories</label>
                              <div className="flex flex-wrap gap-1">
                                {ALL_CATEGORIES.map((cat) => { const on = c.categories.includes(cat); return <Chip key={cat} size="sm" selectable selected={on} onClick={() => setField(c.id, { categories: on ? c.categories.filter((x) => x !== cat) : [...c.categories, cat] })}>{cat}</Chip> })}
                              </div>
                              <label className={`${labelCls} mt-1`}>Fields</label>
                              <div className="flex flex-wrap gap-1">
                                {ALL_FIELDS.map((f) => { const on = c.fields.includes(f); return <Chip key={f} size="sm" selectable selected={on} onClick={() => setField(c.id, { fields: on ? c.fields.filter((x) => x !== f) : [...c.fields, f] })}>{f}</Chip> })}
                              </div>
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
          </div>
        )}
      </WidgetCard>
    </PageShell>
  )
}
