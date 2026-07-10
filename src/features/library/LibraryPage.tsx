import { useState } from 'react'
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
function LibraryCollection() {
  const [kind, setKind] = useState<Kind>('all')
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
  return (
    <Tabs defaultValue="collection">
      <TabsList>
        <TabsTrigger value="collection">Collection</TabsTrigger>
        <TabsTrigger value="thoughts">Thoughts</TabsTrigger>
      </TabsList>
      <TabsContent value="collection">
        <LibraryCollection />
      </TabsContent>
      <TabsContent value="thoughts">
        <ThoughtsPage />
      </TabsContent>
    </Tabs>
  )
}
