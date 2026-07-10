import { useState, useMemo, Fragment } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import {
  BookOpen,
  Search,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  BookMarked,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type Status = 'Sin empezar' | 'En curso' | 'Hecho'
type Score = '5 stars' | '4 stars' | '3 stars' | '2 stars' | '1 star' | 'Por decidir' | ''
type SortKey = 'title' | 'author' | 'score' | 'genre'

interface Book {
  id: string
  title: string
  author: string
  status: Status
  score: Score
  genre: string
  start: string
  finished: string
  notes: string
}

// ── Data ─────────────────────────────────────────────────────────────────────

const DEFAULT_BOOKS: Book[] = [
  // Hecho
  { id: 'b1', title: 'University of Success', author: 'OG Mandino', status: 'Hecho', score: '5 stars', genre: 'Self Improvement', start: '', finished: '2025-06-17', notes: '' },
  { id: 'b2', title: 'El arte de la guerra', author: 'Sun Tzu', status: 'Hecho', score: '5 stars', genre: 'Novela', start: '', finished: '', notes: '' },
  { id: 'b3', title: 'The Millionaire Fastlane', author: 'MJ DeMarco', status: 'Hecho', score: '5 stars', genre: 'Economy & Finances', start: '', finished: '2024-02-01', notes: '' },
  { id: 'b4', title: 'The Intelligent Investor', author: 'Benjamin Graham', status: 'Hecho', score: '5 stars', genre: 'Economy & Finances', start: '', finished: '2024-02-01', notes: '' },
  { id: 'b5', title: 'La Odisea', author: 'Homero', status: 'Hecho', score: '4 stars', genre: 'Novela', start: '', finished: '2023-08-25', notes: '' },
  { id: 'b6', title: 'Las siete llaves', author: 'Alex Rovira', status: 'Hecho', score: '4 stars', genre: 'Self Improvement', start: '', finished: '2023-10-04', notes: '' },
  { id: 'b7', title: 'Economía Comestible', author: 'Ha-Joon Chang', status: 'Hecho', score: '3 stars', genre: 'Economy', start: '', finished: '2023-09-06', notes: '' },
  { id: 'b8', title: 'Historia Mínima de Colombia', author: 'Jorge Orlando Melo', status: 'Hecho', score: '', genre: 'History', start: '2024-05-22', finished: '', notes: '' },
  // En curso
  { id: 'b9', title: 'The Prince', author: 'Niccolò Machiavelli', status: 'En curso', score: '', genre: 'Philosophy', start: '2024-05-22', finished: '', notes: '' },
  { id: 'b10', title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', status: 'En curso', score: '4 stars', genre: 'Self Improvement', start: '', finished: '', notes: '' },
  // Sin empezar
  { id: 'b11', title: 'Think Again', author: 'Adam Grant', status: 'Sin empezar', score: '', genre: 'Self Improvement', start: '', finished: '', notes: '' },
  { id: 'b12', title: 'CBT for Beginners', author: 'Rachel', status: 'Sin empezar', score: '', genre: 'Psychology', start: '', finished: '', notes: '' },
  { id: 'b13', title: 'The Lean Startup', author: 'Eric Ries', status: 'Sin empezar', score: '', genre: 'Startup', start: '', finished: '', notes: '' },
  { id: 'b14', title: 'Imagine: How Creativity Works', author: 'Jonah Lehrer', status: 'Sin empezar', score: '', genre: '', start: '', finished: '', notes: '' },
  { id: 'b15', title: 'Moonwalking with Einstein', author: 'Joshua Foer', status: 'Sin empezar', score: '', genre: 'Self Improvement', start: '', finished: '', notes: '' },
  { id: 'b16', title: "The Heart of the Buddha's Teaching", author: 'Thich Nhat Hanh', status: 'Sin empezar', score: 'Por decidir', genre: 'Philosophy', start: '', finished: '', notes: '' },
  { id: 'b17', title: 'Tao Te Ching', author: 'Lao Tzu', status: 'Sin empezar', score: 'Por decidir', genre: 'Philosophy', start: '', finished: '', notes: '' },
  { id: 'b18', title: 'The Guide to Getting It On', author: 'Paul Joannides', status: 'Sin empezar', score: '', genre: 'Love', start: '', finished: '', notes: '' },
  { id: 'b19', title: 'King Arthur', author: 'Roger Lancelyn Green', status: 'Sin empezar', score: '', genre: '', start: '', finished: '', notes: '' },
  { id: 'b20', title: 'How to Write a Killer LinkedIn Profile', author: 'Brenda Bernstein', status: 'Sin empezar', score: '', genre: 'Professional', start: '', finished: '', notes: '' },
  { id: 'b21', title: 'The Greatest Salesman in the World', author: 'OG Mandino', status: 'Sin empezar', score: 'Por decidir', genre: 'Economy & Finances', start: '', finished: '', notes: '' },
  { id: 'b22', title: 'The Clean Coder', author: 'Robert C. Martin', status: 'Sin empezar', score: '', genre: 'Programming', start: '', finished: '', notes: '' },
  { id: 'b23', title: 'Design Patterns', author: 'Grady Booch', status: 'Sin empezar', score: '', genre: 'Programming', start: '', finished: '', notes: '' },
  { id: 'b24', title: 'JavaScript: The Good Parts', author: 'Douglas Crockford', status: 'Sin empezar', score: '', genre: 'Programming', start: '', finished: '', notes: '' },
  { id: 'b25', title: 'Learning JS Data Structures and Algorithms', author: 'Loiane Groner', status: 'Sin empezar', score: '', genre: 'Programming', start: '', finished: '', notes: '' },
  { id: 'b26', title: 'Refactoring', author: 'Martin Fowler', status: 'Sin empezar', score: '', genre: 'Programming', start: '', finished: '', notes: '' },
  { id: 'b27', title: 'Cálculo Infinitesimal', author: 'Juan de Burgos', status: 'Sin empezar', score: '', genre: 'Calculus', start: '', finished: '', notes: '' },
]

import { useStore } from '@/lib/store'

// ── Helpers ──────────────────────────────────────────────────────────────────

const ALL_STATUSES: Status[] = ['En curso', 'Sin empezar', 'Hecho']
const ALL_SCORES: Score[] = ['5 stars', '4 stars', '3 stars', '2 stars', '1 star', 'Por decidir', '']
const ALL_GENRES = ['Self Improvement', 'Programming', 'Economy & Finances', 'Philosophy', 'Novela', 'Psychology', 'Startup', 'History', 'Economy', 'Love', 'Professional', 'Calculus']

// Reading status is a semantic state: in-progress = accent, done = success.
const statusIcon = (s: Status) =>
  s === 'Hecho' ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
  : s === 'En curso' ? <BookOpen className="h-3.5 w-3.5 text-accent" />
  : <BookMarked className="h-3.5 w-3.5 text-foreground-faint" />
const scoreNum = (s: Score) => s === '5 stars' ? 5 : s === '4 stars' ? 4 : s === '3 stars' ? 3 : s === '2 stars' ? 2 : s === '1 star' ? 1 : 0
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

// Shared token styles: native <select> mirrors the Input primitive; underline
// inputs are the quiet inline-edit pattern; table headers use the card-title stack.
const selectCls =
  'h-8 w-full cursor-pointer rounded-md border border-input bg-input/20 px-2 text-xs text-foreground transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const lineInputCls = 'w-full border-b border-border/60 bg-transparent py-1 text-xs outline-none placeholder:text-foreground-faint'
const labelCls = 'text-2xs text-muted-foreground'
const thCls = 'py-2 text-left font-mono text-2xs font-normal uppercase tracking-wider'

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
  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />

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
        <StatTile label="Reading" value={stats.reading} icon={<BookOpen />} />
        <StatTile label="Completed" value={stats.done} icon={<CheckCircle2 />} />
        <StatTile label="To read" value={stats.toRead} icon={<Clock />} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search books..." className="h-8 pl-8 text-xs" />
        </div>
        <div className="flex gap-1.5">
          {ALL_STATUSES.map((s) => (
            <Chip key={s} selectable selected={filterStatus === s} onClick={() => setFilterStatus(filterStatus === s ? null : s)}>
              {s}
            </Chip>
          ))}
        </div>
        <select value={filterGenre ?? ''} onChange={(e) => setFilterGenre(e.target.value || null)} className={`${selectCls} w-auto`}>
          <option value="">All genres</option>
          {ALL_GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <Button variant="secondary" size="sm" onClick={addBook}>
          <Plus /> Add
        </Button>
      </div>

      {/* Mobile: Book cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {filtered.map((b) => (
          <div key={b.id} className="surface rounded-xl p-4" onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
            <div className="flex items-start justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="shrink-0">{statusIcon(b.status)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{b.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{b.author}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Stars score={b.score} />
                <Button variant="ghost" size="icon-sm" aria-label="Delete book" className="active:text-destructive" onClick={(e) => { e.stopPropagation(); deleteBook(b.id) }}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            {b.genre && <div className="mt-1.5"><Chip size="sm">{b.genre}</Chip></div>}
            {expanded === b.id && (
              <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-3" onClick={(e) => e.stopPropagation()}>
                <div><label className={labelCls}>Title</label><input value={b.title} onChange={(e) => setField(b.id, { title: e.target.value })} className={`${lineInputCls} pb-1 text-sm font-semibold`} /></div>
                <div><label className={labelCls}>Author</label><input value={b.author} onChange={(e) => setField(b.id, { author: e.target.value })} className={lineInputCls} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>Status</label>
                    <select value={b.status} onChange={(e) => setField(b.id, { status: e.target.value as Status })} className={selectCls}>
                      {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select></div>
                  <div><label className={labelCls}>Score</label>
                    <select value={b.score} onChange={(e) => setField(b.id, { score: e.target.value as Score })} className={selectCls}>
                      {ALL_SCORES.map((s) => <option key={s} value={s}>{s || 'No rating'}</option>)}
                    </select></div>
                </div>
                <div><label className={labelCls}>Genre</label>
                  <select value={b.genre} onChange={(e) => setField(b.id, { genre: e.target.value })} className={selectCls}>
                    <option value="">None</option>
                    {ALL_GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>Start date</label><input type="date" value={b.start} onChange={(e) => setField(b.id, { start: e.target.value })} className={`${lineInputCls} cursor-pointer font-mono`} /></div>
                  <div><label className={labelCls}>Finished</label><input type="date" value={b.finished} onChange={(e) => setField(b.id, { finished: e.target.value })} className={`${lineInputCls} cursor-pointer font-mono`} /></div>
                </div>
                <div><label className={labelCls}>Notes</label>
                  <textarea value={b.notes} onChange={(e) => setField(b.id, { notes: e.target.value })} rows={3} className="w-full resize-none rounded-md border border-input bg-input/20 p-2 text-xs outline-none placeholder:text-foreground-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" placeholder="Your thoughts..." />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: Table */}
      <WidgetCard title="Books" description={`${filtered.length} books`} delay={0.1} className="hidden md:block">
        {filtered.length === 0 ? (
          <EmptyState message="No books match." hint="Clear a filter, or press Add to shelve one." />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="w-6 px-4 py-2"></th>
                  {/* Sort headers: compact table-header toggles (focus ring from the global rule). */}
                  <th className={thCls}><button onClick={() => toggleSort('title')} className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground">Title <SortIcon k="title" /></button></th>
                  <th className={thCls}><button onClick={() => toggleSort('author')} className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground">Author <SortIcon k="author" /></button></th>
                  <th className={thCls}><button onClick={() => toggleSort('genre')} className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground">Genre <SortIcon k="genre" /></button></th>
                  <th className={thCls}><button onClick={() => toggleSort('score')} className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground">Rating <SortIcon k="score" /></button></th>
                  <th className="w-6 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <Fragment key={b.id}>
                    <tr onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                      className={`group cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary/30 ${expanded === b.id ? 'bg-secondary/20' : ''}`}>
                      <td className="px-4 py-2.5">{statusIcon(b.status)}</td>
                      <td className="py-2.5 font-medium">{b.title}</td>
                      <td className="py-2.5 text-muted-foreground">{b.author}</td>
                      <td className="py-2.5">{b.genre ? <Chip size="sm">{b.genre}</Chip> : <span className="text-foreground-faint">—</span>}</td>
                      <td className="py-2.5"><Stars score={b.score} /></td>
                      <td className="py-2.5 pr-4"><Button variant="ghost" size="icon-xs" aria-label="Delete book" className="opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteBook(b.id) }}><Trash2 /></Button></td>
                    </tr>
                    {expanded === b.id && (
                      <tr>
                        <td colSpan={6} className="border-b border-border/60 bg-secondary/10 px-4 py-4">
                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                            <div className="flex flex-col gap-2">
                              <div><label className={labelCls}>Title</label><input value={b.title} onChange={(e) => setField(b.id, { title: e.target.value })} className={`${lineInputCls} pb-1 text-sm font-semibold`} /></div>
                              <div><label className={labelCls}>Author</label><input value={b.author} onChange={(e) => setField(b.id, { author: e.target.value })} className={lineInputCls} /></div>
                              <div className="grid grid-cols-2 gap-2">
                                <div><label className={labelCls}>Status</label><select value={b.status} onChange={(e) => setField(b.id, { status: e.target.value as Status })} className={selectCls}>{ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                                <div><label className={labelCls}>Score</label><select value={b.score} onChange={(e) => setField(b.id, { score: e.target.value as Score })} className={selectCls}>{ALL_SCORES.map((s) => <option key={s} value={s}>{s || 'No rating'}</option>)}</select></div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <div><label className={labelCls}>Genre</label><select value={b.genre} onChange={(e) => setField(b.id, { genre: e.target.value })} className={selectCls}><option value="">None</option>{ALL_GENRES.map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
                              <div><label className={labelCls}>Start date</label><input type="date" value={b.start} onChange={(e) => setField(b.id, { start: e.target.value })} className={`${lineInputCls} cursor-pointer font-mono`} /></div>
                              <div><label className={labelCls}>Finished</label><input type="date" value={b.finished} onChange={(e) => setField(b.id, { finished: e.target.value })} className={`${lineInputCls} cursor-pointer font-mono`} /></div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className={labelCls}>Notes</label>
                              <textarea value={b.notes} onChange={(e) => setField(b.id, { notes: e.target.value })} rows={5} className="resize-none rounded-md border border-input bg-input/20 p-2 text-xs outline-none placeholder:text-foreground-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" placeholder="Your thoughts on this book..." />
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
