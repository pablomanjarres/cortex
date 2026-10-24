import { useState, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Select } from '@/components/ui/select'
import { FilterChips } from '@/components/shared/FilterChips'
import { DisclosureCard, DisclosureTableRow } from '@/components/shared/RecordDisclosure'
import { SearchInput } from '@/components/shared/SearchInput'
import { SortableHeader } from '@/components/shared/SortableHeader'
import {
  BookOpen,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  BookMarked,
} from 'lucide-react'

import { useStore } from '@/lib/store'
import { ALL_GENRES, ALL_STATUSES, DEFAULT_BOOKS, scoreNum, type Book, type Score, type SortKey, type Status } from './book-model'
import { BookFields } from './BookFields'

// ── Helpers ──────────────────────────────────────────────────────────────────

// Reading status is a semantic state: in-progress = accent, done = success.
const statusIcon = (s: Status) =>
  s === 'Hecho' ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
  : s === 'En curso' ? <BookOpen className="h-3.5 w-3.5 text-accent" />
  : <BookMarked className="h-3.5 w-3.5 text-foreground-faint" />
const Stars = ({ score }: { score: Score }) => {
  const n = scoreNum(score)
  if (!n) return <span className="font-mono text-2xs text-foreground-faint">{score || '—'}</span>
  return (
    <span className="font-mono text-xs" aria-label={`Rated ${n} of 5`}>
      <span className="text-accent">{'★'.repeat(n)}</span>
      <span aria-hidden className="text-foreground-faint">{'☆'.repeat(5 - n)}</span>
    </span>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function BooksPage() {
  const [books, updateBooks] = useStore<Book[]>('cortex-books', DEFAULT_BOOKS)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<Status | null>(null)
  const [filterGenre, setFilterGenre] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [sortAsc, setSortAsc] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const update = updateBooks

  const setField = (id: string, f: Partial<Book>) => update((p) => p.map((b) => b.id === id ? { ...b, ...f } : b))
  const deleteBook = (id: string) => { update((p) => p.filter((b) => b.id !== id)); if (expanded === id) setExpanded(null) }
  const addBook = () => {
    const b: Book = { id: `bk-${Date.now()}`, title: 'New Book', author: '', status: 'Sin empezar', score: '', genre: '', start: '', finished: '', notes: '' }
    update((p) => [b, ...p]); setExpanded(b.id)
  }

  const toggleSort = (k: SortKey) => { if (sortKey === k) setSortAsc((p) => !p); else { setSortKey(k); setSortAsc(true) } }
  const sortProps = (k: SortKey) => ({ active: sortKey === k, ascending: sortAsc, onSort: () => toggleSort(k) })
  const toggleExpanded = (id: string) => setExpanded(expanded === id ? null : id)
  const emptyState = books.length === 0
    ? <EmptyState message="No books yet." hint="Press Add to shelve one." />
    : <EmptyState message="No books match." hint="Clear a filter, or press Add to shelve one." />

  const filtered = useMemo(() =>
    books
      .filter((b) => (!filterStatus || b.status === filterStatus) && (!filterGenre || b.genre === filterGenre))
      .filter((b) => !search || b.title.toLowerCase().includes(search.toLowerCase()) || b.author.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        let v = 0
        switch (sortKey) {
          case 'title': v = a.title.localeCompare(b.title); break
          case 'author': v = a.author.localeCompare(b.author); break
          case 'score': v = scoreNum(a.score) - scoreNum(b.score); break
          case 'genre': v = a.genre.localeCompare(b.genre); break
        }
        return sortAsc ? v : -v
      }),
    [books, filterStatus, filterGenre, search, sortKey, sortAsc],
  )

  const stats = useMemo(() => ({
    total: books.length,
    done: books.filter((b) => b.status === 'Hecho').length,
    reading: books.filter((b) => b.status === 'En curso').length,
    toRead: books.filter((b) => b.status === 'Sin empezar').length,
  }), [books])

  return (
    <PageShell>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total" value={stats.total} icon={<BookMarked />} />
        <StatTile label="Reading" value={stats.reading} icon={<BookOpen />} className="[--card:var(--focus-surface)]" />
        <StatTile label="Completed" value={stats.done} icon={<CheckCircle2 />} />
        <StatTile label="To read" value={stats.toRead} icon={<Clock />} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput label="Search books" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search books..." containerClassName="min-w-[200px] flex-1" className="h-8 text-xs" />
        <FilterChips label="Filter by status" size="md" value={filterStatus} onChange={setFilterStatus} className="flex-nowrap"
          options={ALL_STATUSES.map((s) => ({ value: s, label: s }))} />
        <Select aria-label="Filter by genre" value={filterGenre ?? ''} onChange={(e) => setFilterGenre(e.target.value || null)} className="h-8 w-auto cursor-pointer text-xs">
          <option value="">All genres</option>
          {ALL_GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
        <Button variant="secondary" size="sm" onClick={addBook}>
          <Plus /> Add
        </Button>
      </div>

      {/* Mobile: Book cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {filtered.length === 0 ? emptyState : filtered.map((b) => (
          <DisclosureCard key={b.id} name={b.title} detailsId={`book-card-${b.id}`} expanded={expanded === b.id} onToggle={() => toggleExpanded(b.id)}
            icon={statusIcon(b.status)} subtitle={b.author}
            aside={<>
              <Stars score={b.score} />
              <Button variant="ghost" size="icon-lg" aria-label="Delete book" className="active:text-destructive" onClick={() => deleteBook(b.id)}>
                <Trash2 />
              </Button>
            </>}
            meta={b.genre && <div className="mt-1.5"><Chip size="sm">{b.genre}</Chip></div>}>
            <BookFields book={b} onChange={(patch) => setField(b.id, patch)} />
          </DisclosureCard>
        ))}
      </div>

      {/* Desktop: Table */}
      <WidgetCard title="Books" description={`${filtered.length} books`} delay={0.1} className="hidden md:block">
        {filtered.length === 0 ? emptyState : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="w-6 px-4 py-2"><span className="sr-only">Status</span></th>
                  <SortableHeader label="Title" {...sortProps('title')} />
                  <SortableHeader label="Author" {...sortProps('author')} />
                  <SortableHeader label="Genre" {...sortProps('genre')} />
                  <SortableHeader label="Rating" {...sortProps('score')} />
                  <th className="w-6 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <DisclosureTableRow key={b.id} name={b.title} detailsId={`book-row-${b.id}`} expanded={expanded === b.id} onToggle={() => toggleExpanded(b.id)}
                    colSpan={6} details={<BookFields book={b} onChange={(patch) => setField(b.id, patch)} />}>
                    {(toggle) => <>
                      <td className="px-4 py-2.5">{statusIcon(b.status)}</td>
                      <td className="py-2.5">{toggle}</td>
                      <td className="py-2.5 text-muted-foreground">{b.author}</td>
                      <td className="py-2.5">{b.genre ? <Chip size="sm">{b.genre}</Chip> : <span className="text-foreground-faint">—</span>}</td>
                      <td className="py-2.5"><Stars score={b.score} /></td>
                      <td className="py-2.5 pr-4"><Button variant="ghost" size="icon-xs" aria-label="Delete book" className="opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteBook(b.id) }}><Trash2 /></Button></td>
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
