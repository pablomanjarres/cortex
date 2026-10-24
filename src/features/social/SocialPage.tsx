import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { SearchInput } from '@/components/shared/SearchInput'
import { SortableHeader, tableHeaderClassName } from '@/components/shared/SortableHeader'
import {
  Plus,
  Trash2,
  Cake,
  Clock,
  RotateCcw,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import { syncBirthdayToCalendar } from '@/lib/calendar-sync'
import { KnowledgeLink } from '@/components/shared/KnowledgeLink'
import { recordRefs } from '@/lib/knowledge'
import { useOpenOnce, useRecordParam } from '@/lib/use-url-param'
import {
  ALL_CATEGORIES, DEFAULT_CONTACTS, calcAge, daysUntilBirthday, fmtDate, withContactDefaults,
  type Contact, type SortKey,
} from './contact-model'
import { ContactFields } from './ContactFields'

// ── Component ────────────────────────────────────────────────────────────────

export function SocialPage() {
  const [savedContacts, updateContacts] = useStore<Contact[]>('cortex-contacts', DEFAULT_CONTACTS)
  const contacts = useMemo(() => savedContacts.map(withContactDefaults), [savedContacts])
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  // `?record=contact:<id>` opens that contact once per link.
  const recordId = useRecordParam('contact')
  useOpenOnce(recordId, setExpanded)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

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
    const c = withContactDefaults({ id: `c-${Date.now()}`, name: 'New Contact' })
    update((p) => [c, ...p]); setExpanded(c.id)
  }

  const toggleSort = (k: SortKey) => { if (sortKey === k) setSortAsc((p) => !p); else { setSortKey(k); setSortAsc(true) } }
  const sortProps = (k: SortKey) => ({ active: sortKey === k, ascending: sortAsc, onSort: () => toggleSort(k) })
  const toggleExpanded = (id: string) => setExpanded(expanded === id ? null : id)
  const emptyState = contacts.length === 0
    ? <EmptyState message="No one here yet." hint="Press Add to keep your first contact." />
    : <EmptyState message="No contacts match." hint="Clear the search or category filter." />

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
      const daysSince = Math.ceil((now - last.getTime()) / 86_400_000)
      return daysSince > c.interval
    }).sort((a, b) => {
      const da = Math.ceil((now - new Date(a.lastContact).getTime()) / 86_400_000) - a.interval
      const db = Math.ceil((now - new Date(b.lastContact).getTime()) / 86_400_000) - b.interval
      return db - da
    }),
    [contacts, now],
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
                const daysSince = Math.ceil((now - new Date(c.lastContact).getTime()) / 86_400_000)
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
        <SearchInput label="Search contacts" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." containerClassName="min-w-[200px] flex-1" className="h-8 text-xs" />
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
        {filtered.length === 0 ? emptyState : filtered.map((c) => {
          const detailId = `contact-card-${c.id}`
          const age = calcAge(c.birthday)
          return (
            <div key={c.id} className="surface rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <Button variant="ghost" size="sm" aria-label={`Details for ${c.name}`} aria-expanded={expanded === c.id} aria-controls={detailId}
                  onClick={() => toggleExpanded(c.id)}
                  className="h-auto min-h-11 min-w-0 flex-1 justify-start p-0 text-left whitespace-normal">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.name}{c.nickname ? <span className="ml-1 text-2xs text-muted-foreground">({c.nickname})</span> : null}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.title || 'No title'}</span>
                  </span>
                </Button>
                <Button variant="ghost" size="icon-lg" aria-label="Delete contact" className="shrink-0 active:text-destructive" onClick={() => deleteContact(c.id)}>
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {c.categories.map((cat) => <Chip key={cat} size="sm">{cat}</Chip>)}
                {c.fields.map((f) => <Chip key={f} size="sm">{f}</Chip>)}
              </div>
              <div className="mt-2 flex items-center gap-3 font-mono text-2xs text-muted-foreground">
                {c.phone && <span>{c.phone}</span>}
                {age != null && <span className="tabular-nums">Age {age}</span>}
                {c.lastContact && <span>{fmtDate(c.lastContact)}</span>}
              </div>
              <div id={detailId} hidden={expanded !== c.id}>
                {expanded === c.id && (
                  <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-3">
                    <ContactFields contact={c} onChange={(patch) => setField(c.id, patch)} />
                    <KnowledgeLink cortexRef={recordRefs.contact(c.id)} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop: Table */}
      <WidgetCard title="Contacts" description={`${filtered.length} of ${contacts.length}`} delay={0.1} className="hidden md:block">
        {filtered.length === 0 ? emptyState : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <SortableHeader label="Name" {...sortProps('name')} className="px-4" />
                  <SortableHeader label="Title" {...sortProps('title')} />
                  <th scope="col" className={tableHeaderClassName}>Category</th>
                  <th scope="col" className={tableHeaderClassName}>Field</th>
                  <SortableHeader label="Age" {...sortProps('birthday')} />
                  <th scope="col" className={tableHeaderClassName}>Phone</th>
                  <SortableHeader label="Last" {...sortProps('lastContact')} />
                  <th className="w-6 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const detailId = `contact-row-${c.id}`
                  const age = calcAge(c.birthday)
                  return (
                    <Fragment key={c.id}>
                      <tr ref={(el) => { rowRefs.current[c.id] = el }} onClick={() => toggleExpanded(c.id)}
                        className={`group cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary/30 ${expanded === c.id ? 'bg-secondary/20' : ''}`}>
                        <td className="px-4 py-2.5"><Button variant="ghost" size="xs" aria-label={`Details for ${c.name}`} aria-expanded={expanded === c.id} aria-controls={detailId}
                          onClick={(e) => { e.stopPropagation(); toggleExpanded(c.id) }}
                          className="min-h-7 px-0 text-left font-medium hover:text-accent">{c.name}</Button>{c.nickname && <span className="ml-1.5 text-2xs text-muted-foreground">({c.nickname})</span>}</td>
                        <td className="py-2.5 text-muted-foreground">{c.title}</td>
                        <td className="py-2.5"><div className="flex flex-wrap gap-1">{c.categories.slice(0, 2).map((cat) => <Chip key={cat} size="sm">{cat}</Chip>)}{c.categories.length > 2 && <span className="font-mono text-3xs text-foreground-faint">+{c.categories.length - 2}</span>}</div></td>
                        <td className="py-2.5"><div className="flex flex-wrap gap-1">{c.fields.map((f) => <Chip key={f} size="sm">{f}</Chip>)}</div></td>
                        <td className="py-2.5 font-mono tabular-nums text-muted-foreground">{age ?? '—'}</td>
                        <td className="py-2.5 font-mono text-muted-foreground">{c.phone || '—'}</td>
                        <td className="py-2.5 font-mono tabular-nums text-muted-foreground">{c.lastContact ? fmtDate(c.lastContact) : '—'}</td>
                        <td className="py-2.5 pr-4"><Button variant="ghost" size="icon-xs" aria-label="Delete contact" className="opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteContact(c.id) }}><Trash2 /></Button></td>
                      </tr>
                      <tr id={detailId} hidden={expanded !== c.id}>
                        {expanded === c.id && (
                          <td colSpan={8} className="border-b border-border/60 bg-secondary/10 px-4 py-4">
                            <ContactFields contact={c} onChange={(patch) => setField(c.id, patch)} />
                            <div className="flex items-end justify-end gap-2 pt-4">
                              <KnowledgeLink cortexRef={recordRefs.contact(c.id)} />
                              <Button variant="destructive" size="sm" onClick={() => deleteContact(c.id)}>
                                <Trash2 /> Delete contact
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>
    </PageShell>
  )
}
