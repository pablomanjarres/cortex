import { useState, useMemo, useEffect, useRef } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Badge } from '@/components/ui/badge'
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

const catColor: Record<string, string> = {
  'Relative 👨‍👩‍👦': 'bg-yellow-500/15 text-yellow-400',
  'High Potential 🚀': 'bg-gray-500/15 text-gray-300',
  'Ally 🤝': 'bg-purple-500/15 text-purple-400',
  'Connector 🧠': 'bg-orange-500/15 text-orange-400',
  'Friend 😊': 'bg-purple-500/15 text-purple-400',
  'Acquaintance 👋': 'bg-red-500/15 text-red-400',
  'Routine Contact 🧺': 'bg-gray-500/15 text-gray-400',
  'Dormant 💤': 'bg-amber-900/15 text-amber-600',
  'Positive Rival 🥊': 'bg-pink-500/15 text-pink-400',
  'Mentor 🧓': 'bg-blue-500/15 text-blue-400',
  'Close Friend 🫂': 'bg-purple-500/15 text-purple-400',
}

const fieldColor: Record<string, string> = {
  Tech: 'bg-orange-500/15 text-orange-400', Business: 'bg-gray-500/15 text-gray-400', Education: 'bg-amber-700/15 text-amber-500',
  Health: 'bg-purple-500/15 text-purple-400', Design: 'bg-red-500/15 text-red-400', Law: 'bg-gray-500/15 text-gray-300',
  Gastronomy: 'bg-green-500/15 text-green-400', Music: 'bg-blue-500/15 text-blue-400', Industry: 'bg-pink-500/15 text-pink-400',
  Media: 'bg-yellow-500/15 text-yellow-400', Construction: 'bg-yellow-500/15 text-yellow-400', Fin: 'bg-yellow-500/15 text-yellow-400',
}

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
            <p className="text-xs text-muted-foreground py-3 text-center">No birthdays soon</p>
          ) : (
            <div className="flex flex-col gap-1">
              {upcomingBdays.map((c) => {
                const days = daysUntilBirthday(c.birthday)!
                const age = calcAge(c.birthday)
                return (
                  <button key={c.id} onClick={() => setExpanded(expanded === c.id ? null : c.id)} className={`cursor-pointer w-full text-left flex items-center gap-3 rounded-lg px-3 py-2 ${days <= 3 ? 'bg-pink-500/[0.05]' : 'hover:bg-secondary/50'} ${expanded === c.id ? 'ring-1 ring-foreground/20' : ''} transition-all`}>
                    <Cake className={`h-3.5 w-3.5 shrink-0 ${days <= 3 ? 'text-pink-400' : 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.title}{age !== null ? ` · turns ${age + 1}` : ''}</p>
                    </div>
                    <Badge variant="secondary" className={`text-[10px] tabular-nums ${days <= 3 ? 'text-pink-400' : ''}`}>
                      {days === 0 ? 'Today!' : `${days}d`}
                    </Badge>
                  </button>
                )
              })}
            </div>
          )}
        </WidgetCard>

        {/* Reach Out */}
        <WidgetCard title="Reach Out" description={`${needsReachOut.length} overdue`} delay={0.05} className="lg:col-span-2">
          {needsReachOut.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">All caught up</p>
          ) : (
            <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
              {needsReachOut.map((c) => {
                const daysSince = Math.ceil((Date.now() - new Date(c.lastContact).getTime()) / 86_400_000)
                const overdue = daysSince - c.interval
                return (
                  <div key={c.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-secondary/50 ${expanded === c.id ? 'ring-1 ring-foreground/20' : ''} transition-all`}>
                    <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="cursor-pointer flex items-center gap-3 flex-1 min-w-0 text-left">
                      <Clock className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.title} · last: {fmtDate(c.lastContact)}</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] tabular-nums text-orange-400">{overdue}d overdue</Badge>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setField(c.id, { lastContact: '' }) }}
                      title="Reset last contact"
                      className="cursor-pointer shrink-0 text-muted-foreground/30 hover:text-foreground transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </WidgetCard>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-lg border border-border px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." className="bg-transparent outline-none text-xs flex-1 placeholder:text-muted-foreground/40" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {ALL_CATEGORIES.slice(0, 8).map((cat) => (
            <button key={cat} onClick={() => setFilterCat(filterCat === cat ? null : cat)}
              className={`cursor-pointer text-[10px] px-2 py-1 rounded-full border transition-all ${filterCat === cat ? `${catColor[cat]} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
              {cat}
            </button>
          ))}
        </div>
        <button onClick={addContact} className="cursor-pointer flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-lg border border-border hover:bg-secondary transition-all">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {/* Mobile: Contact cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {filtered.map((c) => (
          <div key={c.id} className="liquid-glass rounded-xl border border-border p-4" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.name}{c.nickname ? <span className="ml-1 text-[10px] text-muted-foreground">({c.nickname})</span> : null}</p>
                <p className="text-xs text-muted-foreground truncate">{c.title || 'No title'}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteContact(c.id) }} className="cursor-pointer p-1.5 text-muted-foreground/40 active:text-red-400 shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {c.categories.map((cat) => <Badge key={cat} className={`text-[8px] px-1.5 py-0 ${catColor[cat] ?? 'bg-secondary'}`}>{cat}</Badge>)}
              {c.fields.map((f) => <Badge key={f} className={`text-[8px] px-1.5 py-0 ${fieldColor[f] ?? 'bg-secondary'}`}>{f}</Badge>)}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
              {c.phone && <span>{c.phone}</span>}
              {calcAge(c.birthday) != null && <span>Age {calcAge(c.birthday)}</span>}
              {c.lastContact && <span>{fmtDate(c.lastContact)}</span>}
            </div>
            {expanded === c.id && (
              <div className="mt-4 pt-3 border-t border-border/30 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                <div><label className="text-[10px] text-muted-foreground">Name</label><input value={c.name} onChange={(e) => setField(c.id, { name: e.target.value })} className="w-full bg-transparent outline-none text-sm font-semibold border-b border-border/30 pb-1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] text-muted-foreground">Title</label><input value={c.title} onChange={(e) => setField(c.id, { title: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                  <div><label className="text-[10px] text-muted-foreground">Nickname</label><input value={c.nickname} onChange={(e) => setField(c.id, { nickname: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                  <div><label className="text-[10px] text-muted-foreground">Birthday</label><input type="date" value={c.birthday} onChange={(e) => setField(c.id, { birthday: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 cursor-pointer" /></div>
                  <div><label className="text-[10px] text-muted-foreground">Interval (days)</label><input type="number" value={c.interval || ''} onChange={(e) => setField(c.id, { interval: parseInt(e.target.value) || 0 })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 tabular-nums" /></div>
                </div>
                <div><label className="text-[10px] text-muted-foreground">Address</label><input value={c.address} onChange={(e) => setField(c.id, { address: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.phone} onChange={(e) => setField(c.id, { phone: e.target.value })} placeholder="Phone" className="bg-transparent outline-none text-xs flex-1 border-b border-border/30 py-1 placeholder:text-muted-foreground/30" /></div>
                <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.email} onChange={(e) => setField(c.id, { email: e.target.value })} placeholder="Email" className="bg-transparent outline-none text-xs flex-1 border-b border-border/30 py-1 placeholder:text-muted-foreground/30" /></div>
                <div><label className="text-[10px] text-muted-foreground">Social Profiles</label><input value={c.socialProfiles} onChange={(e) => setField(c.id, { socialProfiles: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                <div><label className="text-[10px] text-muted-foreground">Last Contact</label><input type="date" value={c.lastContact} onChange={(e) => setField(c.id, { lastContact: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 cursor-pointer" /></div>
                <label className="text-[10px] text-muted-foreground">Categories</label>
                <div className="flex flex-wrap gap-1">
                  {ALL_CATEGORIES.map((cat) => {
                    const on = c.categories.includes(cat)
                    return <button key={cat} onClick={() => setField(c.id, { categories: on ? c.categories.filter((x) => x !== cat) : [...c.categories, cat] })}
                      className={`cursor-pointer text-[9px] px-2 py-0.5 rounded-full border transition-all ${on ? `${catColor[cat]} border-current/20` : 'text-muted-foreground/30 border-border'}`}>{cat}</button>
                  })}
                </div>
                <label className="text-[10px] text-muted-foreground">Fields</label>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(fieldColor).map((f) => {
                    const on = c.fields.includes(f)
                    return <button key={f} onClick={() => setField(c.id, { fields: on ? c.fields.filter((x) => x !== f) : [...c.fields, f] })}
                      className={`cursor-pointer text-[9px] px-2 py-0.5 rounded-full border transition-all ${on ? `${fieldColor[f]} border-current/20` : 'text-muted-foreground/30 border-border'}`}>{f}</button>
                  })}
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
      <WidgetCard title="Contacts" description={`${filtered.length} of ${contacts.length}`} delay={0.1} className="hidden md:block">
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-5 py-2 text-left font-medium"><button onClick={() => toggleSort('name')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Name <SortIcon k="name" /></button></th>
                <th className="py-2 text-left font-medium"><button onClick={() => toggleSort('title')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Title <SortIcon k="title" /></button></th>
                <th className="py-2 text-left font-medium">Category</th>
                <th className="py-2 text-left font-medium">Field</th>
                <th className="py-2 text-center font-medium"><button onClick={() => toggleSort('birthday')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Age <SortIcon k="birthday" /></button></th>
                <th className="py-2 text-left font-medium">Phone</th>
                <th className="py-2 text-left font-medium"><button onClick={() => toggleSort('lastContact')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Last <SortIcon k="lastContact" /></button></th>
                <th className="py-2 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <>
                  <tr key={c.id} ref={(el) => { rowRefs.current[c.id] = el }} onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    className={`cursor-pointer border-b border-border/20 transition-colors hover:bg-secondary/30 group ${expanded === c.id ? 'bg-secondary/20' : ''}`}>
                    <td className="px-5 py-2.5"><span className="font-medium">{c.name}</span>{c.nickname && <span className="ml-1.5 text-[10px] text-muted-foreground">({c.nickname})</span>}</td>
                    <td className="py-2.5 text-muted-foreground">{c.title}</td>
                    <td className="py-2.5"><div className="flex gap-1 flex-wrap">{c.categories.slice(0, 2).map((cat) => <Badge key={cat} className={`text-[8px] px-1 py-0 ${catColor[cat] ?? 'bg-secondary'}`}>{cat}</Badge>)}{c.categories.length > 2 && <span className="text-[9px] text-muted-foreground">+{c.categories.length - 2}</span>}</div></td>
                    <td className="py-2.5"><div className="flex gap-1 flex-wrap">{c.fields.map((f) => <Badge key={f} className={`text-[8px] px-1 py-0 ${fieldColor[f] ?? 'bg-secondary'}`}>{f}</Badge>)}</div></td>
                    <td className="py-2.5 text-center tabular-nums text-muted-foreground">{calcAge(c.birthday) ?? '—'}</td>
                    <td className="py-2.5 text-muted-foreground">{c.phone || '—'}</td>
                    <td className="py-2.5 text-muted-foreground tabular-nums">{c.lastContact ? fmtDate(c.lastContact) : '—'}</td>
                    <td className="py-2.5 pr-4"><button onClick={(e) => { e.stopPropagation(); deleteContact(c.id) }} className="cursor-pointer opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400 transition-all"><Trash2 className="h-3 w-3" /></button></td>
                  </tr>
                  {expanded === c.id && (
                    <tr key={`${c.id}-edit`}>
                      <td colSpan={8} className="px-5 py-4 border-b border-border/20 bg-foreground/[0.02]">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                          <div className="flex flex-col gap-2">
                            <label className="text-[10px] text-muted-foreground">Name</label>
                            <input value={c.name} onChange={(e) => setField(c.id, { name: e.target.value })} className="bg-transparent outline-none text-sm font-semibold border-b border-border/30 pb-1" />
                            <div className="grid grid-cols-2 gap-2">
                              <div><label className="text-[10px] text-muted-foreground">Title</label><input value={c.title} onChange={(e) => setField(c.id, { title: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                              <div><label className="text-[10px] text-muted-foreground">Nickname</label><input value={c.nickname} onChange={(e) => setField(c.id, { nickname: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                              <div><label className="text-[10px] text-muted-foreground">Birthday</label><input type="date" value={c.birthday} onChange={(e) => setField(c.id, { birthday: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 cursor-pointer" /></div>
                              <div><label className="text-[10px] text-muted-foreground">Interval (days)</label><input type="number" value={c.interval || ''} onChange={(e) => setField(c.id, { interval: parseInt(e.target.value) || 0 })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 tabular-nums" /></div>
                            </div>
                            <div><label className="text-[10px] text-muted-foreground">Address</label><input value={c.address} onChange={(e) => setField(c.id, { address: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.phone} onChange={(e) => setField(c.id, { phone: e.target.value })} placeholder="Phone" className="bg-transparent outline-none text-xs flex-1 border-b border-border/30 py-1 placeholder:text-muted-foreground/30" /></div>
                            <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><input value={c.email} onChange={(e) => setField(c.id, { email: e.target.value })} placeholder="Email" className="bg-transparent outline-none text-xs flex-1 border-b border-border/30 py-1 placeholder:text-muted-foreground/30" /></div>
                            <div><label className="text-[10px] text-muted-foreground">Social Profiles</label><input value={c.socialProfiles} onChange={(e) => setField(c.id, { socialProfiles: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                            <div><label className="text-[10px] text-muted-foreground">Last Contact</label><input type="date" value={c.lastContact} onChange={(e) => setField(c.id, { lastContact: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 cursor-pointer" /></div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-[10px] text-muted-foreground">Categories</label>
                            <div className="flex flex-wrap gap-1">
                              {ALL_CATEGORIES.map((cat) => { const on = c.categories.includes(cat); return <button key={cat} onClick={() => setField(c.id, { categories: on ? c.categories.filter((x) => x !== cat) : [...c.categories, cat] })} className={`cursor-pointer text-[9px] px-2 py-0.5 rounded-full border transition-all ${on ? `${catColor[cat]} border-current/20` : 'text-muted-foreground/30 border-border'}`}>{cat}</button> })}
                            </div>
                            <label className="text-[10px] text-muted-foreground mt-1">Fields</label>
                            <div className="flex flex-wrap gap-1">
                              {Object.keys(fieldColor).map((f) => { const on = c.fields.includes(f); return <button key={f} onClick={() => setField(c.id, { fields: on ? c.fields.filter((x) => x !== f) : [...c.fields, f] })} className={`cursor-pointer text-[9px] px-2 py-0.5 rounded-full border transition-all ${on ? `${fieldColor[f]} border-current/20` : 'text-muted-foreground/30 border-border'}`}>{f}</button> })}
                            </div>
                          </div>
                          <div className="flex items-end justify-end lg:col-span-3 pt-2">
                            <button onClick={() => deleteContact(c.id)} className="cursor-pointer flex items-center gap-1.5 text-xs text-red-400/60 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-red-400/20 hover:border-red-400/40 hover:bg-red-400/5"><Trash2 className="h-3 w-3" /> Delete contact</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </WidgetCard>
    </PageShell>
  )
}
