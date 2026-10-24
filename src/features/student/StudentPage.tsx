import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useState, useMemo, useRef, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { SortableHeader, tableHeaderClassName } from '@/components/shared/SortableHeader'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { useStore, readStore, updateStoreValue } from '@/lib/store'
import { deleteFile } from '@/lib/media'
import { syncAssignmentToCalendar } from '@/lib/calendar-sync'
import { ClassSchedule } from './ClassSchedule'
import { InlineNumberEditor } from '@/components/shared/InlineNumberEditor'
import { InlineTextInput } from '@/components/shared/InlineTextInput'
import { OptionSelect } from './OptionSelect'
import { formatNumberDraft, parseNumberDraft, type NumberRule } from '@/lib/number-draft'
import { StudentOverviewCards } from './StudentOverviewCards'
import { includeAssignmentType, studentOverview, termCourses } from './student-overview'
import { courseGrades, semesterGpa, MAX_GRADE, type CourseGrades } from './student-grades'
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

const GRADE_RULE: NumberRule = { min: 0, max: 5, blank: 'clear' }
const WEIGHT_RULE: NumberRule = { min: 0, max: 100 }
const CREDITS_RULE: NumberRule = { min: 0 }
/** Assignment weights are stored as fractions; edit them as percentages without float noise. */
const weightPercent = (a: Assignment) => Math.round(a.weight * 1000) / 10

/** Property row in the course detail panel (static — module scope keeps children state stable). */
function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-1.5">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-xs">{children}</span>
    </div>
  )
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

// ── Add Assignment row ────────────────────────────────────────────────────────

function AddRow({ courseId, onAdd, onCancel }: { courseId: string; onAdd: (a: Assignment) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<AssignmentType>('Exam')
  const [weight, setWeight] = useState('')
  const [deadline, setDeadline] = useState('')
  const [weightInvalid, setWeightInvalid] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  const submit = () => {
    if (!name.trim()) return
    const parsedWeight = parseNumberDraft(weight, { ...WEIGHT_RULE, blank: 'clear' })
    if (!parsedWeight.ok) { setWeightInvalid(true); return }
    onAdd({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      courseId,
      type,
      weight: (parsedWeight.value ?? 0) / 100,
      deadline: deadline || undefined,
      done: false,
      priority: 'Medium',
    })
  }

  return (
    <tr className="border-b border-border/60 bg-muted/20">
      <td className="px-4 py-2"><Plus className="h-3.5 w-3.5 text-muted-foreground" /></td>
      <td className="py-2">
        <Input
          ref={ref}
          variant="inline"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
          aria-label="New assignment name"
          placeholder="Assignment name..."
          className="font-medium"
        />
      </td>
      <td className="py-2">
        <OptionSelect value={type} options={ALL_TYPES} onChange={setType} label="New assignment type" />
      </td>
      <td className="py-2 text-right">
        <Input
          variant="inline"
          inputMode="decimal"
          value={weight}
          onChange={(e) => { setWeight(e.target.value); setWeightInvalid(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
          aria-label="New assignment weight"
          aria-invalid={weightInvalid || undefined}
          placeholder="%"
          className="w-10 text-right font-mono tabular-nums"
        />
      </td>
      <td className="py-2" />
      <td className="py-2 text-right">
        <Input variant="inline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="New assignment deadline" className="w-auto cursor-pointer font-mono text-2xs tabular-nums" />
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
  const newRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (addingTopic) newRef.current?.focus() }, [addingTopic])

  const Icon = ICONS[course.iconKey] ?? GraduationCap
  const myTopics = topics.filter((t) => t.courseId === course.id)
  const grades = courseGrades(assignments, course.id)
  const gradedPct = grades.gradedShare * 100

  const commitName = (name: string) => {
    setEditingName(false)
    if (name && name !== course.name) onUpdateCourse({ name })
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
          <InlineTextInput
            initialValue={course.name}
            onCommit={commitName}
            onCancel={() => setEditingName(false)}
            aria-label="Course name"
            className="w-auto text-base font-semibold"
          />
        ) : (
          /* Click-to-edit title — documented compact pattern (bare text button). */
          <button onClick={() => setEditingName(true)} aria-label={`Rename ${course.name}`} className="cursor-pointer text-base font-semibold transition-colors hover:text-muted-foreground">{course.name}</button>
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
            <OptionSelect value={course.semester} options={semesters} onChange={(semester) => onUpdateCourse({ semester })} label="Semester" />
          </Prop>
          <Prop label="Credits">
            <InlineNumberEditor value={course.credits} rule={CREDITS_RULE} label="Credits" onCommit={(credits) => { if (credits !== undefined) onUpdateCourse({ credits }) }} className="text-muted-foreground">
              {formatNumberDraft(course.credits)}
            </InlineNumberEditor>
          </Prop>
          <Prop label="Status">
            <OptionSelect value={course.status} options={ALL_STATUSES} onChange={(status) => onUpdateCourse({ status })} label="Status" />
          </Prop>
          <Prop label="Difficulty">
            <OptionSelect value={course.difficulty} options={ALL_DIFFICULTIES} onChange={(difficulty) => onUpdateCourse({ difficulty })} label="Difficulty" className={diffInk[course.difficulty]} />
          </Prop>
          <Prop label="Current Grade">
            {grades.current !== undefined ? (
              <span className={`font-mono text-sm font-medium tabular-nums ${gradeInk(grades.current)}`}>{grades.current.toFixed(2)}/5.0</span>
            ) : (
              <span className="text-muted-foreground">No grades yet</span>
            )}
          </Prop>
          <Prop label="Best Possible"><span className="font-mono font-medium tabular-nums text-success">{grades.best.toFixed(2)}/5.0</span></Prop>
          <Prop label="Worst Possible"><span className={`font-mono font-medium tabular-nums ${gradeInk(grades.worst)}`}>{grades.worst.toFixed(2)}/5.0</span></Prop>
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
                <Input
                  ref={newRef}
                  variant="inline"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTopic(); if (e.key === 'Escape') setAddingTopic(false) }}
                  aria-label="New topic name"
                  placeholder="Topic name..."
                  className="flex-1"
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
        <Textarea aria-label="Course notes"
          value={course.notes ?? ''}
          onChange={(e) => onUpdateCourse({ notes: e.target.value })}
          placeholder="Class notes, formulas, reminders… (autosaves)"
          className="min-h-[140px] w-full resize-y px-3 py-2 text-xs leading-relaxed"
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
  const [addingSemester, setAddingSemester] = useState(false)

  const update = updateAssignments

  const courseMap = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])) as Record<string, Course>, [courses])

  // ── Active semester scoping ──
  const activeCourses = useMemo(() => courses.filter((c) => c.semester === activeSemester), [courses, activeSemester])
  const activeCourseIds = useMemo(() => new Set(activeCourses.map((c) => c.id)), [activeCourses])
  const semesterAssignments = useMemo(() => assignments.filter((a) => activeCourseIds.has(a.courseId)), [assignments, activeCourseIds])
  const today = getToday()
  const overview = useMemo(() => studentOverview(courses, assignments, activeSemester, today), [courses, assignments, activeSemester, today])

  const changeSemester = (s: string) => {
    setActiveSemester(() => s)
    setSelectedCourse(null)
    setSelectedTypes(new Set(ALL_TYPES))
    setAdding(false)
    setAddingCourse(false)
  }

  // ── Semester management ──
  const addSemester = (n: string) => {
    setAddingSemester(false)
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
  const addCourse = (n: string) => {
    setAddingCourse(false)
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
  const sortProps = (key: SortKey) => ({ active: sortKey === key, ascending: sortAsc, onSort: () => toggleSort(key) })

  const upcoming = overview.deadlineQueue

  const filtered = useMemo(
    () => semesterAssignments.filter((a) => (!selectedCourse || a.courseId === selectedCourse) && selectedTypes.has(a.type)).sort((a, b) => cmp(a, b, sortKey, sortAsc)),
    [semesterAssignments, selectedCourse, selectedTypes, sortKey, sortAsc],
  )

  const gradesByCourse = useMemo(() => {
    const m: Record<string, CourseGrades> = {}
    for (const c of courses) m[c.id] = courseGrades(assignments, c.id)
    return m
  }, [courses, assignments])
  const gradesOf = (courseId: string) => gradesByCourse[courseId] ?? courseGrades(assignments, courseId)
  const gpa = semesterGpa(activeCourses, gradesOf)

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
            <InlineTextInput
              onCommit={addSemester}
              onCancel={() => setAddingSemester(false)}
              aria-label="New semester name"
              placeholder="5th Semester..."
              className="w-28 border-b-0 py-0 font-mono text-2xs"
            />
          </div>
        ) : (
          <Button variant="ghost" size="xs" onClick={() => setAddingSemester(true)} aria-label="Add semester">
            <Plus /> Semester
          </Button>
        )}
      </div>

      <StudentOverviewCards
        semester={activeSemester}
        today={today}
        overview={overview}
        priorityCourse={overview.priorityAssignment ? courseMap[overview.priorityAssignment.courseId] : undefined}
        onOpenPriority={(assignment) => {
          setSelectedCourse(assignment.courseId)
          setSelectedTypes((current) => includeAssignmentType(current, assignment.type))
          requestAnimationFrame(() => {
            const row = document.getElementById(`student-assignment-${assignment.id}`)
            row?.scrollIntoView({ block: 'center' })
            row?.focus({ preventScroll: true })
          })
        }}
        onAddCourse={() => setAddingCourse(true)}
        onAddAssignment={() => {
          if (activeCourses.length === 1) {
            setSelectedCourse(activeCourses[0].id)
            setAdding(true)
            requestAnimationFrame(() => document.getElementById('student-assignments')?.scrollIntoView({ block: 'start' }))
          } else {
            document.getElementById('student-courses')?.scrollIntoView({ block: 'start' })
          }
        }}
      />

      {/* Course Cards */}
      <section id="student-courses" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Your semester</p><h2 className="text-xl font-semibold">Courses</h2></div>
          <span className="rounded-full bg-focus-surface/55 px-3 py-1 text-xs font-semibold text-accent dark:bg-accent/15">{activeCourses.length} active</span>
        </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {activeCourses.map((c) => {
          const Icon = ICONS[c.iconKey] ?? GraduationCap
          const count = assignments.filter((a) => a.courseId === c.id).length
          const done = assignments.filter((a) => a.courseId === c.id && a.done).length
          const grade = gradesOf(c.id).current
          const sel = selectedCourse === c.id
          return (
            /* Selectable course card — documented compact pattern (card-shaped
               toggle; a <Button>'s centered layout doesn't fit). Selection is
               the ONE accent; course identity stays neutral text. */
            <button
              key={c.id}
              onClick={() => setSelectedCourse(sel ? null : c.id)}
              aria-pressed={sel}
              className={`flex min-h-36 cursor-pointer flex-col gap-3 rounded-[1.35rem] border px-4 py-4 text-left shadow-card transition-[border-color,background-color,transform] hover:-translate-y-0.5 ${
                sel ? 'border-accent/50 bg-focus-surface/50 dark:bg-accent/20' : 'border-border bg-card hover:border-accent/35 hover:bg-focus-surface/15'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-focus-surface/70 text-accent dark:bg-accent/15"><Icon className="size-5" /></span>
                <Chip variant={diffVariant[c.difficulty]} size="sm">{c.difficulty}</Chip>
              </div>
              <p className="text-sm font-semibold leading-snug">{c.name}</p>
              <div className="mt-auto flex items-end justify-between gap-2">
                <span className="text-xs text-muted-foreground">{count ? `${done} of ${count} done` : 'No assignments'}</span>
                {grade !== undefined && (
                  <span className={`font-mono text-xs font-semibold tabular-nums ${gradeInk(grade)}`}>{grade.toFixed(1)}</span>
                )}
              </div>
            </button>
          )
        })}

        {/* Add course card */}
        {addingCourse ? (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-input bg-muted/20 px-4 py-3">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <InlineTextInput
              onCommit={addCourse}
              onCancel={() => setAddingCourse(false)}
              aria-label="New course name"
              placeholder="Course name..."
              className="font-medium"
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
      </section>

      {/* Existing P.R.E.P. method, kept close to the courses it guides. */}
      <div className="surface rounded-xl px-4 py-3">
        <p className="mb-1 font-mono text-2xs uppercase tracking-wider text-muted-foreground">P.R.E.P = Preview &rarr; Record &rarr; Exercise &rarr; Promote</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="text-foreground">Preview</span> &mdash; Skim topic, 3 ideas + 2 doubts &nbsp;|&nbsp;
          <span className="text-foreground">Record</span> &mdash; In class: defs, formulas, examples &nbsp;|&nbsp;
          <span className="text-foreground">Exercise</span> &mdash; Same day: 5-10 problems &nbsp;|&nbsp;
          <span className="text-foreground">Promote</span> &mdash; Weekly review + mark mastered
        </p>
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
        <WidgetCard title="Deadline queue" description={`${upcoming.length} open with dates`} delay={0.1} className="lg:col-span-2">
          {upcoming.length === 0 ? (
            <EmptyState message="No dated work in the queue." hint="Add a deadline to an assignment to see it here." />
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
                  <p className={`font-mono text-2xl font-medium tabular-nums leading-none ${gpa.current !== undefined ? gradeInk(gpa.current) : 'text-foreground'}`}>
                    {gpa.current !== undefined ? gpa.current.toFixed(2) : '—'}
                  </p>
                  <p className="mt-1.5 font-mono text-2xs text-muted-foreground">
                    Overall GPA · {activeCourses.reduce((s, c) => s + c.credits, 0)} credits
                    {gpa.best < MAX_GRADE && <span className="ml-1">· max {gpa.best.toFixed(2)}</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
                {activeCourses.map((c) => {
                  const { current: courseGrade, gradedShare } = gradesOf(c.id)
                  const pct = Math.round(gradedShare * 100)
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
        id="student-assignments"
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
                <SortableHeader label="Name" {...sortProps('name')} />
                {!selectedCourse && <th scope="col" className={tableHeaderClassName}>Course</th>}
                <th scope="col" className={tableHeaderClassName}>Type</th>
                <SortableHeader label="Weight" {...sortProps('weight')} className="text-right" />
                <SortableHeader label="Grade" {...sortProps('grade')} className="text-right" />
                <SortableHeader label="Deadline" {...sortProps('deadline')} className="text-right" />
                <th className="w-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const c = courseMap[a.courseId]
                const isPast = a.deadline && a.deadline < getToday() && !a.done
                return (
                  <tr key={a.id} id={`student-assignment-${a.id}`} tabIndex={-1} className={`group border-b border-border/60 transition-colors hover:bg-secondary/30 ${isPast ? 'opacity-40' : ''} ${a.done ? 'opacity-60' : ''}`}>
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
                      <OptionSelect
                        value={a.type}
                        options={ALL_TYPES}
                        onChange={(type) => setField(a.id, { type })}
                        label={`Type for ${a.name}`}
                        className="h-auto appearance-none bg-transparent py-0.5 text-3xs text-muted-foreground hover:border-input hover:text-foreground"
                      />
                    </td>
                    <td className="py-2.5 text-right">
                      <InlineNumberEditor
                        value={weightPercent(a)}
                        rule={WEIGHT_RULE}
                        label={`Weight for ${a.name}`}
                        onCommit={(v) => setField(a.id, { weight: (v ?? 0) / 100 })}
                        className="text-muted-foreground"
                        inputClassName="w-10"
                      >
                        {formatNumberDraft(weightPercent(a))}%
                      </InlineNumberEditor>
                    </td>
                    <td className="py-2.5 text-right">
                      <InlineNumberEditor value={a.grade} rule={GRADE_RULE} label={`Grade for ${a.name}`} placeholder="0-5" onCommit={(v) => setGrade(a.id, v)} className="w-full">
                        {a.grade !== undefined
                          ? <span className={gradeInk(a.grade)}>{a.grade.toFixed(1)}</span>
                          : <span className="text-foreground-faint">—</span>}
                      </InlineNumberEditor>
                    </td>
                    <td className="py-2.5 text-right">
                      <Input
                        variant="inline"
                        type="date"
                        value={a.deadline ?? ''}
                        onChange={(e) => setField(a.id, { deadline: e.target.value || undefined })}
                        aria-label={`Deadline for ${a.name}`}
                        className="w-[100px] cursor-pointer border-b-0 text-right font-mono text-2xs tabular-nums text-muted-foreground"
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
        courses={termCourses(courses, activeSemester).map((c) => ({ id: c.id, name: c.name }))}
      />
    </PageShell>
  )
}
