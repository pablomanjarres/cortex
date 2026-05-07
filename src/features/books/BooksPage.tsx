import { useState, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen,
  Star,
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

const statusColor: Record<Status, string> = { 'En curso': 'bg-blue-500/15 text-blue-400', 'Sin empezar': 'bg-red-500/15 text-red-400', Hecho: 'bg-green-500/15 text-green-400' }
const statusIcon = (s: Status) => s === 'Hecho' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : s === 'En curso' ? <BookOpen className="h-3.5 w-3.5 text-blue-400" /> : <BookMarked className="h-3.5 w-3.5 text-muted-foreground/40" />
const scoreNum = (s: Score) => s === '5 stars' ? 5 : s === '4 stars' ? 4 : s === '3 stars' ? 3 : s === '2 stars' ? 2 : s === '1 star' ? 1 : 0
const Stars = ({ score }: { score: Score }) => {
  const n = scoreNum(score)
  if (!n) return <span className="text-muted-foreground/30 text-[10px]">{score || '—'}</span>
  return <div className="flex gap-0.5">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-3 w-3 ${i < n ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/20'}`} />)}</div>
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
        {[
          { label: 'Total', value: stats.total, icon: BookMarked, color: '' },
          { label: 'Reading', value: stats.reading, icon: BookOpen, color: 'text-blue-400' },
          { label: 'Completed', value: stats.done, icon: CheckCircle2, color: 'text-green-400' },
          { label: 'To Read', value: stats.toRead, icon: Clock, color: 'text-muted-foreground' },
        ].map((kpi) => (
          <div key={kpi.label} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
            <kpi.icon className={`h-5 w-5 ${kpi.color || 'text-muted-foreground'}`} />
            <div>
              <p className={`text-xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-lg border border-border px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search books..." className="bg-transparent outline-none text-xs flex-1 placeholder:text-muted-foreground/40" />
        </div>
        <div className="flex gap-1.5">
          {ALL_STATUSES.map((s) => (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? null : s)}
              className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${filterStatus === s ? `${statusColor[s]} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>{s}</button>
          ))}
        </div>
        <select value={filterGenre ?? ''} onChange={(e) => setFilterGenre(e.target.value || null)} className="cursor-pointer bg-transparent text-[10px] border border-border rounded-full px-2.5 py-1 outline-none text-muted-foreground">
          <option value="">All genres</option>
          {ALL_GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <button onClick={addBook} className="cursor-pointer flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-lg border border-border hover:bg-secondary transition-all">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {/* Mobile: Book cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {filtered.map((b) => (
          <div key={b.id} className="liquid-glass rounded-xl border border-border p-4" onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="shrink-0">{statusIcon(b.status)}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{b.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{b.author}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Stars score={b.score} />
                <button onClick={(e) => { e.stopPropagation(); deleteBook(b.id) }} className="cursor-pointer p-1.5 text-muted-foreground/40 active:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {b.genre && <div className="mt-1.5"><Badge variant="secondary" className="text-[9px]">{b.genre}</Badge></div>}
            {expanded === b.id && (
              <div className="mt-4 pt-3 border-t border-border/30 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                <div><label className="text-[10px] text-muted-foreground">Title</label><input value={b.title} onChange={(e) => setField(b.id, { title: e.target.value })} className="w-full bg-transparent outline-none text-sm font-semibold border-b border-border/30 pb-1" /></div>
                <div><label className="text-[10px] text-muted-foreground">Author</label><input value={b.author} onChange={(e) => setField(b.id, { author: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] text-muted-foreground">Status</label>
                    <select value={b.status} onChange={(e) => setField(b.id, { status: e.target.value as Status })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">
                      {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select></div>
                  <div><label className="text-[10px] text-muted-foreground">Score</label>
                    <select value={b.score} onChange={(e) => setField(b.id, { score: e.target.value as Score })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">
                      {ALL_SCORES.map((s) => <option key={s} value={s}>{s || 'No rating'}</option>)}
                    </select></div>
                </div>
                <div><label className="text-[10px] text-muted-foreground">Genre</label>
                  <select value={b.genre} onChange={(e) => setField(b.id, { genre: e.target.value })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">
                    <option value="">None</option>
                    {ALL_GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] text-muted-foreground">Start date</label><input type="date" value={b.start} onChange={(e) => setField(b.id, { start: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 cursor-pointer" /></div>
                  <div><label className="text-[10px] text-muted-foreground">Finished</label><input type="date" value={b.finished} onChange={(e) => setField(b.id, { finished: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 cursor-pointer" /></div>
                </div>
                <div><label className="text-[10px] text-muted-foreground">Notes</label>
                  <textarea value={b.notes} onChange={(e) => setField(b.id, { notes: e.target.value })} rows={3} className="w-full bg-transparent outline-none text-xs border border-border/30 rounded-lg p-2 resize-none placeholder:text-muted-foreground/30" placeholder="Your thoughts..." />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: Table */}
      <WidgetCard title="Library" description={`${filtered.length} books`} delay={0.1} className="hidden md:block">
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-5 py-2 w-6"></th>
                <th className="py-2 text-left font-medium"><button onClick={() => toggleSort('title')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Title <SortIcon k="title" /></button></th>
                <th className="py-2 text-left font-medium"><button onClick={() => toggleSort('author')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Author <SortIcon k="author" /></button></th>
                <th className="py-2 text-left font-medium"><button onClick={() => toggleSort('genre')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Genre <SortIcon k="genre" /></button></th>
                <th className="py-2 text-left font-medium"><button onClick={() => toggleSort('score')} className="cursor-pointer flex items-center gap-1 hover:text-foreground">Rating <SortIcon k="score" /></button></th>
                <th className="py-2 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <>
                  <tr key={b.id} onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                    className={`cursor-pointer border-b border-border/20 transition-colors hover:bg-secondary/30 group ${expanded === b.id ? 'bg-secondary/20' : ''}`}>
                    <td className="px-5 py-2.5">{statusIcon(b.status)}</td>
                    <td className="py-2.5 font-medium">{b.title}</td>
                    <td className="py-2.5 text-muted-foreground">{b.author}</td>
                    <td className="py-2.5">{b.genre ? <Badge variant="secondary" className="text-[9px]">{b.genre}</Badge> : <span className="text-muted-foreground/30">—</span>}</td>
                    <td className="py-2.5"><Stars score={b.score} /></td>
                    <td className="py-2.5 pr-4"><button onClick={(e) => { e.stopPropagation(); deleteBook(b.id) }} className="cursor-pointer opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400 transition-all"><Trash2 className="h-3 w-3" /></button></td>
                  </tr>
                  {expanded === b.id && (
                    <tr key={`${b.id}-edit`}>
                      <td colSpan={6} className="px-5 py-4 border-b border-border/20 bg-foreground/[0.02]">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                          <div className="flex flex-col gap-2">
                            <div><label className="text-[10px] text-muted-foreground">Title</label><input value={b.title} onChange={(e) => setField(b.id, { title: e.target.value })} className="w-full bg-transparent outline-none text-sm font-semibold border-b border-border/30 pb-1" /></div>
                            <div><label className="text-[10px] text-muted-foreground">Author</label><input value={b.author} onChange={(e) => setField(b.id, { author: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1" /></div>
                            <div className="grid grid-cols-2 gap-2">
                              <div><label className="text-[10px] text-muted-foreground">Status</label><select value={b.status} onChange={(e) => setField(b.id, { status: e.target.value as Status })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">{ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                              <div><label className="text-[10px] text-muted-foreground">Score</label><select value={b.score} onChange={(e) => setField(b.id, { score: e.target.value as Score })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">{ALL_SCORES.map((s) => <option key={s} value={s}>{s || 'No rating'}</option>)}</select></div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <div><label className="text-[10px] text-muted-foreground">Genre</label><select value={b.genre} onChange={(e) => setField(b.id, { genre: e.target.value })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1"><option value="">None</option>{ALL_GENRES.map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
                            <div><label className="text-[10px] text-muted-foreground">Start date</label><input type="date" value={b.start} onChange={(e) => setField(b.id, { start: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 cursor-pointer" /></div>
                            <div><label className="text-[10px] text-muted-foreground">Finished</label><input type="date" value={b.finished} onChange={(e) => setField(b.id, { finished: e.target.value })} className="w-full bg-transparent outline-none text-xs border-b border-border/30 py-1 cursor-pointer" /></div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-[10px] text-muted-foreground">Notes</label>
                            <textarea value={b.notes} onChange={(e) => setField(b.id, { notes: e.target.value })} rows={5} className="bg-transparent outline-none text-xs border border-border/30 rounded-lg p-2 resize-none placeholder:text-muted-foreground/30" placeholder="Your thoughts on this book..." />
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
