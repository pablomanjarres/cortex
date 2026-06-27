import { useState, useMemo, useRef, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Badge } from '@/components/ui/badge'
import { useStore } from '@/lib/store'
import { syncAssignmentToCalendar } from '@/lib/calendar-sync'
import {
  GraduationCap,
  FlaskConical,
  Code2,
  Database,
  BarChart3,
  Palette,
  FileCode,
  Sigma,
  Blocks,
  Cpu,
  Terminal,
  MessagesSquare,
  Network,
  BookOpen,
  Atom,
  Globe,
  PenTool,
  Calculator,
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

// ── Types ────────────────────────────────────────────────────────────────────

type Difficulty = 'Hard' | 'Medium' | 'Easy'
type AssignmentType = 'Exam' | 'Quiz' | 'Lab' | 'Project' | 'Presentation' | 'Attendance'
type Priority = 'Low' | 'Medium' | 'High' | 'Urgent'
type SortKey = 'deadline' | 'weight' | 'grade' | 'name'
type CourseStatus = 'Normal' | 'At risk' | 'Under Control'

type TopicStatus = 'Not seen' | 'Previewed' | 'Seen' | 'Practiced' | 'Mastered'

// Courses are persisted as data (JSON), so the icon is stored as a string key
// and resolved to a lucide component at render time.
interface Course {
  id: string
  name: string
  difficulty: Difficulty
  iconKey: string
  color: string
  bg: string
  semester: string
  status: CourseStatus
  credits: number
}

interface Topic {
  id: string
  name: string
  courseId: string
  chapter: string
  types: string[]
  mastery: number
  status: TopicStatus
  priority: Priority
  week?: number
}

interface Assignment {
  id: string
  name: string
  courseId: string
  type: AssignmentType
  weight: number
  grade?: number
  deadline?: string
  done: boolean
  priority: Priority
  notes?: string
}

// ── Icons & styling palette ──────────────────────────────────────────────────

const ICONS: Record<string, typeof GraduationCap> = {
  grad: GraduationCap, flask: FlaskConical, code: Code2, database: Database,
  chart: BarChart3, palette: Palette, file: FileCode, sigma: Sigma, blocks: Blocks,
  cpu: Cpu, terminal: Terminal, messages: MessagesSquare, network: Network,
  book: BookOpen, atom: Atom, globe: Globe, pen: PenTool, calc: Calculator,
}
const iconOf = (k: string) => ICONS[k] ?? GraduationCap

// Cycled when auto-styling newly added courses so each looks distinct.
const PALETTE: [string, string][] = [
  ['text-blue-400', 'bg-blue-400'], ['text-orange-400', 'bg-orange-400'],
  ['text-green-400', 'bg-green-400'], ['text-pink-400', 'bg-pink-400'],
  ['text-purple-400', 'bg-purple-400'], ['text-cyan-400', 'bg-cyan-400'],
  ['text-red-400', 'bg-red-400'], ['text-yellow-400', 'bg-yellow-400'],
  ['text-amber-400', 'bg-amber-400'], ['text-teal-400', 'bg-teal-400'],
]
const ICON_CYCLE = ['book', 'atom', 'globe', 'pen', 'calc', 'grad', 'sigma', 'blocks', 'cpu', 'terminal', 'messages', 'network']
const ICON_OPTIONS = Object.keys(ICONS)

// ── Default seed data ─────────────────────────────────────────────────────────

const DEFAULT_SEMESTERS = ['4th Semester', '3rd Semester']

const DEFAULT_COURSES: Course[] = [
  // 3rd Semester
  { id: 'formales', name: 'Formal Languages', difficulty: 'Hard', iconKey: 'file', color: 'text-orange-400', bg: 'bg-orange-400', semester: '3rd Semester', status: 'Normal', credits: 3 },
  { id: 'physics', name: 'Physics II', difficulty: 'Hard', iconKey: 'flask', color: 'text-pink-400', bg: 'bg-pink-400', semester: '3rd Semester', status: 'Normal', credits: 3 },
  { id: 'algorithms', name: 'Algorithms', difficulty: 'Easy', iconKey: 'code', color: 'text-red-400', bg: 'bg-red-400', semester: '3rd Semester', status: 'Normal', credits: 3 },
  { id: 'dbms', name: 'DB Management', difficulty: 'Medium', iconKey: 'database', color: 'text-blue-400', bg: 'bg-blue-400', semester: '3rd Semester', status: 'Normal', credits: 3 },
  { id: 'stats', name: 'Prob & Stats', difficulty: 'Easy', iconKey: 'chart', color: 'text-green-400', bg: 'bg-green-400', semester: '3rd Semester', status: 'Normal', credits: 3 },
  { id: 'imagination', name: 'Creativity', difficulty: 'Easy', iconKey: 'palette', color: 'text-purple-400', bg: 'bg-purple-400', semester: '3rd Semester', status: 'Normal', credits: 3 },
  // 4th Semester (2026-2, starts 2026-07-15) — seeded from the Google Calendar class schedule
  { id: 'calculo3', name: 'Cálculo 3', difficulty: 'Hard', iconKey: 'sigma', color: 'text-blue-400', bg: 'bg-blue-400', semester: '4th Semester', status: 'Normal', credits: 3 },
  { id: 'softeng', name: 'Ingeniería de Software', difficulty: 'Medium', iconKey: 'blocks', color: 'text-orange-400', bg: 'bg-orange-400', semester: '4th Semester', status: 'Normal', credits: 3 },
  { id: 'comporg', name: 'Organización de Computadores', difficulty: 'Medium', iconKey: 'cpu', color: 'text-cyan-400', bg: 'bg-cyan-400', semester: '4th Semester', status: 'Normal', credits: 3 },
  { id: 'os', name: 'Sistemas Operativos', difficulty: 'Hard', iconKey: 'terminal', color: 'text-green-400', bg: 'bg-green-400', semester: '4th Semester', status: 'Normal', credits: 3 },
  { id: 'debates', name: 'Debates Humanísticos', difficulty: 'Easy', iconKey: 'messages', color: 'text-purple-400', bg: 'bg-purple-400', semester: '4th Semester', status: 'Normal', credits: 3 },
  { id: 'sysinfo', name: 'Sistemas de Información', difficulty: 'Easy', iconKey: 'network', color: 'text-pink-400', bg: 'bg-pink-400', semester: '4th Semester', status: 'Normal', credits: 3 },
]

const DEFAULT_TOPICS: Topic[] = [
  { id: 't1', name: 'Kinetics', courseId: 'physics', chapter: 'Fray man 12.1-12.2', types: ['Concept'], mastery: 5, status: 'Seen', priority: 'High', week: 3 },
]

const DEFAULT_ASSIGNMENTS: Assignment[] = [
  // ── Formal Languages (6) ──
  { id: 'f1', name: 'Practice 1', courseId: 'formales', type: 'Exam', weight: 0.10, deadline: '2026-02-09', done: false, priority: 'High', notes: 'Can use iPad' },
  { id: 'f2', name: 'Partial 1', courseId: 'formales', type: 'Exam', weight: 0.20, deadline: '2026-02-18', done: false, priority: 'High', notes: 'Can use iPad' },
  { id: 'f3', name: 'Practice 2', courseId: 'formales', type: 'Exam', weight: 0.10, deadline: '2026-03-02', done: false, priority: 'High', notes: 'Can use iPad' },
  { id: 'f4', name: 'Partial 2', courseId: 'formales', type: 'Exam', weight: 0.20, deadline: '2026-03-25', done: false, priority: 'High', notes: 'Can use iPad' },
  { id: 'f5', name: 'Practice 3', courseId: 'formales', type: 'Exam', weight: 0.20, deadline: '2026-05-18', done: false, priority: 'High', notes: 'Can use iPad' },
  { id: 'f6', name: 'Partial 3', courseId: 'formales', type: 'Exam', weight: 0.20, deadline: '2026-05-11', done: false, priority: 'High', notes: 'Can use iPad' },
  // ── Physics II (17) ──
  { id: 'p1', name: 'Lab 1', courseId: 'physics', type: 'Lab', weight: 0.021, grade: 5.0, deadline: '2026-01-29', done: true, priority: 'Medium' },
  { id: 'p2', name: 'Lab 2', courseId: 'physics', type: 'Lab', weight: 0.021, grade: 4.7, deadline: '2026-02-05', done: true, priority: 'Medium' },
  { id: 'p3', name: 'Lab 3', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-02-12', done: false, priority: 'Medium' },
  { id: 'p4', name: 'Quiz 1', courseId: 'physics', type: 'Quiz', weight: 0.03, deadline: '2026-02-13', done: false, priority: 'Low' },
  { id: 'p5', name: 'Expo', courseId: 'physics', type: 'Presentation', weight: 0.10, deadline: '2026-02-17', done: false, priority: 'High' },
  { id: 'p6', name: 'Lab 4', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-02-19', done: false, priority: 'Medium' },
  { id: 'p7', name: 'Lab 5', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-02-26', done: false, priority: 'Medium' },
  { id: 'p8', name: 'Test 1', courseId: 'physics', type: 'Exam', weight: 0.20, deadline: '2026-02-28', done: false, priority: 'High' },
  { id: 'p9', name: 'Lab 6', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-03-12', done: false, priority: 'Medium' },
  { id: 'p10', name: 'Quiz 2', courseId: 'physics', type: 'Quiz', weight: 0.03, deadline: '2026-03-15', done: false, priority: 'Low' },
  { id: 'p11', name: 'Lab 7', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-03-19', done: false, priority: 'Medium' },
  { id: 'p12', name: 'Lab 8', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-03-26', done: false, priority: 'Medium' },
  { id: 'p13', name: 'Lab 9', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-04-09', done: false, priority: 'Medium' },
  { id: 'p14', name: 'Test 2', courseId: 'physics', type: 'Exam', weight: 0.20, deadline: '2026-04-11', done: false, priority: 'High' },
  { id: 'p15', name: 'Lab 10', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-04-16', done: false, priority: 'Medium' },
  { id: 'p16', name: 'Quiz 3', courseId: 'physics', type: 'Quiz', weight: 0.03, deadline: '2026-05-03', done: false, priority: 'Low' },
  { id: 'p17', name: 'Test 3', courseId: 'physics', type: 'Exam', weight: 0.20, deadline: '2026-05-23', done: false, priority: 'High' },
  // ── Algorithms (8) ──
  { id: 'a1', name: 'Test 1', courseId: 'algorithms', type: 'Exam', weight: 0.15, deadline: '2026-02-17', done: false, priority: 'High' },
  { id: 'a2', name: 'Project 1', courseId: 'algorithms', type: 'Project', weight: 0.15, deadline: '2026-03-24', done: false, priority: 'High' },
  { id: 'a3', name: 'Test 2', courseId: 'algorithms', type: 'Exam', weight: 0.15, deadline: '2026-03-31', done: false, priority: 'High' },
  { id: 'a4', name: 'Surprise Quiz 1', courseId: 'algorithms', type: 'Quiz', weight: 0.05, done: false, priority: 'Low' },
  { id: 'a5', name: 'Surprise Quiz 2', courseId: 'algorithms', type: 'Quiz', weight: 0.05, done: false, priority: 'Low' },
  { id: 'a6', name: 'Test 3', courseId: 'algorithms', type: 'Exam', weight: 0.15, deadline: '2026-05-12', done: false, priority: 'High' },
  { id: 'a7', name: 'Project 2', courseId: 'algorithms', type: 'Project', weight: 0.20, done: false, priority: 'High' },
  { id: 'a8', name: 'Class Participation', courseId: 'algorithms', type: 'Attendance', weight: 0.10, done: false, priority: 'Low' },
  // ── DB Management (9) ──
  { id: 'd1', name: 'Quiz 1', courseId: 'dbms', type: 'Quiz', weight: 0.05, grade: 5.0, deadline: '2026-02-10', done: true, priority: 'Low' },
  { id: 'd2', name: 'Test 1', courseId: 'dbms', type: 'Exam', weight: 0.15, deadline: '2026-02-17', done: false, priority: 'High' },
  { id: 'd3', name: 'Project 1', courseId: 'dbms', type: 'Project', weight: 0.10, deadline: '2026-03-10', done: false, priority: 'Medium' },
  { id: 'd4', name: 'Quiz 2', courseId: 'dbms', type: 'Quiz', weight: 0.05, deadline: '2026-03-17', done: false, priority: 'Low' },
  { id: 'd5', name: 'Test 2', courseId: 'dbms', type: 'Exam', weight: 0.20, deadline: '2026-03-24', done: false, priority: 'High' },
  { id: 'd6', name: 'Project 2', courseId: 'dbms', type: 'Project', weight: 0.10, deadline: '2026-04-07', done: false, priority: 'Medium' },
  { id: 'd7', name: 'Quiz 3', courseId: 'dbms', type: 'Quiz', weight: 0.05, deadline: '2026-04-21', done: false, priority: 'Low' },
  { id: 'd8', name: 'Test 3', courseId: 'dbms', type: 'Exam', weight: 0.15, deadline: '2026-05-12', done: false, priority: 'High' },
  { id: 'd9', name: 'Project 3', courseId: 'dbms', type: 'Project', weight: 0.15, deadline: '2026-05-19', done: false, priority: 'Medium' },
  // ── Prob & Stats (5) ──
  { id: 's1', name: 'Workshop - Test 1', courseId: 'stats', type: 'Exam', weight: 0.15, grade: 5.0, deadline: '2026-02-24', done: true, priority: 'High' },
  { id: 's2', name: 'Test 1', courseId: 'stats', type: 'Exam', weight: 0.25, deadline: '2026-03-06', done: false, priority: 'High' },
  { id: 's3', name: 'Workshop - Test 2', courseId: 'stats', type: 'Exam', weight: 0.20, deadline: '2026-04-07', done: false, priority: 'High' },
  { id: 's4', name: 'Workshop - Test 3', courseId: 'stats', type: 'Exam', weight: 0.15, deadline: '2026-05-05', done: false, priority: 'High' },
  { id: 's5', name: 'Test 2', courseId: 'stats', type: 'Exam', weight: 0.25, deadline: '2026-05-22', done: false, priority: 'High' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const getToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const ALL_TYPES: AssignmentType[] = ['Exam', 'Quiz', 'Lab', 'Project', 'Presentation', 'Attendance']
const ALL_DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']
const ALL_STATUSES: CourseStatus[] = ['Normal', 'At risk', 'Under Control']

const diffColor: Record<Difficulty, string> = { Hard: 'bg-red-500/15 text-red-400', Medium: 'bg-yellow-500/15 text-yellow-400', Easy: 'bg-green-500/15 text-green-400' }
const typeColor: Record<string, string> = { Exam: 'bg-red-500/15 text-red-400', Quiz: 'bg-orange-500/15 text-orange-400', Presentation: 'bg-yellow-500/15 text-yellow-400', Project: 'bg-blue-500/15 text-blue-400', Lab: 'bg-green-500/15 text-green-400', Attendance: 'bg-gray-500/15 text-gray-400' }
const topicStatusColor: Record<TopicStatus, string> = { 'Not seen': 'text-muted-foreground', Previewed: 'text-pink-400', Seen: 'text-yellow-400', Practiced: 'text-blue-400', Mastered: 'text-green-400' }
const topicTypeColor: Record<string, string> = { Concept: 'bg-amber-500/15 text-amber-400', Excercise: 'bg-blue-500/15 text-blue-400', Lab: 'bg-green-500/15 text-green-400', Proofs: 'bg-yellow-500/15 text-yellow-400' }

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
      <button onClick={() => { setDraft(value?.toFixed(1) ?? ''); setEditing(true) }} className="cursor-pointer w-full text-right">
        {value !== undefined ? (
          <span className={value >= 3 ? 'text-green-400' : 'text-red-400'}>{value.toFixed(1)}</span>
        ) : (
          <span className="text-muted-foreground/30">—</span>
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
      className="w-12 bg-transparent border-b border-foreground/30 text-right outline-none text-xs tabular-nums"
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
      <button onClick={() => { setDraft(value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)); setEditing(true) }} className="cursor-pointer text-right text-muted-foreground">
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
      className="w-10 bg-transparent border-b border-foreground/30 text-right outline-none text-xs tabular-nums"
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
    <tr className="border-b border-border/20 bg-foreground/[0.02]">
      <td className="px-5 py-2"><Plus className="h-3.5 w-3.5 text-muted-foreground" /></td>
      <td className="py-2">
        <input
          ref={ref}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
          placeholder="Assignment name..."
          className="bg-transparent outline-none text-xs font-medium w-full placeholder:text-muted-foreground/30"
        />
      </td>
      <td className="py-2">
        <select value={type} onChange={(e) => setType(e.target.value as AssignmentType)} className="bg-transparent outline-none text-[10px] cursor-pointer">
          {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td className="py-2 text-right">
        <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="%" className="bg-transparent outline-none text-xs tabular-nums w-10 text-right placeholder:text-muted-foreground/30" />
      </td>
      <td className="py-2" />
      <td className="py-2 text-right">
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="bg-transparent outline-none text-[10px] tabular-nums cursor-pointer" />
      </td>
      <td className="py-2 pl-2">
        <div className="flex gap-1">
          <button onClick={submit} className="cursor-pointer text-green-400 hover:text-green-300"><CheckCircle2 className="h-3.5 w-3.5" /></button>
          <button onClick={onCancel} className="cursor-pointer text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      </td>
    </tr>
  )
}

// ── Course Detail Panel ──────────────────────────────────────────────────────

function CourseDetail({ course, assignments, topics, semesters, onUpdateTopics, onUpdateCourse, onDeleteCourse }: {
  course: Course
  assignments: Assignment[]
  topics: Topic[]
  semesters: string[]
  onUpdateTopics: (fn: (prev: Topic[]) => Topic[]) => void
  onUpdateCourse: (patch: Partial<Course>) => void
  onDeleteCourse: () => void
}) {
  const [addingTopic, setAddingTopic] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(course.name)
  const newRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (addingTopic) newRef.current?.focus() }, [addingTopic])
  useEffect(() => { if (editingName) nameRef.current?.focus() }, [editingName])

  const Icon = iconOf(course.iconKey)
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

  const Prop = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-4 py-1.5">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="text-xs">{children}</span>
    </div>
  )

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
    <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={cycleIcon} title="Change icon" className="cursor-pointer"><Icon className={`h-5 w-5 ${course.color}`} /></button>
        {editingName ? (
          <input
            ref={nameRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setDraftName(course.name); setEditingName(false) } }}
            className="text-base font-semibold bg-transparent border-b border-foreground/30 outline-none"
          />
        ) : (
          <button onClick={() => { setDraftName(course.name); setEditingName(true) }} className="cursor-pointer text-base font-semibold hover:text-foreground/80">{course.name}</button>
        )}
        <Badge className={`text-[9px] px-1.5 py-0 ${diffColor[course.difficulty]}`}>{course.difficulty}</Badge>
        <button onClick={onDeleteCourse} className="cursor-pointer ml-auto text-muted-foreground/40 hover:text-red-400 transition-colors" title="Delete course">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Properties */}
        <div className="flex flex-col sm:border-r sm:border-border/30 sm:pr-6">
          <Prop label="Semester">
            <select
              value={course.semester}
              onChange={(e) => onUpdateCourse({ semester: e.target.value })}
              className="cursor-pointer bg-secondary/50 rounded px-1.5 py-0.5 text-[10px] outline-none"
            >
              {semesters.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Prop>
          <Prop label="Credits"><EditableNumber value={course.credits} onChange={(v) => onUpdateCourse({ credits: v ?? course.credits })} /></Prop>
          <Prop label="Status">
            <select
              value={course.status}
              onChange={(e) => onUpdateCourse({ status: e.target.value as CourseStatus })}
              className="cursor-pointer bg-secondary/50 rounded px-1.5 py-0.5 text-[10px] outline-none"
            >
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Prop>
          <Prop label="Difficulty">
            <select
              value={course.difficulty}
              onChange={(e) => onUpdateCourse({ difficulty: e.target.value as Difficulty })}
              className={`cursor-pointer rounded px-1.5 py-0.5 text-[10px] outline-none ${diffColor[course.difficulty]}`}
            >
              {ALL_DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Prop>
          <Prop label="Current Grade">
            {currentGrade !== undefined ? (
              <span className={`tabular-nums font-bold text-sm ${currentGrade >= 3 ? 'text-green-400' : 'text-red-400'}`}>{currentGrade.toFixed(2)}/5.0</span>
            ) : (
              <span className="text-muted-foreground">No grades yet</span>
            )}
          </Prop>
          <Prop label="Best Possible"><span className="tabular-nums font-medium text-green-400">{maxGrade.toFixed(2)}/5.0</span></Prop>
          <Prop label="Worst Possible"><span className={`tabular-nums font-medium ${minGrade >= 3 ? 'text-green-400' : 'text-red-400'}`}>{minGrade.toFixed(2)}/5.0</span></Prop>
          <Prop label="Graded">
            <div className="flex items-center gap-2">
              <span className="tabular-nums">{gradedPct.toFixed(0)}%</span>
              <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-green-500/60 transition-all" style={{ width: `${gradedPct}%` }} />
              </div>
            </div>
          </Prop>
        </div>

        {/* Topics */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Topics</h3>
            <button onClick={() => setAddingTopic(true)} className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"><Plus className="h-3 w-3" /> Add</button>
          </div>
          {myTopics.length === 0 && !addingTopic && (
            <p className="text-xs text-muted-foreground/50 py-2">No topics yet</p>
          )}
          <div className="flex flex-col gap-1.5">
            {myTopics.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-secondary/30 transition-colors group">
                <button onClick={() => cycleMastery(t.id)} className="cursor-pointer shrink-0">
                  <div className={`h-3.5 w-3.5 rounded-full border-2 ${t.status === 'Mastered' ? 'bg-green-400 border-green-400' : `border-muted-foreground/30`}`} />
                </button>
                <span className="text-xs font-medium flex-1">{t.name}</span>
                {t.chapter && <span className="text-[10px] text-muted-foreground">{t.chapter}</span>}
                {t.types.map((tp) => (
                  <Badge key={tp} className={`text-[8px] px-1 py-0 ${topicTypeColor[tp] ?? 'bg-secondary'}`}>{tp}</Badge>
                ))}
                <span className={`text-[10px] ${topicStatusColor[t.status]}`}>{t.status}</span>
                {t.priority !== 'Medium' && <Badge className={`text-[8px] px-1 py-0 ${t.priority === 'High' ? 'bg-orange-500/15 text-orange-400' : 'bg-gray-500/15 text-gray-400'}`}>{t.priority}</Badge>}
                <button onClick={() => deleteTopic(t.id)} className="cursor-pointer opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400 transition-all"><Trash2 className="h-3 w-3" /></button>
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
                  className="bg-transparent outline-none text-xs flex-1 placeholder:text-muted-foreground/30"
                />
                <button onClick={addTopic} className="cursor-pointer text-green-400"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                <button onClick={() => setAddingTopic(false)} className="cursor-pointer text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>
        </div>
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
    const [color, bg] = PALETTE[idx % PALETTE.length]
    const iconKey = ICON_CYCLE[idx % ICON_CYCLE.length]
    const id = `course-${Date.now()}`
    updateCourses((p) => [...p, { id, name: n, difficulty: 'Medium', iconKey, color, bg, semester: activeSemester, status: 'Normal', credits: 3 }])
    setSelectedCourse(id)
  }
  const deleteCourse = (id: string) => {
    const related = assignments.filter((a) => a.courseId === id)
    related.forEach((a) => { if (a.deadline && !a.done) syncAssignmentToCalendar(a, courseMap[id]?.name || id, 'delete') })
    update((p) => p.filter((a) => a.courseId !== id))
    updateTopics((p) => p.filter((t) => t.courseId !== id))
    updateCourses((p) => p.filter((c) => c.id !== id))
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

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />

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
            <div key={s} className={`group flex items-center rounded-lg border transition-all ${
              active ? 'border-foreground/30 bg-foreground/[0.06]' : 'border-border hover:border-foreground/20'
            }`}>
              <button
                onClick={() => changeSemester(s)}
                className={`cursor-pointer text-xs pl-3 pr-2 py-1.5 ${active ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {s}
              </button>
              {empty && (
                <button onClick={() => deleteSemester(s)} title="Delete empty semester" className="cursor-pointer pr-2 text-muted-foreground/40 hover:text-red-400">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )
        })}
        {addingSemester ? (
          <div className="flex items-center rounded-lg border border-foreground/30 bg-foreground/[0.04] px-2 py-1">
            <input
              ref={semAddRef}
              value={newSemesterName}
              onChange={(e) => setNewSemesterName(e.target.value)}
              onBlur={addSemester}
              onKeyDown={(e) => { if (e.key === 'Enter') addSemester(); if (e.key === 'Escape') { setAddingSemester(false); setNewSemesterName('') } }}
              placeholder="5th Semester..."
              className="bg-transparent outline-none text-xs w-28 placeholder:text-muted-foreground/30"
            />
          </div>
        ) : (
          <button onClick={() => setAddingSemester(true)} className="cursor-pointer flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
            <Plus className="h-3 w-3" /> Semester
          </button>
        )}
      </div>

      {/* PREP */}
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.03] px-5 py-4">
        <p className="text-xs font-bold text-orange-400 mb-1">P.R.E.P = Preview &rarr; Record &rarr; Exercise &rarr; Promote</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="text-foreground/70">Preview</span> &mdash; Skim topic, 3 ideas + 2 doubts &nbsp;|&nbsp;
          <span className="text-foreground/70">Record</span> &mdash; In class: defs, formulas, examples &nbsp;|&nbsp;
          <span className="text-foreground/70">Exercise</span> &mdash; Same day: 5-10 problems &nbsp;|&nbsp;
          <span className="text-foreground/70">Promote</span> &mdash; Weekly review + mark mastered
        </p>
      </div>

      {/* Course Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {activeCourses.map((c) => {
          const Icon = iconOf(c.iconKey)
          const count = assignments.filter((a) => a.courseId === c.id).length
          const done = assignments.filter((a) => a.courseId === c.id && a.done).length
          const g = gradesByCourse[c.id]
          const sel = selectedCourse === c.id
          return (
            <button
              key={c.id}
              onClick={() => setSelectedCourse(sel ? null : c.id)}
              className={`cursor-pointer flex flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-all ${
                sel ? 'border-foreground/30 bg-foreground/[0.05] ring-1 ring-foreground/10' : 'border-border hover:border-foreground/20 hover:bg-foreground/[0.02]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${c.color}`} />
                <Badge className={`text-[9px] px-1.5 py-0 ${diffColor[c.difficulty]}`}>{c.difficulty}</Badge>
              </div>
              <p className="text-xs font-medium leading-tight">{c.name}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{done}/{count}</span>
                {g && g.gradedWeight > 0 && (
                  <span className={`text-[10px] font-bold tabular-nums ${(g.gradeSum / g.gradedWeight) >= 3 ? 'text-green-400' : 'text-red-400'}`}>{(g.gradeSum / g.gradedWeight).toFixed(1)}</span>
                )}
              </div>
            </button>
          )
        })}

        {/* Add course card */}
        {addingCourse ? (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-foreground/30 bg-foreground/[0.03] px-4 py-3">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <input
              ref={courseAddRef}
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              onBlur={addCourse}
              onKeyDown={(e) => { if (e.key === 'Enter') addCourse(); if (e.key === 'Escape') { setAddingCourse(false); setNewCourseName('') } }}
              placeholder="Course name..."
              className="bg-transparent outline-none text-xs font-medium placeholder:text-muted-foreground/30"
            />
          </div>
        ) : (
          <button
            onClick={() => setAddingCourse(true)}
            className="cursor-pointer flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border px-4 py-3 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all min-h-[88px]"
          >
            <Plus className="h-4 w-4" />
            <span className="text-[10px]">Add course</span>
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
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Upcoming */}
        <WidgetCard title="Upcoming Deadlines" description={`${upcoming.length} remaining`} delay={0.1} className="lg:col-span-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">All caught up</p>
          ) : (
            <div className="flex flex-col gap-1 max-h-[340px] overflow-y-auto">
              {upcoming.map((a) => {
                const c = courseMap[a.courseId]
                const days = daysUntil(a.deadline!)
                const urgent = days <= 7
                return (
                  <div key={a.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${urgent ? 'bg-red-500/[0.05]' : 'hover:bg-secondary/50'}`}>
                    <button onClick={() => toggleDone(a.id)} className="cursor-pointer shrink-0">
                      {urgent ? <AlertCircle className="h-3.5 w-3.5 text-red-400" /> : <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c?.name}</p>
                    </div>
                    <Badge className={`text-[9px] shrink-0 ${typeColor[a.type]}`}>{a.type}</Badge>
                    <span className="text-xs tabular-nums text-muted-foreground shrink-0">{fmtDate(a.deadline!)}</span>
                    <Badge variant="secondary" className={`text-[10px] tabular-nums shrink-0 ${urgent ? 'text-red-400' : ''}`}>{days}d</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </WidgetCard>

        {/* Overview */}
        <WidgetCard title={activeSemester || 'Semester'} description="Semester overview" delay={0.15}>
          {activeIsEmpty ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No courses yet — add one above</p>
          ) : (
            <div className="flex flex-col gap-3 py-1">
              <div className="flex items-center gap-3">
                <GraduationCap className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className={`text-2xl font-bold tabular-nums ${overallGPA !== undefined ? (overallGPA >= 3 ? 'text-green-400' : 'text-red-400') : ''}`}>
                    {overallGPA !== undefined ? overallGPA.toFixed(2) : '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Overall GPA · {activeCourses.reduce((s, c) => s + c.credits, 0)} credits
                    {maxOverallGPA < 5.0 && <span className="ml-1">· max {maxOverallGPA.toFixed(2)}</span>}
                  </p>
                </div>
              </div>
              <div className="border-t border-border/50 pt-3 flex flex-col gap-2">
                {activeCourses.map((c) => {
                  const g = gradesByCourse[c.id]
                  const courseGrade = g && g.gradedWeight > 0 ? g.gradeSum / g.gradedWeight : undefined
                  const pct = g && g.totalWeight > 0 ? Math.round((g.gradedWeight / g.totalWeight) * 100) : 0
                  return (
                    <div key={c.id} className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${c.bg}`} />
                      <span className="text-xs flex-1 truncate">{c.name}</span>
                      <div className="w-12 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full bg-foreground/40 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-[10px] font-bold tabular-nums w-8 text-right ${courseGrade !== undefined ? (courseGrade >= 3 ? 'text-green-400' : 'text-red-400') : 'text-muted-foreground'}`}>
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-wrap gap-1.5">
            {ALL_TYPES.map((t) => {
              const active = selectedTypes.has(t)
              const count = semesterAssignments.filter((a) => a.type === t && (!selectedCourse || a.courseId === selectedCourse)).length
              if (count === 0) return null
              return (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                    active ? `${typeColor[t]} border-current/20` : 'text-muted-foreground/40 border-border hover:text-muted-foreground'
                  }`}
                >
                  {t} ({count})
                </button>
              )
            })}
          </div>
          {selectedCourse && (
            <button onClick={() => setAdding(true)} className="cursor-pointer flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-secondary">
              <Plus className="h-3 w-3" /> Add
            </button>
          )}
        </div>

        {!selectedCourse && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No assignments in {activeSemester || 'this semester'} yet. Select a course above, then hit <span className="text-foreground/70">Add</span>.
          </p>
        )}

        {/* Table */}
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-5 py-2 w-6"></th>
                <th className="py-2 text-left font-medium">
                  <button onClick={() => toggleSort('name')} className="cursor-pointer flex items-center gap-1 hover:text-foreground transition-colors">Name <SortIcon k="name" /></button>
                </th>
                {!selectedCourse && <th className="py-2 text-left font-medium">Course</th>}
                <th className="py-2 text-left font-medium">Type</th>
                <th className="py-2 text-right font-medium">
                  <button onClick={() => toggleSort('weight')} className="cursor-pointer flex items-center gap-1 ml-auto hover:text-foreground transition-colors">Weight <SortIcon k="weight" /></button>
                </th>
                <th className="py-2 text-right font-medium">
                  <button onClick={() => toggleSort('grade')} className="cursor-pointer flex items-center gap-1 ml-auto hover:text-foreground transition-colors">Grade <SortIcon k="grade" /></button>
                </th>
                <th className="py-2 text-right font-medium">
                  <button onClick={() => toggleSort('deadline')} className="cursor-pointer flex items-center gap-1 ml-auto hover:text-foreground transition-colors">Deadline <SortIcon k="deadline" /></button>
                </th>
                <th className="py-2 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const c = courseMap[a.courseId]
                const isPast = a.deadline && a.deadline < getToday() && !a.done
                return (
                  <tr key={a.id} className={`border-b border-border/20 transition-colors hover:bg-secondary/30 group ${isPast ? 'opacity-40' : ''} ${a.done ? 'opacity-60' : ''}`}>
                    <td className="px-5 py-2.5">
                      <button onClick={() => toggleDone(a.id)} className="cursor-pointer">
                        {a.done
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                          : <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 hover:border-foreground/50 transition-colors" />
                        }
                      </button>
                    </td>
                    <td className="py-2.5">
                      <span className={`font-medium ${a.done ? 'line-through' : ''}`}>{a.name}</span>
                      {a.notes && <span className="ml-2 text-[10px] text-muted-foreground">({a.notes})</span>}
                    </td>
                    {!selectedCourse && (
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className={`h-2 w-2 rounded-full ${c?.bg}`} />
                          <span className="text-muted-foreground">{c?.name}</span>
                        </div>
                      </td>
                    )}
                    <td className="py-2.5">
                      <select
                        value={a.type}
                        onChange={(e) => setField(a.id, { type: e.target.value as AssignmentType })}
                        className={`cursor-pointer bg-transparent outline-none text-[9px] px-1.5 py-0.5 rounded-full border-0 appearance-none ${typeColor[a.type]}`}
                      >
                        {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      <EditableNumber
                        value={a.weight * 100}
                        suffix="%"
                        onChange={(v) => setField(a.id, { weight: (v ?? 0) / 100 })}
                      />
                    </td>
                    <td className="py-2.5 text-right tabular-nums"><EditableGrade value={a.grade} onChange={(v) => setGrade(a.id, v)} /></td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      <input
                        type="date"
                        value={a.deadline ?? ''}
                        onChange={(e) => setField(a.id, { deadline: e.target.value || undefined })}
                        className="cursor-pointer bg-transparent outline-none text-[10px] tabular-nums text-muted-foreground w-[100px] text-right"
                      />
                    </td>
                    <td className="py-2.5 pr-4">
                      <button onClick={() => deleteAssignment(a.id)} className="cursor-pointer opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400 transition-all">
                        <Trash2 className="h-3 w-3" />
                      </button>
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
    </PageShell>
  )
}
