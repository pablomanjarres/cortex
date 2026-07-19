import { useState, useMemo, useRef, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { useStore, readStore, updateStoreValue } from '@/lib/store'
import { deleteFile } from '@/lib/media'
import { syncAssignmentToCalendar } from '@/lib/calendar-sync'
import { ClassSchedule } from './ClassSchedule'
import { DEFAULT_ASSIGNMENTS, DEFAULT_COURSES, DEFAULT_SEMESTERS, DEFAULT_TOPICS } from './student-defaults'
import { ICONS, ICON_CYCLE, ICON_OPTIONS } from './course-icons'
import {
  CLASS_MATERIALS_KEY, STUDY_NOTES_KEY, getToday, daysUntil, fmtDate,
  type Assignment, type AssignmentType, type ClassMaterial, type Course, type CourseStatus,
  type Difficulty, type Priority, type SortKey, type StudyNote, type Topic, type TopicStatus,
} from './student-types'
import {
  GraduationCap,
  CalendarDays,
  AlertCircle,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Plus,
  X,
  Trash2,
} from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────

const ALL_TYPES: AssignmentType[] = ['Exam', 'Quiz', 'Lab', 'Project', 'Presentation', 'Attendance']
const ALL_DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']
const ALL_STATUSES: CourseStatus[] = ['Normal', 'At risk', 'Under Control']

// Difficulty is a risk STATUS → semantic chip variants / ink.
const diffVariant: Record<Difficulty, 'danger' | 'warning' | 'success'> = { Hard: 'danger', Medium: 'warning', Easy: 'success' }
const diffInk: Record<Difficulty, string> = { Hard: 'text-destructive', Medium: 'text-warning', Easy: 'text-success' }
// Topic progression reads as ink strength; only full mastery earns a semantic color.
const topicStatusInk: Record<TopicStatus, string> = {
  'Not seen': 'text-foreground-faint', Previewed: 'text-muted-foreground', Seen: 'text-muted-foreground',
  Practiced: 'text-foreground', Mastered: 'text-success',
}
/** Pass grade ink — Colombian scale, 3.0 is the pass mark. */
const gradeInk = (g: number) => (g >= 3 ? 'text-success' : 'text-destructive')
/** Deadline proximity → semantic urgency (danger ≤ 2d, warning ≤ 7d). */
const deadlineUrgency = (days: number): 'danger' | 'warning' | 'neutral' =>
  days <= 2 ? 'danger' : days <= 7 ? 'warning' : 'neutral'

// Shared token style for native <select> controls (mirrors the Input primitive;
// the global :focus-visible rule supplies the focus ring).
const selectCls =
  'cursor-pointer rounded-md border border-input bg-input/20 text-foreground transition-colors duration-150 outline-none'

/** Property row in the course detail panel (static — module scope keeps children state stable). */
function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-1.5">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-xs">{children}</span>
    </div>
  )
}

/** Sort direction glyph for the assignments table header. */
function SortIcon({ k, sortKey, sortAsc }: { k: SortKey; sortKey: SortKey; sortAsc: boolean }) {
  return sortKey === k
    ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
    : <ArrowUpDown className="h-3 w-3 opacity-30" />
}

function cmp(a: Assignment, b: Assignment, key: SortKey, asc: boolean): number {
  let v = 0
  switch (key) {
    case 'deadline': v = (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'); break
    case 'weight': v = a.weight - b.weight; break
    case 'grade': v = (a.grade ?? -1) - (b.grade ?? -1); break
    case 'name': v = a.name.localeCompare(b.name); break
  }
  return asc ? v : -v
}

// ── Inline Edit Cells ─────────────────────────────────────────────────────────
// Click-to-edit table cells are a documented compact pattern: a <Button>'s fixed
// height and centered inline-flex layout doesn't fit dense table cells, so these
// stay bare elements; the global :focus-visible rule supplies their focus rings.

function EditableGrade({ value, onChange }: { value?: number; onChange: (v?: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value?.toFixed(1) ?? '')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    const n = parseFloat(draft)
    if (draft === '' || draft === '-') onChange(undefined)
    else if (!isNaN(n) && n >= 0 && n <= 5) onChange(Math.round(n * 10) / 10)
  }

  if (!editing) {
    return (
      <button onClick={() => { setDraft(value?.toFixed(1) ?? ''); setEditing(true) }} className="w-full cursor-pointer text-right font-mono tabular-nums">
        {value !== undefined ? (
          <span className={gradeInk(value)}>{value.toFixed(1)}</span>
        ) : (
          <span className="text-foreground-faint">—</span>
        )}
      </button>
    )
  }

  return (
    <input
      ref={ref}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="w-12 border-b border-input bg-transparent text-right font-mono text-xs tabular-nums outline-none"
      placeholder="0-5"
    />
  )
}

function EditableNumber({ value, suffix, onChange }: { value: number; suffix?: string; onChange: (v?: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value % 1 === 0 ? value.toFixed(0) : value.toFixed(1))
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    const n = parseFloat(draft)
    if (!isNaN(n) && n >= 0) onChange(Math.round(n * 10) / 10)
  }

  if (!editing) {
    return (
      <button onClick={() => { setDraft(value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)); setEditing(true) }} className="cursor-pointer text-right font-mono tabular-nums text-muted-foreground">
        {value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}{suffix}
      </button>
    )
  }

  return (
    <input
      ref={ref}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="w-10 border-b border-input bg-transparent text-right font-mono text-xs tabular-nums outline-none"
    />
  )
}

// ── Add Assignment row ────────────────────────────────────────────────────────

function AddRow({ courseId, onAdd, onCancel }: { courseId: string; onAdd: (a: Assignment) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<AssignmentType>('Exam')
  const [weight, setWeight] = useState('')
  const [deadline, setDeadline] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  const submit = () => {
    if (!name.trim()) return
    onAdd({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      courseId,
      type,
      weight: parseFloat(weight) / 100 || 0,
      deadline: deadline || undefined,
      done: false,
      priority: 'Medium',
    })
  }

  return (
    <tr className="border-b border-border/60 bg-muted/20">
      <td className="px-4 py-2"><Plus className="h-3.5 w-3.5 text-muted-foreground" /></td>
      <td className="py-2">
        <input
          ref={ref}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
          placeholder="Assignment name..."
          className="w-full bg-transparent text-xs font-medium outline-none placeholder:text-foreground-faint"
        />
      </td>
      <td className="py-2">
        <select value={type} onChange={(e) => setType(e.target.value as AssignmentType)} className={`${selectCls} h-6 px-1.5 font-mono text-2xs`}>
          {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td className="py-2 text-right">
        <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="%" className="w-10 bg-transparent text-right font-mono text-xs tabular-nums outline-none placeholder:text-foreground-faint" />
      </td>
      <td className="py-2" />
      <td className="py-2 text-right">
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="cursor-pointer bg-transparent font-mono text-2xs tabular-nums outline-none" />
      </td>
      <td className="py-2 pl-2">
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-xs" onClick={submit} aria-label="Add assignment" className="text-success hover:text-success"><CheckCircle2 /></Button>
          <Button variant="ghost" size="icon-xs" onClick={onCancel} aria-label="Cancel"><X /></Button>
        </div>
      </td>
    </tr>
  )
}

// ── Course Detail Panel ──────────────────────────────────────────────────────

function CourseDetail({ course, assignments, topics, semesters, onUpdateTopics, onUpdateCourse, onDeleteCourse, onAddAssignment }: {
  course: Course
  assignments: Assignment[]
  topics: Topic[]
  semesters: string[]
  onUpdateTopics: (fn: (prev: Topic[]) => Topic[]) => void
  onUpdateCourse: (patch: Partial<Course>) => void
  onDeleteCourse: () => void
  onAddAssignment: () => void
}) {
  const [addingTopic, setAddingTopic] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(course.name)
  const newRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (addingTopic) newRef.current?.focus() }, [addingTopic])
  useEffect(() => { if (editingName) nameRef.current?.focus() }, [editingName])

  const Icon = ICONS[course.iconKey] ?? GraduationCap
  const mine = assignments.filter((a) => a.courseId === course.id)
  const myTopics = topics.filter((t) => t.courseId === course.id)
  const totalWeight = mine.reduce((s, a) => s + a.weight, 0)
  const graded = mine.filter((a) => a.grade !== undefined)
  const gradedWeight = graded.reduce((s, a) => s + a.weight, 0)
  const gradedPct = totalWeight > 0 ? (gradedWeight / totalWeight) * 100 : 0
  const currentGrade = gradedWeight > 0 ? graded.reduce((s, a) => s + a.grade! * a.weight, 0) / gradedWeight : undefined
  const ungradedWeight = mine.filter((a) => a.grade === undefined).reduce((s, a) => s + a.weight, 0)
  const gradedSum = graded.reduce((s, a) => s + a.grade! * a.weight, 0)
  const maxGrade = totalWeight > 0 ? (gradedSum + 5.0 * ungradedWeight) / totalWeight : 5.0
  const minGrade = totalWeight > 0 ? gradedSum / totalWeight : 0

  const commitName = () => {
    setEditingName(false)
    if (draftName.trim() && draftName.trim() !== course.name) onUpdateCourse({ name: draftName.trim() })
    else setDraftName(course.name)
  }

  const cycleIcon = () => {
    const idx = ICON_OPTIONS.indexOf(course.iconKey)
    onUpdateCourse({ iconKey: ICON_OPTIONS[(idx + 1) % ICON_OPTIONS.length] })
  }

  const addTopic = () => {
    if (!newTopicName.trim()) return
    onUpdateTopics((prev) => [...prev, {
      id: `topic-${Date.now()}`, name: newTopicName.trim(), courseId: course.id,
      chapter: '', types: ['Concept'], mastery: 0, status: 'Not seen' as TopicStatus, priority: 'Medium' as Priority,
    }])
    setNewTopicName('')
    setAddingTopic(false)
  }

  const deleteTopic = (id: string) => onUpdateTopics((prev) => prev.filter((t) => t.id !== id))

  const cycleMastery = (id: string) => {
    const statusOrder: TopicStatus[] = ['Not seen', 'Previewed', 'Seen', 'Practiced', 'Mastered']
    onUpdateTopics((prev) => prev.map((t) => {
      if (t.id !== id) return t
      const idx = statusOrder.indexOf(t.status)
      const next = statusOrder[(idx + 1) % statusOrder.length]
      const mastery = Math.min(10, Math.round(((idx + 1) % statusOrder.length) / 4 * 10))
      return { ...t, status: next, mastery }
    }))
  }

  return (
    <div className="surface rounded-xl p-4 duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={cycleIcon} title="Change icon" aria-label="Change icon">
          <Icon className="size-4 text-accent" />
        </Button>
        {editingName ? (
          <input
            ref={nameRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setDraftName(course.name); setEditingName(false) } }}
            className="border-b border-input bg-transparent text-base font-semibold outline-none"
          />
        ) : (
          /* Click-to-edit title — documented compact pattern (bare text button). */
          <button onClick={() => { setDraftName(course.name); setEditingName(true) }} className="cursor-pointer text-base font-semibold transition-colors hover:text-muted-foreground">{course.name}</button>
        )}
        <Chip variant={diffVariant[course.difficulty]} size="sm">{course.difficulty}</Chip>
        <Button variant="secondary" size="sm" onClick={onAddAssignment} className="ml-auto">
          <Plus /> Assignment
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDeleteCourse} title="Delete course" aria-label="Delete course" className="hover:text-destructive">
          <Trash2 />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Properties */}
        <div className="flex flex-col sm:border-r sm:border-border/60 sm:pr-6">
          <Prop label="Semester">
            <select
              value={course.semester}
              onChange={(e) => onUpdateCourse({ semester: e.target.value })}
              className={`${selectCls} h-6 px-1.5 font-mono text-2xs`}
            >
              {semesters.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Prop>
          <Prop label="Credits"><EditableNumber value={course.credits} onChange={(v) => onUpdateCourse({ credits: v ?? course.credits })} /></Prop>
          <Prop label="Status">
            <select
              value={course.status}
              onChange={(e) => onUpdateCourse({ status: e.target.value as CourseStatus })}
              className={`${selectCls} h-6 px-1.5 font-mono text-2xs`}
            >
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Prop>
          <Prop label="Difficulty">
            <select
              value={course.difficulty}
              onChange={(e) => onUpdateCourse({ difficulty: e.target.value as Difficulty })}
              className={`${selectCls} h-6 px-1.5 font-mono text-2xs ${diffInk[course.difficulty]}`}
            >
              {ALL_DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Prop>
          <Prop label="Current Grade">
            {currentGrade !== undefined ? (
              <span className={`font-mono text-sm font-medium tabular-nums ${gradeInk(currentGrade)}`}>{currentGrade.toFixed(2)}/5.0</span>
            ) : (
              <span className="text-muted-foreground">No grades yet</span>
            )}
          </Prop>
          <Prop label="Best Possible"><span className="font-mono font-medium tabular-nums text-success">{maxGrade.toFixed(2)}/5.0</span></Prop>
          <Prop label="Worst Possible"><span className={`font-mono font-medium tabular-nums ${gradeInk(minGrade)}`}>{minGrade.toFixed(2)}/5.0</span></Prop>
          <Prop label="Graded">
            <div className="flex items-center gap-2">
              <span className="font-mono tabular-nums">{gradedPct.toFixed(0)}%</span>
              <div className="h-1 w-24 overflow-hidden rounded-full bg-muted/60">
                <div className="h-full rounded-full bg-success transition-all" style={{ width: `${gradedPct}%` }} />
              </div>
            </div>
          </Prop>
        </div>

        {/* Topics */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Topics</h3>
            <Button variant="ghost" size="xs" onClick={() => setAddingTopic(true)}><Plus /> Add</Button>
          </div>
          {myTopics.length === 0 && !addingTopic && (
            <p className="py-2 text-xs text-foreground-faint">No topics yet</p>
          )}
          <div className="flex flex-col gap-1.5">
            {myTopics.map((t) => (
              <div key={t.id} className="group flex items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-secondary/30">
                <Button variant="ghost" size="icon-xs" onClick={() => cycleMastery(t.id)} aria-label={`Cycle mastery — currently ${t.status}`} className="shrink-0">
                  <div className={`size-3.5 rounded-full border ${t.status === 'Mastered' ? 'border-success bg-success' : 'border-input'}`} />
                </Button>
                <span className="flex-1 text-xs font-medium">{t.name}</span>
                {t.chapter && <span className="font-mono text-2xs text-foreground-faint">{t.chapter}</span>}
                {t.types.map((tp) => (
                  <Chip key={tp} size="sm">{tp}</Chip>
                ))}
                <span className={`font-mono text-2xs ${topicStatusInk[t.status]}`}>{t.status}</span>
                {t.priority !== 'Medium' && <Chip size="sm" variant={t.priority === 'High' ? 'warning' : 'neutral'}>{t.priority}</Chip>}
                <Button variant="ghost" size="icon-xs" onClick={() => deleteTopic(t.id)} aria-label={`Delete ${t.name}`} className="opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"><Trash2 /></Button>
              </div>
            ))}
            {addingTopic && (
              <div className="flex items-center gap-2 px-3 py-2">
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={newRef}
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTopic(); if (e.key === 'Escape') setAddingTopic(false) }}
                  placeholder="Topic name..."
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-foreground-faint"
                />
                <Button variant="ghost" size="icon-xs" onClick={addTopic} aria-label="Add topic" className="text-success hover:text-success"><CheckCircle2 /></Button>
                <Button variant="ghost" size="icon-xs" onClick={() => setAddingTopic(false)} aria-label="Cancel"><X /></Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="mt-5 border-t border-border/60 pt-4">
        <h3 className="mb-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground">Notes</h3>
        <textarea
          value={course.notes ?? ''}
          onChange={(e) => onUpdateCourse({ notes: e.target.value })}
          placeholder="Class notes, formulas, reminders… (autosaves)"
          className="min-h-[140px] w-full resize-y rounded-md border border-input bg-input/20 px-3 py-2 text-xs leading-relaxed outline-none transition-colors placeholder:text-foreground-faint"
        />
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function StudentPage() {
  // Force re-render every minute so countdowns update in real-time
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    const onFocus = () => setTick((t) => t + 1)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [])

  const [assignments, updateAssignments] = useStore<Assignment[]>('cortex-student-assignments', DEFAULT_ASSIGNMENTS)
  const [topics, updateTopics] = useStore<Topic[]>('cortex-student-topics', DEFAULT_TOPICS)
  const [courses, updateCourses] = useStore<Course[]>('cortex-student-courses', DEFAULT_COURSES)
  const [semesters, updateSemesters] = useStore<string[]>('cortex-student-semesters', DEFAULT_SEMESTERS)
  const [activeSemester, setActiveSemester] = useStore<string>('cortex-student-active-semester', DEFAULT_SEMESTERS[0])

  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<Set<AssignmentType>>(new Set(ALL_TYPES))
  const [sortKey, setSortKey] = useState<SortKey>('deadline')
  const [sortAsc, setSortAsc] = useState(true)
  const [adding, setAdding] = useState(false)
  const [addingCourse, setAddingCourse] = useState(false)
  const [newCourseName, setNewCourseName] = useState('')
  const [addingSemester, setAddingSemester] = useState(false)
  const [newSemesterName, setNewSemesterName] = useState('')

  const update = updateAssignments
  const courseAddRef = useRef<HTMLInputElement>(null)
  const semAddRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (addingCourse) courseAddRef.current?.focus() }, [addingCourse])
  useEffect(() => { if (addingSemester) semAddRef.current?.focus() }, [addingSemester])

  const courseMap = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])) as Record<string, Course>, [courses])

  // ── Active semester scoping ──
  const activeCourses = useMemo(() => courses.filter((c) => c.semester === activeSemester), [courses, activeSemester])
  const activeCourseIds = useMemo(() => new Set(activeCourses.map((c) => c.id)), [activeCourses])
  const semesterAssignments = useMemo(() => assignments.filter((a) => activeCourseIds.has(a.courseId)), [assignments, activeCourseIds])

  const changeSemester = (s: string) => {
    setActiveSemester(() => s)
    setSelectedCourse(null)
    setSelectedTypes(new Set(ALL_TYPES))
    setAdding(false)
    setAddingCourse(false)
  }

  // ── Semester management ──
  const addSemester = () => {
    const n = newSemesterName.trim()
    setAddingSemester(false)
    setNewSemesterName('')
    if (!n) return
    updateSemesters((p) => (p.includes(n) ? p : [n, ...p]))
    changeSemester(n)
  }
  const deleteSemester = (name: string) => {
    if (courses.some((c) => c.semester === name)) return // only delete empty semesters
    updateSemesters((p) => p.filter((s) => s !== name))
    if (activeSemester === name) {
      const next = semesters.filter((s) => s !== name)[0] ?? ''
      changeSemester(next)
    }
  }

  // ── Course management ──
  const updateCourse = (id: string, patch: Partial<Course>) =>
    updateCourses((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const addCourse = () => {
    const n = newCourseName.trim()
    setAddingCourse(false)
    setNewCourseName('')
    if (!n) return
    const idx = courses.length
    const iconKey = ICON_CYCLE[idx % ICON_CYCLE.length]
    const id = `course-${Date.now()}`
    updateCourses((p) => [...p, { id, name: n, difficulty: 'Medium', iconKey, semester: activeSemester, status: 'Normal', credits: 3 }])
    setSelectedCourse(id)
  }
  const deleteCourse = (id: string) => {
    const related = assignments.filter((a) => a.courseId === id)
    related.forEach((a) => { if (a.deadline && !a.done) syncAssignmentToCalendar(a, courseMap[id]?.name || id, 'delete') })
    update((p) => p.filter((a) => a.courseId !== id))
    updateTopics((p) => p.filter((t) => t.courseId !== id))
    updateCourses((p) => p.filter((c) => c.id !== id))
    // Cascade: purge the course's class materials (best-effort file bytes too) and study notes.
    void readStore<ClassMaterial[]>(CLASS_MATERIALS_KEY, []).then((mats) => {
      for (const m of mats) if (m.courseId === id && m.file?.mediaId) void deleteFile(m.file.mediaId)
    })
    updateStoreValue<ClassMaterial[]>(CLASS_MATERIALS_KEY, [], (prev) => prev.filter((m) => m.courseId !== id))
    updateStoreValue<StudyNote[]>(STUDY_NOTES_KEY, [], (prev) => prev.filter((n) => n.courseId !== id))
    if (selectedCourse === id) setSelectedCourse(null)
  }

  // ── Assignment handlers ──
  const toggleDone = (id: string) => update((p) => p.map((a) => a.id === id ? { ...a, done: !a.done } : a))
  const setGrade = (id: string, grade?: number) => update((p) => p.map((a) => a.id === id ? { ...a, grade, done: grade !== undefined ? true : a.done } : a))
  const setField = (id: string, field: Partial<Assignment>) => update((p) => p.map((a) => a.id === id ? { ...a, ...field } : a))
  const deleteAssignment = (id: string) => {
    const a = assignments.find((x) => x.id === id)
    if (a) syncAssignmentToCalendar(a, courseMap[a.courseId]?.name || a.courseId, 'delete')
    update((p) => p.filter((x) => x.id !== id))
  }
  const addAssignment = (a: Assignment) => {
    update((p) => [...p, a])
    setAdding(false)
    if (a.deadline) syncAssignmentToCalendar(a, courseMap[a.courseId]?.name || a.courseId, 'upsert')
  }

  // ── Calendar sync: push inline edits (deadline/name changes, grade/done removal) ──
  const prevAssignmentsRef = useRef<Assignment[] | null>(null)
  useEffect(() => {
    const prev = prevAssignmentsRef.current
    if (prev) {
      for (const a of assignments) {
        const old = prev.find((p) => p.id === a.id)
        if (!old) continue
        if (!old.done && a.done) {
          syncAssignmentToCalendar(a, courseMap[a.courseId]?.name || a.courseId, 'delete')
        } else if (old.done && !a.done) {
          if (a.deadline) syncAssignmentToCalendar(a, courseMap[a.courseId]?.name || a.courseId, 'upsert')
        } else if (old.deadline !== a.deadline || old.name !== a.name) {
          syncAssignmentToCalendar(a, courseMap[a.courseId]?.name || a.courseId, 'upsert')
        }
      }
    }
    prevAssignmentsRef.current = assignments
  }, [assignments, courseMap])

  const toggleType = (t: AssignmentType) => {
    setSelectedTypes((prev) => { const next = new Set(prev); if (next.has(t)) { if (next.size > 1) next.delete(t) } else next.add(t); return next })
  }
  const toggleSort = (key: SortKey) => { if (sortKey === key) setSortAsc((p) => !p); else { setSortKey(key); setSortAsc(true) } }

  const upcoming = useMemo(
    () => semesterAssignments.filter((a) => a.deadline && a.deadline >= getToday() && !a.done).sort((a, b) => a.deadline!.localeCompare(b.deadline!)),
    [semesterAssignments],
  )

  const filtered = useMemo(
    () => semesterAssignments.filter((a) => (!selectedCourse || a.courseId === selectedCourse) && selectedTypes.has(a.type)).sort((a, b) => cmp(a, b, sortKey, sortAsc)),
    [semesterAssignments, selectedCourse, selectedTypes, sortKey, sortAsc],
  )

  const gradesByCourse = useMemo(() => {
    const m: Record<string, { gradedWeight: number; gradeSum: number; totalWeight: number }> = {}
    for (const a of assignments) {
      if (!m[a.courseId]) m[a.courseId] = { gradedWeight: 0, gradeSum: 0, totalWeight: 0 }
      m[a.courseId].totalWeight += a.weight
      if (a.grade !== undefined) {
        m[a.courseId].gradedWeight += a.weight
        m[a.courseId].gradeSum += a.grade * a.weight
      }
    }
    return m
  }, [assignments])

  const overallGPA = useMemo(() => {
    let totalCredits = 0, weightedSum = 0
    for (const c of activeCourses) {
      const g = gradesByCourse[c.id]
      if (g && g.gradedWeight > 0) {
        const courseGrade = g.gradeSum / g.gradedWeight
        weightedSum += courseGrade * c.credits
        totalCredits += c.credits
      }
    }
    return totalCredits > 0 ? weightedSum / totalCredits : undefined
  }, [gradesByCourse, activeCourses])

  const maxOverallGPA = useMemo(() => {
    let totalCredits = 0, weightedSum = 0
    for (const c of activeCourses) {
      const g = gradesByCourse[c.id]
      if (!g) { weightedSum += 5.0 * c.credits; totalCredits += c.credits; continue }
      const ungradedW = g.totalWeight - g.gradedWeight
      const maxCourseGrade = g.totalWeight > 0 ? (g.gradeSum + 5.0 * ungradedW) / g.totalWeight : 5.0
      weightedSum += maxCourseGrade * c.credits
      totalCredits += c.credits
    }
    return totalCredits > 0 ? weightedSum / totalCredits : 5.0
  }, [gradesByCourse, activeCourses])

  const selected = selectedCourse ? courseMap[selectedCourse] : undefined
  const activeIsEmpty = activeCourses.length === 0

  return (
    <PageShell>
      {/* Semester switcher */}
      <div className="flex flex-wrap items-center gap-1.5">
        {semesters.map((s) => {
          const active = s === activeSemester
          const empty = !courses.some((c) => c.semester === s)
          return (
            /* Split pill (select + optional delete) — documented compact pattern:
               two sibling actions can't nest inside one <Button>/<Chip>. */
            <div key={s} className={`flex items-center rounded-full border transition-colors ${
              active ? 'border-accent/40 bg-accent/10' : 'border-border hover:border-input'
            }`}>
              <button
                onClick={() => changeSemester(s)}
                aria-pressed={active}
                className={`cursor-pointer py-1.5 pl-3 pr-2 font-mono text-2xs ${active ? 'text-accent' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {s}
              </button>
              {empty && (
                <button onClick={() => deleteSemester(s)} title="Delete empty semester" aria-label={`Delete ${s}`} className="cursor-pointer pr-2 text-foreground-faint transition-colors hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )
        })}
        {addingSemester ? (
          <div className="flex items-center rounded-full border border-input px-2.5 py-1.5">
            <input
              ref={semAddRef}
              value={newSemesterName}
              onChange={(e) => setNewSemesterName(e.target.value)}
              onBlur={addSemester}
              onKeyDown={(e) => { if (e.key === 'Enter') addSemester(); if (e.key === 'Escape') { setAddingSemester(false); setNewSemesterName('') } }}
              placeholder="5th Semester..."
              className="w-28 bg-transparent font-mono text-2xs outline-none placeholder:text-foreground-faint"
            />
          </div>
        ) : (
          <Button variant="ghost" size="xs" onClick={() => setAddingSemester(true)}>
            <Plus /> Semester
          </Button>
        )}
      </div>

      {/* PREP */}
      <div className="surface rounded-xl px-4 py-3">
        <p className="mb-1 font-mono text-2xs uppercase tracking-wider text-muted-foreground">P.R.E.P = Preview &rarr; Record &rarr; Exercise &rarr; Promote</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="text-foreground">Preview</span> &mdash; Skim topic, 3 ideas + 2 doubts &nbsp;|&nbsp;
          <span className="text-foreground">Record</span> &mdash; In class: defs, formulas, examples &nbsp;|&nbsp;
          <span className="text-foreground">Exercise</span> &mdash; Same day: 5-10 problems &nbsp;|&nbsp;
          <span className="text-foreground">Promote</span> &mdash; Weekly review + mark mastered
        </p>
      </div>

      {/* Course Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {activeCourses.map((c) => {
          const Icon = ICONS[c.iconKey] ?? GraduationCap
          const count = assignments.filter((a) => a.courseId === c.id).length
          const done = assignments.filter((a) => a.courseId === c.id && a.done).length
          const g = gradesByCourse[c.id]
          const sel = selectedCourse === c.id
          return (
            /* Selectable course card — documented compact pattern (card-shaped
               toggle; a <Button>'s centered layout doesn't fit). Selection is
               the ONE accent; course identity stays neutral text. */
            <button
              key={c.id}
              onClick={() => setSelectedCourse(sel ? null : c.id)}
              aria-pressed={sel}
              className={`flex cursor-pointer flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-colors ${
                sel ? 'border-accent/40 bg-accent/5' : 'border-border hover:border-input hover:bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${sel ? 'text-accent' : 'text-muted-foreground'}`} />
                <Chip variant={diffVariant[c.difficulty]} size="sm">{c.difficulty}</Chip>
              </div>
              <p className="text-xs font-medium leading-tight">{c.name}</p>
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xs tabular-nums text-muted-foreground">{done}/{count}</span>
                {g && g.gradedWeight > 0 && (
                  <span className={`font-mono text-2xs font-medium tabular-nums ${gradeInk(g.gradeSum / g.gradedWeight)}`}>{(g.gradeSum / g.gradedWeight).toFixed(1)}</span>
                )}
              </div>
            </button>
          )
        })}

        {/* Add course card */}
        {addingCourse ? (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-input bg-muted/20 px-4 py-3">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <input
              ref={courseAddRef}
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              onBlur={addCourse}
              onKeyDown={(e) => { if (e.key === 'Enter') addCourse(); if (e.key === 'Escape') { setAddingCourse(false); setNewCourseName('') } }}
              placeholder="Course name..."
              className="bg-transparent text-xs font-medium outline-none placeholder:text-foreground-faint"
            />
          </div>
        ) : (
          <button
            onClick={() => setAddingCourse(true)}
            className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border px-4 py-3 text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            <span className="font-mono text-2xs">Add course</span>
          </button>
        )}
      </div>

      {/* Course Detail Panel */}
      {selected && (
        <CourseDetail
          course={selected}
          assignments={assignments}
          topics={topics}
          semesters={semesters}
          onUpdateTopics={updateTopics}
          onUpdateCourse={(patch) => updateCourse(selected.id, patch)}
          onDeleteCourse={() => deleteCourse(selected.id)}
          onAddAssignment={() => setAdding(true)}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Upcoming */}
        <WidgetCard title="Upcoming Deadlines" description={`${upcoming.length} remaining`} delay={0.1} className="lg:col-span-2">
          {upcoming.length === 0 ? (
            <EmptyState message="All caught up." hint="Deadlines you add will queue here." />
          ) : (
            <div className="flex max-h-[340px] flex-col gap-1 overflow-y-auto">
              {upcoming.map((a) => {
                const c = courseMap[a.courseId]
                const days = daysUntil(a.deadline!)
                const urgency = deadlineUrgency(days)
                return (
                  <div key={a.id} className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-secondary/50">
                    <Button variant="ghost" size="icon-xs" onClick={() => toggleDone(a.id)} aria-label={`Mark ${a.name} done`} className="shrink-0">
                      {urgency === 'neutral'
                        ? <CalendarDays className="text-muted-foreground" />
                        : <AlertCircle className={urgency === 'danger' ? 'text-destructive' : 'text-warning'} />}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="text-2xs text-muted-foreground">{c?.name}</p>
                    </div>
                    <Chip size="sm" className="shrink-0">{a.type}</Chip>
                    <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">{fmtDate(a.deadline!)}</span>
                    <Chip variant={urgency} size="sm" className="shrink-0">{days}d</Chip>
                  </div>
                )
              })}
            </div>
          )}
        </WidgetCard>

        {/* Overview */}
        <WidgetCard title={activeSemester || 'Semester'} description="Semester overview" delay={0.15}>
          {activeIsEmpty ? (
            <EmptyState message="No courses yet." hint="Add one above to start tracking." />
          ) : (
            <div className="flex flex-col gap-3 py-1">
              <div className="flex items-center gap-3">
                <GraduationCap className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className={`font-mono text-2xl font-medium tabular-nums leading-none ${overallGPA !== undefined ? gradeInk(overallGPA) : 'text-foreground'}`}>
                    {overallGPA !== undefined ? overallGPA.toFixed(2) : '—'}
                  </p>
                  <p className="mt-1.5 font-mono text-2xs text-muted-foreground">
                    Overall GPA · {activeCourses.reduce((s, c) => s + c.credits, 0)} credits
                    {maxOverallGPA < 5.0 && <span className="ml-1">· max {maxOverallGPA.toFixed(2)}</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
                {activeCourses.map((c) => {
                  const g = gradesByCourse[c.id]
                  const courseGrade = g && g.gradedWeight > 0 ? g.gradeSum / g.gradedWeight : undefined
                  const pct = g && g.totalWeight > 0 ? Math.round((g.gradedWeight / g.totalWeight) * 100) : 0
                  return (
                    <div key={c.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs">{c.name}</span>
                      <div className="h-1 w-12 overflow-hidden rounded-full bg-muted/60">
                        <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`w-8 text-right font-mono text-2xs font-medium tabular-nums ${courseGrade !== undefined ? gradeInk(courseGrade) : 'text-muted-foreground'}`}>
                        {courseGrade !== undefined ? courseGrade.toFixed(1) : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </WidgetCard>
      </div>

      {/* All Assignments */}
      <WidgetCard
        title={selected ? selected.name : 'All Assignments'}
        description={`${filtered.length} of ${semesterAssignments.length}`}
        delay={0.2}
      >
        {/* Type filter + Add button */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {ALL_TYPES.map((t) => {
              const active = selectedTypes.has(t)
              const count = semesterAssignments.filter((a) => a.type === t && (!selectedCourse || a.courseId === selectedCourse)).length
              if (count === 0) return null
              return (
                <Chip key={t} selectable selected={active} onClick={() => toggleType(t)}>
                  {t} ({count})
                </Chip>
              )
            })}
          </div>
          {selectedCourse && (
            <Button variant="ghost" size="xs" onClick={() => setAdding(true)}>
              <Plus /> Add
            </Button>
          )}
        </div>

        {!selectedCourse && filtered.length === 0 && (
          <EmptyState
            message={`No assignments in ${activeSemester || 'this semester'} yet.`}
            hint="Select a course above, then hit Add."
          />
        )}

        {selectedCourse && filtered.length === 0 && !adding && (
          <EmptyState
            message={`No assignments for ${selected?.name} yet.`}
            action={
              <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
                <Plus /> Add your first assignment
              </Button>
            }
          />
        )}

        {/* Table */}
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="w-6 px-4 py-2"></th>
                <th className="py-2 text-left font-medium">
                  <Button variant="ghost" size="xs" onClick={() => toggleSort('name')} className="-ml-2">Name <SortIcon k="name" sortKey={sortKey} sortAsc={sortAsc} /></Button>
                </th>
                {!selectedCourse && <th className="py-2 text-left font-medium">Course</th>}
                <th className="py-2 text-left font-medium">Type</th>
                <th className="py-2 text-right font-medium">
                  <Button variant="ghost" size="xs" onClick={() => toggleSort('weight')}>Weight <SortIcon k="weight" sortKey={sortKey} sortAsc={sortAsc} /></Button>
                </th>
                <th className="py-2 text-right font-medium">
                  <Button variant="ghost" size="xs" onClick={() => toggleSort('grade')}>Grade <SortIcon k="grade" sortKey={sortKey} sortAsc={sortAsc} /></Button>
                </th>
                <th className="py-2 text-right font-medium">
                  <Button variant="ghost" size="xs" onClick={() => toggleSort('deadline')}>Deadline <SortIcon k="deadline" sortKey={sortKey} sortAsc={sortAsc} /></Button>
                </th>
                <th className="w-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const c = courseMap[a.courseId]
                const isPast = a.deadline && a.deadline < getToday() && !a.done
                return (
                  <tr key={a.id} className={`group border-b border-border/60 transition-colors hover:bg-secondary/30 ${isPast ? 'opacity-40' : ''} ${a.done ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2.5">
                      {/* Done toggle — documented compact pattern (13px control in a dense row). */}
                      <button onClick={() => toggleDone(a.id)} aria-label={a.done ? `Mark ${a.name} not done` : `Mark ${a.name} done`} className="cursor-pointer">
                        {a.done
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                          : <div className="h-3.5 w-3.5 rounded-full border border-input transition-colors hover:border-muted-foreground" />
                        }
                      </button>
                    </td>
                    <td className="py-2.5">
                      <span className={`font-medium ${a.done ? 'line-through' : ''}`}>{a.name}</span>
                      {a.notes && <span className="ml-2 text-2xs text-foreground-faint">({a.notes})</span>}
                    </td>
                    {!selectedCourse && (
                      <td className="py-2.5">
                        <span className="text-muted-foreground">{c?.name}</span>
                      </td>
                    )}
                    <td className="py-2.5">
                      <select
                        value={a.type}
                        onChange={(e) => setField(a.id, { type: e.target.value as AssignmentType })}
                        className="cursor-pointer appearance-none rounded-full border border-border bg-transparent px-1.5 py-0.5 font-mono text-3xs text-muted-foreground outline-none transition-colors hover:border-input hover:text-foreground"
                      >
                        {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 text-right">
                      <EditableNumber
                        value={a.weight * 100}
                        suffix="%"
                        onChange={(v) => setField(a.id, { weight: (v ?? 0) / 100 })}
                      />
                    </td>
                    <td className="py-2.5 text-right"><EditableGrade value={a.grade} onChange={(v) => setGrade(a.id, v)} /></td>
                    <td className="py-2.5 text-right">
                      <input
                        type="date"
                        value={a.deadline ?? ''}
                        onChange={(e) => setField(a.id, { deadline: e.target.value || undefined })}
                        className="w-[100px] cursor-pointer bg-transparent text-right font-mono text-2xs tabular-nums text-muted-foreground outline-none"
                      />
                    </td>
                    <td className="py-2.5 pr-4">
                      <Button variant="ghost" size="icon-xs" onClick={() => deleteAssignment(a.id)} aria-label={`Delete ${a.name}`} className="opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100">
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {adding && selectedCourse && (
                <AddRow courseId={selectedCourse} onAdd={addAssignment} onCancel={() => setAdding(false)} />
              )}
            </tbody>
          </table>
        </div>
      </WidgetCard>

      <ClassSchedule
        courses={(() => {
          const inTerm = courses.filter((c) => c.semester === activeSemester)
          return (inTerm.length ? inTerm : courses).map((c) => ({ id: c.id, name: c.name }))
        })()}
      />
    </PageShell>
  )
}
