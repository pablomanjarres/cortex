import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CoursesPage } from '@/features/courses/CoursesPage'
import { CapturesPage } from '@/features/captures/CapturesPage'
import { ThoughtsPage } from '@/features/thoughts/ThoughtsPage'

type Kind = 'all' | 'courses' | 'captures'

const KINDS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'courses', label: 'Courses' },
  { id: 'captures', label: 'Captures' },
]

// The merged Courses + Captures collection: one page, one type filter. "All"
// shows both together; the two source pages are reused as-is so their upload,
// PDF viewer, lightbox, and paste-to-capture behaviour are preserved. The
// system Tabs here act purely as the segmented type filter (no panels).
function kindFromSearch(search: string): Kind {
  const kind = new URLSearchParams(search).get('kind')
  return kind === 'courses' || kind === 'captures' ? kind : 'all'
}

function LibraryCollection({ initialKind }: { initialKind: Kind }) {
  const [kind, setKind] = useState<Kind>(initialKind)

  return (
    <div className="flex flex-col gap-6">
      <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
        <TabsList>
          {KINDS.map((k) => (
            <TabsTrigger key={k.id} value={k.id}>
              {k.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {(kind === 'all' || kind === 'courses') && <CoursesPage />}
      {(kind === 'all' || kind === 'captures') && <CapturesPage />}
    </div>
  )
}

// Library section — the merged Courses+Captures collection, with Thoughts as a
// separate (not merged) sub-page tab.
export function LibraryPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const kind = kindFromSearch(location.search)
  const hasKindQuery = new URLSearchParams(location.search).has('kind')
  const [section, setSection] = useState<'collection' | 'thoughts'>('collection')
  const activeSection = hasKindQuery ? 'collection' : section

  function setActiveSection(value: string) {
    const next = value === 'thoughts' ? 'thoughts' : 'collection'
    setSection(next)
    if (next === 'thoughts' && hasKindQuery) navigate('/library')
  }

  return (
    <Tabs value={activeSection} onValueChange={setActiveSection}>
      <TabsList>
        <TabsTrigger value="collection">Collection</TabsTrigger>
        <TabsTrigger value="thoughts">Thoughts</TabsTrigger>
      </TabsList>
      <TabsContent value="collection">
        <LibraryCollection key={kind} initialKind={kind} />
      </TabsContent>
      <TabsContent value="thoughts">
        <ThoughtsPage />
      </TabsContent>
    </Tabs>
  )
}
