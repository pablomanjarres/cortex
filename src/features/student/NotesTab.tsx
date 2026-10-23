import { parseTags } from '@/lib/tags'
import { SearchInput } from '@/components/shared/SearchInput'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useState, useMemo, useEffect, useRef } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { useStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import {
  STUDY_NOTES_KEY, noteId, normalizeNotes, normText, getToday, fmtDate,
  type Course, type StudyNote,
} from './student-types'
import { Pin, PinOff, Pencil, Trash2 } from 'lucide-react'

const textareaCls = 'w-full resize-none px-3 py-2 text-sm leading-relaxed'


const autosize = (el: HTMLTextAreaElement) => {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })

// ── Component ────────────────────────────────────────────────────────────────

export function NotesTab() {
  const [rawNotes, updateNotes] = useStore<StudyNote[]>(STUDY_NOTES_KEY, [])
  const [courses] = useStore<Course[]>('cortex-student-courses', [])
  const [activeSemester] = useStore<string>('cortex-student-active-semester', '')

  // Normalize legacy/partial records at read time (never persisted back).
  const notes = useMemo(() => normalizeNotes(rawNotes), [rawNotes])
  const courseMap = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])) as Record<string, Course>, [courses])

  // Composer
  const [draft, setDraft] = useState('')
  const [courseSel, setCourseSel] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [pinDraft, setPinDraft] = useState(false)

  // Filters
  const [courseFilter, setCourseFilter] = useState<string | null>(null) // courseId, '' = General
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [search, setSearch] = useState('')

  const activeCourses = useMemo(() => courses.filter((c) => c.semester === activeSemester), [courses, activeSemester])
  const otherCourses = useMemo(() => courses.filter((c) => c.semester !== activeSemester), [courses, activeSemester])

  const save = () => {
    const text = draft.trim()
    if (!text) return
    const course = courseMap[courseSel]
    const note: StudyNote = {
      id: noteId(),
      ...(course ? { courseId: course.id, courseName: course.name } : {}),
      text,
      tags: parseTags(tagsInput),
      pinned: pinDraft,
      source: 'manual',
      createdAt: new Date().toISOString(),
    }
    updateNotes((prev) => [note, ...prev])
    setDraft('')
    setTagsInput('')
    setPinDraft(false)
  }

  const togglePin = (id: string) =>
    updateNotes((prev) => prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)))
  const editNote = (id: string, text: string) =>
    updateNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text, updatedAt: new Date().toISOString() } : n)))
  const deleteNote = (id: string) =>
    updateNotes((prev) => prev.filter((n) => n.id !== id))

  // Filter chips: every course that has notes (+ General for course-less notes)
  const chipData = useMemo(() => {
    const m = new Map<string, { id: string; label: string; count: number }>()
    for (const n of notes) {
      const id = n.courseId ?? ''
      const label = id === '' ? 'General' : (courseMap[id]?.name ?? n.courseName ?? id)
      const cur = m.get(id)
      if (cur) cur.count++
      else m.set(id, { id, label, count: 1 })
    }
    // Alphabetical; the General bucket goes last.
    return [...m.values()].sort((a, b) => (a.id === '' ? 1 : b.id === '' ? -1 : a.label.localeCompare(b.label)))
  }, [notes, courseMap])

  const filtered = useMemo(() => {
    const q = normText(search)
    return notes.filter((n) =>
      (courseFilter === null || (n.courseId ?? '') === courseFilter) &&
      (!pinnedOnly || n.pinned) &&
      (!q ||
        normText(n.text).includes(q) ||
        n.tags.some((t) => normText(t).includes(q)) ||
        (n.context ? normText(n.context).includes(q) : false)),
    )
  }, [notes, courseFilter, pinnedOnly, search])

  const pinnedNotes = useMemo(
    () => filtered.filter((n) => n.pinned).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [filtered],
  )

  // Day-grouped feed for the unpinned rest — TODAY / YESTERDAY / "JUL 12"
  const dayGroups = useMemo(() => {
    const rest = filtered.filter((n) => !n.pinned).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const groups: { day: string; items: StudyNote[] }[] = []
    for (const n of rest) {
      const day = localDate(new Date(n.createdAt))
      const last = groups[groups.length - 1]
      if (last && last.day === day) last.items.push(n)
      else groups.push({ day, items: [n] })
    }
    return groups
  }, [filtered])

  const dayLabel = (day: string) => {
    if (day === getToday()) return 'Today'
    const y = new Date()
    y.setDate(y.getDate() - 1)
    if (day === localDate(y)) return 'Yesterday'
    return fmtDate(day)
  }

  const courseNameOf = (n: StudyNote) =>
    n.courseId ? (courseMap[n.courseId]?.name ?? n.courseName ?? n.courseId) : null

  return (
    <PageShell>
      <PageHeader
        kicker="Cross-course"
        title="Study notes"
        subtitle={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'} · pinned first`}
      />

      {/* Composer */}
      <div className="surface rounded-xl p-4">
        <div className="flex flex-col gap-3">
          <Textarea aria-label="New study note"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); autosize(e.currentTarget) }}
            rows={2}
            placeholder="What did you just figure out?"
            className={textareaCls}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Note course" value={courseSel} onChange={(e) => setCourseSel(e.target.value)} className="h-8 cursor-pointer px-2 text-xs">
              <option value="">General</option>
              {activeCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              {otherCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input aria-label="Note tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="tags, comma separated"
              className="h-8 max-w-52 text-xs"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPinDraft((p) => !p)}
              aria-label={pinDraft ? 'Unpin this note' : 'Pin this note'}
              aria-pressed={pinDraft}
              className={pinDraft ? 'text-accent hover:text-accent' : undefined}
            >
              {pinDraft ? <Pin /> : <PinOff />}
            </Button>
            <Button size="sm" className="ml-auto" onClick={save} disabled={!draft.trim()}>
              Save note
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip selectable selected={courseFilter === null} onClick={() => setCourseFilter(null)}>All</Chip>
          {chipData.map((c) => (
            <Chip
              key={c.id || 'general'}
              selectable
              selected={courseFilter === c.id}
              onClick={() => setCourseFilter(courseFilter === c.id ? null : c.id)}
            >
              {c.label} ({c.count})
            </Chip>
          ))}
          <Chip selectable selected={pinnedOnly} onClick={() => setPinnedOnly((p) => !p)}>
            <Pin /> pinned
          </Chip>
        </div>
        <SearchInput label="Search notes" containerClassName="max-w-xs" placeholder="Search notes, tags…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 text-xs" />
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <EmptyState
          message={notes.length === 0 ? 'Nothing noted yet.' : 'Nothing matches these filters.'}
          hint={notes.length === 0 ? 'Say “save that” to Claude mid-session and it lands here.' : 'Loosen a chip or clear the search.'}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {pinnedNotes.length > 0 && (
            <section>
              <h3 className="mb-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                Pinned <span className="tabular-nums text-foreground-faint">· {pinnedNotes.length}</span>
              </h3>
              <div className="flex flex-col gap-3">
                {pinnedNotes.map((n) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    courseName={courseNameOf(n)}
                    onTogglePin={() => togglePin(n.id)}
                    onEdit={(text) => editNote(n.id, text)}
                    onDelete={() => deleteNote(n.id)}
                  />
                ))}
              </div>
            </section>
          )}
          {dayGroups.map((g) => (
            <section key={g.day}>
              <h3 className="mb-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                {dayLabel(g.day)} <span className="tabular-nums text-foreground-faint">· {g.items.length}</span>
              </h3>
              <div className="flex flex-col gap-3">
                {g.items.map((n) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    courseName={courseNameOf(n)}
                    onTogglePin={() => togglePin(n.id)}
                    onEdit={(text) => editNote(n.id, text)}
                    onDelete={() => deleteNote(n.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  )
}

// ── Note card ────────────────────────────────────────────────────────────────

function NoteCard({ note, courseName, onTogglePin, onEdit, onDelete }: {
  note: StudyNote
  courseName: string | null
  onTogglePin: () => void
  onEdit: (text: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.text)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && taRef.current) {
      autosize(taRef.current)
      taRef.current.focus()
      const len = taRef.current.value.length
      taRef.current.setSelectionRange(len, len)
    }
  }, [editing])

  const commit = () => {
    setEditing(false)
    const t = draft.trim()
    if (t && t !== note.text) onEdit(t)
    else setDraft(note.text)
  }

  const revealCls = 'opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100'

  return (
    <div
      className={cn(
        'group relative surface rounded-xl p-4',
        // Pinned = the 2px left indicator bar, never a tinted fill.
        note.pinned && 'pl-5 before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-accent',
      )}
    >
      {editing ? (
        <Textarea aria-label="Edit note"
          ref={taRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); autosize(e.currentTarget) }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setDraft(note.text); setEditing(false) }
          }}
          rows={2}
          className={textareaCls}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{note.text}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {courseName && <Chip size="sm">{courseName}</Chip>}
        {note.tags.map((t) => <Chip key={t} size="sm">{t}</Chip>)}
        <span className="font-mono text-2xs text-foreground-faint">· via {note.source}</span>
        {note.updatedAt && <span className="font-mono text-2xs text-foreground-faint">· edited</span>}
        <span className="ml-auto font-mono text-2xs tabular-nums text-foreground-faint">{timeOf(note.createdAt)}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onTogglePin}
            aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
            className={note.pinned ? undefined : revealCls}
          >
            {note.pinned ? <PinOff /> : <Pin />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => { setDraft(note.text); setEditing(true) }}
            aria-label="Edit note"
            className={revealCls}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDelete}
            aria-label="Delete note"
            className={cn(revealCls, 'hover:text-destructive')}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  )
}
