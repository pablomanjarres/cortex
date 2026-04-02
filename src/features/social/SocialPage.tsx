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

const DEFAULT_CONTACTS: Contact[] = [
  { id: 'p1', name: 'Juan Esteban Mateus Salgar', title: 'Administrator', nickname: '', categories: ['Connector 🧠'], fields: ['Business'], followUp: false, birthday: '2002-09-10', phone: '+57 313 4011417', lastContact: '2025-04-15', interval: 15, email: '', socialProfiles: 'instagram.com/juan.mateus110', address: 'Villavicencio, Meta' },
  { id: 'p2', name: 'Juan Pablo Manjarres Morelo', title: 'Brother', nickname: '', categories: ['High Potential 🚀', 'Relative 👨‍👩‍👦'], fields: [], followUp: false, birthday: '2014-02-13', phone: '+57 305 2635346', lastContact: '', interval: 0, email: '', socialProfiles: '', address: 'San Bernardo Del Viento' },
  { id: 'p3', name: 'Melissa Rodriguez', title: 'Chef', nickname: '', categories: ['Dormant 💤'], fields: ['Gastronomy'], followUp: false, birthday: '', phone: '+57 315 0527546', lastContact: '2025-04-15', interval: 4, email: '', socialProfiles: 'instagram.com/melissarodriguez092', address: 'Aguachica' },
  { id: 'p4', name: 'David Quintero Liñan', title: 'Civil Engineering', nickname: '', categories: ['High Potential 🚀', 'Routine Contact 🧺'], fields: ['Business', 'Construction'], followUp: false, birthday: '2007-12-19', phone: '+57 321 7485541', lastContact: '2025-04-14', interval: 12, email: '', socialProfiles: '', address: 'Valledupar' },
  { id: 'p5', name: 'Carlos Antonio Gonzales', title: 'Doctor', nickname: '', categories: ['Ally 🤝', 'Positive Rival 🥊'], fields: ['Health'], followUp: false, birthday: '2007-01-20', phone: '+57 300 3295817', lastContact: '2025-04-14', interval: 7, email: '', socialProfiles: '', address: 'Cartagena, Bolivar' },
  { id: 'p6', name: 'Pablo Victorino Manjarres Zapata', title: 'Father', nickname: '', categories: ['Relative 👨‍👩‍👦'], fields: ['Education'], followUp: false, birthday: '1968-05-09', phone: '+57 313 5277261', lastContact: '', interval: 0, email: '', socialProfiles: '', address: 'San Bernardo Del Viento' },
  { id: 'p7', name: 'Angela Galvis', title: 'Finance', nickname: '', categories: ['Friend 😊'], fields: ['Fin'], followUp: false, birthday: '2005-02-07', phone: '', lastContact: '', interval: 0, email: '', socialProfiles: '', address: '' },
  { id: 'p8', name: 'Claudia Narvaez', title: 'Godmother', nickname: '', categories: ['Relative 👨‍👩‍👦'], fields: ['Education'], followUp: false, birthday: '1981-06-12', phone: '+57 314 5194883', lastContact: '2025-04-14', interval: 11, email: '', socialProfiles: '', address: 'San Bernardo Del Viento' },
  { id: 'p9', name: 'Abuela Marta', title: 'Grandma', nickname: '', categories: ['Relative 👨‍👩‍👦'], fields: [], followUp: false, birthday: '1954-01-16', phone: '', lastContact: '', interval: 0, email: '', socialProfiles: '', address: 'San Bernardo Del Viento' },
  { id: 'p10', name: 'Adelina Galvis', title: 'Grandma', nickname: '', categories: ['Relative 👨‍👩‍👦'], fields: [], followUp: false, birthday: '1945-02-09', phone: '', lastContact: '', interval: 0, email: '', socialProfiles: '', address: '' },
  { id: 'p11', name: 'Rodrigo Castillo', title: 'International Business', nickname: '', categories: ['Acquaintance 👋'], fields: ['Business'], followUp: false, birthday: '', phone: '+57 315 4191926', lastContact: '2025-07-12', interval: 8, email: '', socialProfiles: 'instagram.com/castillo_rodrigo19', address: 'San Bernardo Del Viento - Medellin' },
  { id: 'p12', name: 'Teki', title: 'Lawyer / Music Producer', nickname: '', categories: ['Acquaintance 👋'], fields: ['Music', 'Law'], followUp: false, birthday: '2009-05-14', phone: '', lastContact: '', interval: 0, email: '', socialProfiles: '', address: '' },
  { id: 'p13', name: 'Maira Yaneth Negrette Galvis', title: 'Mother', nickname: '', categories: ['Relative 👨‍👩‍👦'], fields: ['Education'], followUp: false, birthday: '1978-08-24', phone: '+57 301 7172327', lastContact: '', interval: 0, email: 'mayanega@hotmail.com', socialProfiles: '', address: 'San Bernardo Del Viento' },
  { id: 'p14', name: 'Luis Jose Llorente Martinez', title: 'Product Design', nickname: '', categories: ['Routine Contact 🧺'], fields: ['Design'], followUp: false, birthday: '2007-07-30', phone: '+57 321 6571885', lastContact: '2025-04-15', interval: 21, email: '', socialProfiles: '', address: 'Monteria' },
  { id: 'p15', name: 'Mariana Arrubla Serna', title: 'Production Engineering', nickname: '', categories: ['Dormant 💤', 'Ally 🤝'], fields: ['Industry'], followUp: false, birthday: '2008-06-13', phone: '+57 313 8332897', lastContact: '2025-04-14', interval: 3, email: '', socialProfiles: 'instagram.com/_marianaarrublaa_', address: 'La Estrella, Antioquia' },
  { id: 'p16', name: 'Katherine Manjarres', title: 'Sister / Journalist', nickname: '', categories: ['Relative 👨‍👩‍👦'], fields: ['Media'], followUp: false, birthday: '2005-09-23', phone: '+57 322 6337450', lastContact: '', interval: 0, email: '', socialProfiles: 'instagram.com/kat_miranda.23', address: 'San Bernardo Del Viento' },
  { id: 'p17', name: 'Maira Alejandra Lopez Negrette', title: 'Sister / Lawyer', nickname: '', categories: ['Relative 👨‍👩‍👦'], fields: ['Law'], followUp: false, birthday: '2000-06-04', phone: '+57 310 4030281', lastContact: '', interval: 0, email: '', socialProfiles: 'instagram.com/mairanegrette', address: 'San Bernardo Del Viento' },
  { id: 'p18', name: 'Jeniffer Manjarres', title: 'Sister / Psychologist', nickname: '', categories: ['Relative 👨‍👩‍👦'], fields: ['Education'], followUp: false, birthday: '1999-03-24', phone: '+57 321 7543330', lastContact: '', interval: 0, email: '', socialProfiles: 'instagram.com/jenifermanjarres', address: 'San Bernardo Del Viento' },
  { id: 'p19', name: 'Andrés Felipe Rengifo Zapata', title: 'System Engineering', nickname: 'Ren', categories: ['High Potential 🚀'], fields: ['Tech'], followUp: false, birthday: '2007-04-29', phone: '+57 305 4861671', lastContact: '2025-04-15', interval: 8, email: '', socialProfiles: '', address: '' },
  { id: 'p20', name: 'Daniel Parra Paternina', title: 'System Engineering', nickname: '', categories: ['High Potential 🚀', 'Dormant 💤'], fields: ['Tech'], followUp: false, birthday: '', phone: '+57 300 7072714', lastContact: '2025-04-15', interval: 8, email: '', socialProfiles: '', address: '' },
  { id: 'p21', name: 'Jose Giraldo López', title: 'System Engineering', nickname: '', categories: ['Acquaintance 👋'], fields: ['Tech'], followUp: false, birthday: '', phone: '+57 319 3813374', lastContact: '2025-04-15', interval: 8, email: '', socialProfiles: '', address: 'Rionegro, Antioquia' },
  { id: 'p22', name: 'Jeronimo Gutierrez Gutierrez', title: 'System Engineering', nickname: '', categories: ['Acquaintance 👋', 'Dormant 💤'], fields: ['Tech'], followUp: false, birthday: '', phone: '+57 300 7988498', lastContact: '', interval: 0, email: '', socialProfiles: '', address: '' },
  { id: 'p23', name: 'Dana Fernanda Madera Peralta', title: 'System Engineering', nickname: '', categories: ['Connector 🧠'], fields: ['Tech'], followUp: false, birthday: '1998-12-28', phone: '+57 313 6428290', lastContact: '2025-04-19', interval: 10, email: '', socialProfiles: '', address: 'Medellin, Belen' },
  { id: 'p24', name: 'J.D. Nicholls', title: 'Mentor, Entrepreneur', nickname: '', categories: ['Connector 🧠', 'Ally 🤝', 'High Potential 🚀'], fields: ['Tech', 'Business'], followUp: false, birthday: '', phone: '+57 311 3101122', lastContact: '', interval: 0, email: '', socialProfiles: '', address: '' },
  { id: 'p25', name: 'Eneida Morgan', title: 'Teacher', nickname: '', categories: ['Dormant 💤'], fields: ['Education'], followUp: false, birthday: '1990-02-01', phone: '+57 320 5405004', lastContact: '2025-04-24', interval: 6, email: '', socialProfiles: '', address: 'San Bernardo Del Viento' },
  { id: 'p26', name: 'Mateo Duque', title: 'System Engineering', nickname: '', categories: ['Ally 🤝', 'Dormant 💤'], fields: ['Tech'], followUp: false, birthday: '', phone: '+57 301 1960629', lastContact: '2025-04-15', interval: 8, email: '', socialProfiles: '', address: '' },
  { id: 'p27', name: 'Matias Zapata Rojas', title: 'System Engineering', nickname: '', categories: ['Dormant 💤'], fields: ['Tech'], followUp: false, birthday: '', phone: '+57 350 5185411', lastContact: '2025-04-15', interval: 12, email: '', socialProfiles: 'instagram.com/matias.09101', address: '' },
  { id: 'p28', name: 'Samuel Quintero Escobar', title: 'System Engineering', nickname: '', categories: ['Dormant 💤'], fields: ['Tech'], followUp: false, birthday: '', phone: '+57 301 6781030', lastContact: '2025-04-15', interval: 7, email: '', socialProfiles: '', address: '' },
  { id: 'p29', name: 'Laura Andrea Castrillon Fajardo', title: 'System Engineering', nickname: 'Lau', categories: ['Connector 🧠', 'High Potential 🚀'], fields: ['Tech'], followUp: false, birthday: '2006-09-27', phone: '', lastContact: '', interval: 14, email: '', socialProfiles: '', address: '' },
  { id: 'p30', name: 'Jeronimo Velez Acosta', title: 'System Engineering', nickname: '', categories: ['Ally 🤝', 'High Potential 🚀'], fields: ['Tech'], followUp: false, birthday: '', phone: '+57 305 3058321', lastContact: '', interval: 0, email: '', socialProfiles: '', address: '' },
]

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

      {/* Contacts Table */}
      <WidgetCard title="Contacts" description={`${filtered.length} of ${contacts.length}`} delay={0.1}>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-5 py-2 text-left font-medium">
                  <button onClick={() => toggleSort('name')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Name <SortIcon k="name" /></button>
                </th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('title')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Title <SortIcon k="title" /></button>
                </th>
                <th className="py-2 text-left font-medium">Category</th>
                <th className="py-2 text-left font-medium">Field</th>
                <th className="py-2 text-center font-medium">
                  <button onClick={() => toggleSort('birthday')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Age <SortIcon k="birthday" /></button>
                </th>
                <th className="py-2 text-left font-medium">Phone</th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('lastContact')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Last <SortIcon k="lastContact" /></button>
                </th>
                <th className="py-2 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <>
                  <tr key={c.id} ref={(el) => { rowRefs.current[c.id] = el }} onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    className={`cursor-pointer border-b border-border/20 transition-colors hover:bg-secondary/30 group ${expanded === c.id ? 'bg-secondary/20' : ''}`}>
                    <td className="px-5 py-2.5">
                      <span className="font-medium">{c.name}</span>
                      {c.nickname && <span className="ml-1.5 text-[10px] text-muted-foreground">({c.nickname})</span>}
                    </td>
                    <td className="py-2.5 text-muted-foreground">{c.title}</td>
                    <td className="py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {c.categories.slice(0, 2).map((cat) => (
                          <Badge key={cat} className={`text-[8px] px-1 py-0 ${catColor[cat] ?? 'bg-secondary'}`}>{cat}</Badge>
                        ))}
                        {c.categories.length > 2 && <span className="text-[9px] text-muted-foreground">+{c.categories.length - 2}</span>}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {c.fields.map((f) => <Badge key={f} className={`text-[8px] px-1 py-0 ${fieldColor[f] ?? 'bg-secondary'}`}>{f}</Badge>)}
                      </div>
                    </td>
                    <td className="py-2.5 text-center tabular-nums text-muted-foreground">{calcAge(c.birthday) ?? '—'}</td>
                    <td className="py-2.5 text-muted-foreground">{c.phone || '—'}</td>
                    <td className="py-2.5 text-muted-foreground tabular-nums">{c.lastContact ? fmtDate(c.lastContact) : '—'}</td>
                    <td className="py-2.5 pr-4">
                      <button onClick={(e) => { e.stopPropagation(); deleteContact(c.id) }} className="cursor-pointer opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400 transition-all">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
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
                              {ALL_CATEGORIES.map((cat) => {
                                const on = c.categories.includes(cat)
                                return <button key={cat} onClick={() => setField(c.id, { categories: on ? c.categories.filter((x) => x !== cat) : [...c.categories, cat] })}
                                  className={`cursor-pointer text-[9px] px-2 py-0.5 rounded-full border transition-all ${on ? `${catColor[cat]} border-current/20` : 'text-muted-foreground/30 border-border'}`}>{cat}</button>
                              })}
                            </div>
                            <label className="text-[10px] text-muted-foreground mt-1">Fields</label>
                            <div className="flex flex-wrap gap-1">
                              {Object.keys(fieldColor).map((f) => {
                                const on = c.fields.includes(f)
                                return <button key={f} onClick={() => setField(c.id, { fields: on ? c.fields.filter((x) => x !== f) : [...c.fields, f] })}
                                  className={`cursor-pointer text-[9px] px-2 py-0.5 rounded-full border transition-all ${on ? `${fieldColor[f]} border-current/20` : 'text-muted-foreground/30 border-border'}`}>{f}</button>
                              })}
                            </div>
                          </div>
                          <div className="flex items-end justify-end lg:col-span-3 pt-2">
                            <button
                              onClick={() => deleteContact(c.id)}
                              className="cursor-pointer flex items-center gap-1.5 text-xs text-red-400/60 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-red-400/20 hover:border-red-400/40 hover:bg-red-400/5"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete contact
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
        </div>
      </WidgetCard>
    </PageShell>
  )
}
