import { useState, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, Trash2, Star, Lightbulb, BookOpen } from 'lucide-react'
import { useStore } from '@/lib/store'

// ── Types ────────────────────────────────────────────────────────────────────

type Topic = 'Business' | 'Finance' | 'Personal' | 'Study' | 'Health' | 'Programming' | 'Love' | 'TODO' | 'Digital Marketing' | 'Job'

interface Thought {
  id: string
  name: string
  subline: string
  topic: Topic | ''
  book: string
  highValue: boolean
}

// ── Data ─────────────────────────────────────────────────────────────────────

const DEFAULT_THOUGHTS: Thought[] = [
  // Business
  { id: 't1', name: 'Corporaciones', subline: 'Proteger tus activos', topic: 'Business', book: '', highValue: false },
  { id: 't2', name: 'Canal de YouTube full IA', subline: 'AI video creation business idea', topic: 'Business', book: '', highValue: false },
  { id: 't3', name: 'Nichos para tiktok', subline: '', topic: 'Business', book: '', highValue: false },
  { id: 't4', name: "If you can't control your incomes in your business you're not the owner", subline: '', topic: 'Business', book: '', highValue: false },
  { id: 't5', name: 'Build a business that helps people solving a necessity', subline: "Not a business that will 'bring' money", topic: 'Business', book: '', highValue: false },
  { id: 't6', name: "Doesn't matter if there are several enterprises doing the same — you can do it BETTER", subline: '', topic: 'Business', book: '', highValue: false },
  // Finance
  { id: 't7', name: 'El miedo y el deseo ante el dinero son el peor enemigo', subline: '', topic: 'Finance', book: '', highValue: false },
  { id: 't8', name: 'Los ricos compran activos, los pobres pasivos con piel de oveja de activos', subline: '', topic: 'Finance', book: '', highValue: false },
  { id: 't9', name: 'Invertir se basa en el conocimiento', subline: '', topic: 'Finance', book: '', highValue: false },
  { id: 't10', name: 'Los ingresos pasivos pagan menos impuestos', subline: '', topic: 'Finance', book: '', highValue: false },
  { id: 't11', name: 'Convertir el ingreso ganado en ingreso pasivo o de portafolio', subline: '', topic: 'Finance', book: '', highValue: false },
  { id: 't12', name: 'No se requiere mucho dinero para ganar mucho dinero', subline: '', topic: 'Finance', book: '', highValue: false },
  { id: 't13', name: 'Como inversionistas debemos tener la mentalidad de coleccionistas de activos', subline: '', topic: 'Finance', book: '', highValue: false },
  { id: 't14', name: 'Tomar riesgos', subline: '', topic: 'Finance', book: '', highValue: false },
  { id: 't15', name: 'La compañía en la que debe invertir debe cumplir prueba objetiva de su sensatez subyacente', subline: 'Y diferente de la política seguida por la mayoría de los inversores especuladores', topic: 'Finance', book: 'The Intelligent Investor', highValue: false },
  // Personal - Negotiation (Never Split The Difference)
  { id: 't16', name: 'Bending their reality', subline: '1. Anchor emotions 2. Let them go first 3. Establish range 4. Pivot to non-monetary 5. Use odd numbers 6. Surprise with gift', topic: 'Personal', book: 'Never Split The Difference', highValue: true },
  { id: 't17', name: 'Great calibrated questions', subline: 'What about this is important to you? How can I help make this better? How would you like me to proceed? What is it that brought us into this situation?', topic: 'Personal', book: 'Never Split The Difference', highValue: true },
  { id: 't18', name: 'Strategy to get a good price', subline: '1. Set target price 2. Set first offer at 65% 3. Calculate raises (85, 95, 100%) 4. Use empathy before each 5. Use odd number 6. Throw in non-monetary item', topic: 'Personal', book: 'Never Split The Difference', highValue: true },
  { id: 't19', name: 'Use mirror — repeat what the other person said', subline: 'Simple technique with powerful results', topic: 'Personal', book: 'Never Split The Difference', highValue: false },
  { id: 't20', name: 'Negotiation is a process of discovery', subline: '', topic: 'Personal', book: 'Never Split The Difference', highValue: false },
  { id: 't21', name: "Saying 'No' makes the other person feel safe", subline: '', topic: 'Personal', book: 'Never Split The Difference', highValue: false },
  { id: 't22', name: 'A positive or playful voice must be your default voice', subline: '', topic: 'Personal', book: 'Never Split The Difference', highValue: false },
  { id: 't23', name: 'Only 7% of a message is words, 38% comes from tone of voice', subline: '', topic: 'Personal', book: 'Never Split The Difference', highValue: false },
  { id: 't24', name: "Your final price shouldn't be rounded — numbers like $32,451", subline: '', topic: 'Personal', book: 'Never Split The Difference', highValue: false },
  { id: 't25', name: 'People respond favorably to requests made in a reasonable tone', subline: '', topic: 'Personal', book: 'Never Split The Difference', highValue: false },
  // Personal - Success/Mindset
  { id: 't26', name: 'The seven laws', subline: '7 personal rules for success', topic: 'Personal', book: 'University of Success', highValue: true },
  { id: 't27', name: 'The only thing you can control is what you are thinking and feeling', subline: '', topic: 'Personal', book: 'University of Success', highValue: false },
  { id: 't28', name: 'The greatest power a person has is the power to choose', subline: '', topic: 'Personal', book: 'University of Success', highValue: false },
  { id: 't29', name: "Don't tell it, show it", subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't30', name: 'La amabilidad y la empatía convence a más personas que los insultos', subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't31', name: 'You are totally responsible for the results that you obtain', subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't32', name: 'Success is nothing without effort, satisfaction, joy and spirituality', subline: '', topic: 'Personal', book: 'University of Success', highValue: false },
  { id: 't33', name: 'Beat FAILURE: Frustration, Aggressiveness, Insecurity, Loneliness, Uncertainty, Resentment, Emptiness', subline: '', topic: 'Personal', book: 'University of Success', highValue: true },
  { id: 't34', name: 'The only limitations you will ever face are those you place upon yourself', subline: '', topic: 'Personal', book: 'University of Success', highValue: false },
  // Personal - Social/Charisma
  { id: 't35', name: 'Maintain your connections before using them', subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't36', name: 'When presenting yourself first talk about a problem you solve', subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't37', name: 'Show interest in the other person — ask about their day', subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't38', name: 'Do compliments on things the person can work on', subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't39', name: 'When talking show happiness, talk as if the person were 3 meters away', subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't40', name: 'Do not complain', subline: '', topic: 'Personal', book: '', highValue: false },
  // Personal - Spanish mindset
  { id: 't41', name: 'La riqueza empieza como un estado mental', subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't42', name: 'La FE es la clave de todo — pero sin esfuerzo no es nada', subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't43', name: 'La persistencia es la clave para la FE', subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't44', name: 'La derrota es temporal — reconstruye tu plan y ejecútalo', subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't45', name: 'Tomar decisiones rápidas pero inteligentes', subline: '', topic: 'Personal', book: '', highValue: false },
  { id: 't46', name: 'No ser egoísta como líder', subline: '', topic: 'Personal', book: '', highValue: false },
  // Study
  { id: 't47', name: 'Make an outline', subline: '', topic: 'Study', book: '', highValue: false },
  { id: 't48', name: 'Good paragraphs follow a structure', subline: '', topic: 'Study', book: '', highValue: false },
  { id: 't49', name: 'One paragraph, one point', subline: '', topic: 'Study', book: '', highValue: false },
  { id: 't50', name: 'Understand → Plan → Execute → Review', subline: 'Problem-solving methodology', topic: 'Study', book: '', highValue: false },
  // Programming
  { id: 't51', name: 'Deep ocean mod', subline: 'Detailed Minecraft mod concept', topic: 'Programming', book: '', highValue: true },
  // Health
  { id: 't52', name: 'Maintain a good posture all the time', subline: '', topic: 'Health', book: '', highValue: false },
  { id: 't53', name: 'Use the towel method while working to improve your jawline', subline: '', topic: 'Health', book: '', highValue: false },
]

// ── Books type (from shared store) ───────────────────────────────────────────

interface Book {
  id: string
  title: string
  author: string
}

const defaultBooks: Book[] = []

// ── Helpers ──────────────────────────────────────────────────────────────────

const ALL_TOPICS: Topic[] = ['Personal', 'Finance', 'Business', 'Study', 'Health', 'Programming', 'Love', 'TODO', 'Digital Marketing', 'Job']

const topicColor: Record<string, string> = {
  Personal: 'bg-purple-500/15 text-purple-400', Finance: 'bg-green-500/15 text-green-400',
  Business: 'bg-gray-500/15 text-gray-300', Study: 'bg-blue-500/15 text-blue-400',
  Health: 'bg-pink-500/15 text-pink-400', Programming: 'bg-orange-500/15 text-orange-400',
  Love: 'bg-red-500/15 text-red-400', TODO: 'bg-yellow-500/15 text-yellow-400',
  'Digital Marketing': 'bg-cyan-500/15 text-cyan-400', Job: 'bg-amber-500/15 text-amber-400',
}

// ── Component ────────────────────────────────────────────────────────────────

export function ThoughtsPage() {
  const [thoughts, updateThoughts] = useStore<Thought[]>('cortex-thoughts', DEFAULT_THOUGHTS)
  const [books] = useStore<Book[]>('cortex-books', defaultBooks)
  const [search, setSearch] = useState('')
  const [filterTopic, setFilterTopic] = useState<string | null>(null)
  const [filterBook, setFilterBook] = useState<string | null>(null)
  const [filterHV, setFilterHV] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const update = updateThoughts

  const setField = (id: string, f: Partial<Thought>) => update((p) => p.map((t) => t.id === id ? { ...t, ...f } : t))
  const deleteThought = (id: string) => { update((p) => p.filter((t) => t.id !== id)); if (expanded === id) setExpanded(null) }
  const addThought = () => {
    const t: Thought = { id: `th-${Date.now()}`, name: '', subline: '', topic: 'Personal', book: '', highValue: false }
    update((p) => [t, ...p]); setExpanded(t.id)
  }

  const filtered = useMemo(() =>
    thoughts
      .filter((t) =>
        (!filterTopic || t.topic === filterTopic) &&
        (!filterHV || t.highValue) &&
        (!filterBook || t.book === filterBook)
      )
      .filter((t) => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.subline.toLowerCase().includes(search.toLowerCase())),
    [thoughts, filterTopic, filterHV, filterBook, search],
  )

  const topicCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of thoughts) { m[t.topic || 'None'] = (m[t.topic || 'None'] || 0) + 1 }
    return m
  }, [thoughts])

  // Books that have thoughts linked to them
  const bookCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of thoughts) { if (t.book) m[t.book] = (m[t.book] || 0) + 1 }
    return m
  }, [thoughts])

  const booksWithThoughts = useMemo(() =>
    Object.entries(bookCounts).sort((a, b) => b[1] - a[1]),
    [bookCounts]
  )

  return (
    <PageShell>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
          <Lightbulb className="h-5 w-5 text-yellow-400" />
          <div>
            <p className="text-xl font-bold tabular-nums">{thoughts.length}</p>
            <p className="text-[10px] text-muted-foreground">Total ideas</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
          <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
          <div>
            <p className="text-xl font-bold tabular-nums text-yellow-400">{thoughts.filter((t) => t.highValue).length}</p>
            <p className="text-[10px] text-muted-foreground">High-value</p>
          </div>
        </div>
        {ALL_TOPICS.slice(0, 2).map((topic) => (
          <div key={topic} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
            <div className={`h-2.5 w-2.5 rounded-full ${topicColor[topic]?.replace('bg-', 'bg-').split(' ')[0]}`} />
            <div>
              <p className="text-xl font-bold tabular-nums">{topicCounts[topic] || 0}</p>
              <p className="text-[10px] text-muted-foreground">{topic}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-lg border border-border px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search thoughts..." className="bg-transparent outline-none text-xs flex-1 placeholder:text-muted-foreground/40" />
        </div>
        <button onClick={() => setFilterHV(!filterHV)}
          className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all flex items-center gap-1 ${filterHV ? 'bg-yellow-500/15 text-yellow-400 border-yellow-400/20' : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
          <Star className={`h-3 w-3 ${filterHV ? 'fill-yellow-400' : ''}`} /> High-value
        </button>
        <div className="flex gap-1.5 flex-wrap">
          {ALL_TOPICS.map((topic) => (
            <button key={topic} onClick={() => setFilterTopic(filterTopic === topic ? null : topic)}
              className={`cursor-pointer text-[10px] px-2 py-1 rounded-full border transition-all ${filterTopic === topic ? `${topicColor[topic]} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
              {topic} ({topicCounts[topic] || 0})
            </button>
          ))}
        </div>
        <button onClick={addThought} className="cursor-pointer flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-lg border border-border hover:bg-secondary transition-all">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {/* Book filter */}
      {booksWithThoughts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <BookOpen className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
          <div className="flex gap-1.5 flex-wrap">
            {booksWithThoughts.map(([book, count]) => (
              <button key={book} onClick={() => setFilterBook(filterBook === book ? null : book)}
                className={`cursor-pointer text-[10px] px-2 py-1 rounded-full border transition-all ${
                  filterBook === book ? 'bg-amber-500/15 text-amber-400 border-amber-400/20' : 'border-border text-muted-foreground/40 hover:text-muted-foreground'
                }`}>
                {book} ({count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Thoughts List */}
      <WidgetCard title="Ideas" description={`${filtered.length} thoughts`} delay={0.1}>
        <div className="flex flex-col gap-1">
          {filtered.map((t) => (
            <div key={t.id} className="group">
              <div
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                className={`cursor-pointer flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary/30 ${expanded === t.id ? 'bg-secondary/20' : ''}`}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setField(t.id, { highValue: !t.highValue }) }}
                  className="cursor-pointer shrink-0 mt-0.5"
                >
                  <Star className={`h-3.5 w-3.5 ${t.highValue ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/20 hover:text-yellow-400/50'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">{t.name || 'Untitled'}</p>
                  {t.subline && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{t.subline}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.book && <span className="text-[9px] text-muted-foreground/60">{t.book}</span>}
                  {t.topic && <Badge className={`text-[8px] px-1.5 py-0 ${topicColor[t.topic]}`}>{t.topic}</Badge>}
                  <button onClick={(e) => { e.stopPropagation(); deleteThought(t.id) }} className="cursor-pointer opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400 transition-all">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {expanded === t.id && (
                <div className="px-3 py-3 ml-6 border-l border-border/30 mb-1">
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <input value={t.name} onChange={(e) => setField(t.id, { name: e.target.value })} placeholder="Thought..." className="bg-transparent outline-none text-sm font-medium border-b border-border/30 pb-1 placeholder:text-muted-foreground/30" />
                      <textarea value={t.subline} onChange={(e) => setField(t.id, { subline: e.target.value })} rows={3} placeholder="Details..." className="bg-transparent outline-none text-xs border border-border/30 rounded-lg p-2 resize-none placeholder:text-muted-foreground/30" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div><label className="text-[10px] text-muted-foreground">Topic</label>
                        <select value={t.topic} onChange={(e) => setField(t.id, { topic: e.target.value as Topic })} className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">
                          <option value="">None</option>
                          {ALL_TOPICS.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
                        </select></div>
                      <div><label className="text-[10px] text-muted-foreground">Book source</label>
                        <select value={t.book} onChange={(e) => setField(t.id, { book: e.target.value })}
                          className="cursor-pointer w-full bg-transparent outline-none text-xs border-b border-border/30 py-1">
                          <option value="">No book</option>
                          {books.map((b) => <option key={b.id} value={b.title}>{b.title}</option>)}
                          {/* Show current value if not in books list */}
                          {t.book && !books.some((b) => b.title === t.book) && (
                            <option value={t.book}>{t.book}</option>
                          )}
                        </select></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </WidgetCard>
    </PageShell>
  )
}
