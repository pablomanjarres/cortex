import { useState, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
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

// Shared token style for native <select> controls (mirrors the Input primitive).
const selectCls =
  'w-full h-8 cursor-pointer rounded-md border border-input bg-input/20 px-2 text-xs text-foreground transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const labelCls = 'text-2xs text-muted-foreground'

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
        <StatTile label="Total ideas" value={thoughts.length} icon={<Lightbulb />} />
        <StatTile label="High-value" value={thoughts.filter((t) => t.highValue).length} icon={<Star />} />
        {ALL_TOPICS.slice(0, 2).map((topic) => (
          <StatTile key={topic} label={topic} value={topicCounts[topic] || 0} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search thoughts..." className="h-8 pl-8 text-xs" />
        </div>
        <Chip selectable selected={filterHV} onClick={() => setFilterHV(!filterHV)}>
          <Star className={filterHV ? 'fill-accent' : ''} /> High-value
        </Chip>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TOPICS.map((topic) => (
            <Chip key={topic} selectable selected={filterTopic === topic} onClick={() => setFilterTopic(filterTopic === topic ? null : topic)}>
              {topic} ({topicCounts[topic] || 0})
            </Chip>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={addThought}>
          <Plus /> Add
        </Button>
      </div>

      {/* Book filter */}
      {booksWithThoughts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-foreground-faint" />
          <div className="flex flex-wrap gap-1.5">
            {booksWithThoughts.map(([book, count]) => (
              <Chip key={book} selectable selected={filterBook === book} onClick={() => setFilterBook(filterBook === book ? null : book)}>
                {book} ({count})
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Thoughts List */}
      <WidgetCard title="Ideas" description={`${filtered.length} thoughts`} delay={0.1}>
        {filtered.length === 0 ? (
          <EmptyState message="No thoughts match." hint="Clear a filter, or press Add to keep a new one." />
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((t) => (
              <div key={t.id} className="group">
                <div
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  className={`flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-secondary/30 ${expanded === t.id ? 'bg-secondary/20' : ''}`}
                >
                  {/* Compact inline toggle: the high-value star marker (accent = marked). */}
                  <button
                    aria-label={t.highValue ? 'Unmark high-value' : 'Mark high-value'}
                    aria-pressed={t.highValue}
                    onClick={(e) => { e.stopPropagation(); setField(t.id, { highValue: !t.highValue }) }}
                    className="mt-0.5 shrink-0 cursor-pointer"
                  >
                    <Star className={`h-3.5 w-3.5 transition-colors ${t.highValue ? 'fill-accent text-accent' : 'text-foreground-faint/40 hover:text-accent/60'}`} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{t.name || 'Untitled'}</p>
                    {t.subline && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.subline}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.book && <span className="text-2xs text-foreground-faint">{t.book}</span>}
                    {t.topic && <Chip size="sm">{t.topic}</Chip>}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Delete thought"
                      className="opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); deleteThought(t.id) }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {expanded === t.id && (
                  <div className="mb-1 ml-6 border-l border-border/60 px-3 py-3">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <input value={t.name} onChange={(e) => setField(t.id, { name: e.target.value })} placeholder="Thought..." className="border-b border-border/60 bg-transparent pb-1 text-sm font-medium outline-none placeholder:text-foreground-faint" />
                        <textarea value={t.subline} onChange={(e) => setField(t.id, { subline: e.target.value })} rows={3} placeholder="Details..." className="resize-none rounded-md border border-input bg-input/20 p-2 text-xs outline-none placeholder:text-foreground-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <div><label className={labelCls}>Topic</label>
                          <select value={t.topic} onChange={(e) => setField(t.id, { topic: e.target.value as Topic })} className={selectCls}>
                            <option value="">None</option>
                            {ALL_TOPICS.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
                          </select></div>
                        <div><label className={labelCls}>Book source</label>
                          <select value={t.book} onChange={(e) => setField(t.id, { book: e.target.value })} className={selectCls}>
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
        )}
      </WidgetCard>
    </PageShell>
  )
}
