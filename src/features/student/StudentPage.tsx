import { useState, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Badge } from '@/components/ui/badge'
import {
  GraduationCap,
  FlaskConical,
  Code2,
  Database,
  BarChart3,
  Palette,
  FileCode,
  CalendarDays,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react'

// ── Notion "Real Academia" Data ──────────────────────────────────────────────

type Difficulty = 'Hard' | 'Medium' | 'Easy'
type AssignmentStatus = 'Not Started' | 'Planning' | 'Studying' | 'Working' | 'Done'
type Priority = 'Low' | 'Medium' | 'High' | 'Urgent'
type AssignmentType = 'Exam' | 'Quiz' | 'Presentation' | 'Project' | 'Homework' | 'Lab'

interface Course {
  id: string
  name: string
  difficulty: Difficulty
  icon: typeof GraduationCap
  color: string
}

interface Assignment {
  name: string
  courseId: string
  type: AssignmentType
  weight: number
  grade?: number
  deadline?: string
  status: AssignmentStatus
  priority: Priority
  notes?: string
}

const COURSES: Course[] = [
  { id: 'formales', name: 'Formal Languages', difficulty: 'Hard', icon: FileCode, color: 'text-orange-400' },
  { id: 'physics', name: 'Physics II', difficulty: 'Hard', icon: FlaskConical, color: 'text-pink-400' },
  { id: 'algorithms', name: 'Algorithms', difficulty: 'Easy', icon: Code2, color: 'text-red-400' },
  { id: 'dbms', name: 'DB Management', difficulty: 'Medium', icon: Database, color: 'text-blue-400' },
  { id: 'stats', name: 'Prob & Stats', difficulty: 'Easy', icon: BarChart3, color: 'text-green-400' },
  { id: 'imagination', name: 'Creativity', difficulty: 'Easy', icon: Palette, color: 'text-purple-400' },
]

const ASSIGNMENTS: Assignment[] = [
  // ── Formal Languages ──
  { name: 'Practice 1', courseId: 'formales', type: 'Exam', weight: 0.10, deadline: '2026-02-09', status: 'Not Started', priority: 'High', notes: 'Can use iPad' },
  { name: 'Partial 1', courseId: 'formales', type: 'Exam', weight: 0.20, deadline: '2026-02-18', status: 'Not Started', priority: 'High', notes: 'Can use iPad' },
  { name: 'Practice 2', courseId: 'formales', type: 'Exam', weight: 0.10, deadline: '2026-03-02', status: 'Not Started', priority: 'High', notes: 'Can use iPad' },
  { name: 'Partial 2', courseId: 'formales', type: 'Exam', weight: 0.20, deadline: '2026-03-25', status: 'Not Started', priority: 'High', notes: 'Can use iPad' },
  { name: 'Practice 3', courseId: 'formales', type: 'Exam', weight: 0.10, status: 'Not Started', priority: 'High', notes: 'Can use iPad' },
  { name: 'Partial 3', courseId: 'formales', type: 'Exam', weight: 0.20, deadline: '2026-05-11', status: 'Not Started', priority: 'High', notes: 'Can use iPad' },
  // ── Physics II ──
  { name: 'Quiz 1', courseId: 'physics', type: 'Quiz', weight: 0.03, deadline: '2026-02-13', status: 'Not Started', priority: 'Low' },
  { name: 'Expo', courseId: 'physics', type: 'Presentation', weight: 0.10, deadline: '2026-02-17', status: 'Not Started', priority: 'High' },
  { name: 'Test 1', courseId: 'physics', type: 'Exam', weight: 0.20, deadline: '2026-02-28', status: 'Not Started', priority: 'High' },
  { name: 'Quiz 2', courseId: 'physics', type: 'Quiz', weight: 0.03, deadline: '2026-03-15', status: 'Not Started', priority: 'Low' },
  { name: 'Test 2', courseId: 'physics', type: 'Exam', weight: 0.20, deadline: '2026-04-11', status: 'Not Started', priority: 'High' },
  { name: 'Quiz 3', courseId: 'physics', type: 'Quiz', weight: 0.03, deadline: '2026-05-03', status: 'Not Started', priority: 'Low' },
  { name: 'Test 3', courseId: 'physics', type: 'Exam', weight: 0.20, deadline: '2026-05-23', status: 'Not Started', priority: 'High' },
  // ── Data Structures & Algorithms ──
  { name: 'Surprise Quiz 1', courseId: 'algorithms', type: 'Quiz', weight: 0.05, status: 'Not Started', priority: 'Low' },
  { name: 'Surprise Quiz 2', courseId: 'algorithms', type: 'Quiz', weight: 0.05, status: 'Not Started', priority: 'Low' },
  // ── Data Management Systems ──
  { name: 'Quiz 1', courseId: 'dbms', type: 'Quiz', weight: 0.05, grade: 5.0, deadline: '2026-02-10', status: 'Done', priority: 'Low' },
  { name: 'Quiz 2', courseId: 'dbms', type: 'Quiz', weight: 0.05, deadline: '2026-03-17', status: 'Not Started', priority: 'Low' },
  { name: 'Test 2', courseId: 'dbms', type: 'Exam', weight: 0.20, deadline: '2026-03-24', status: 'Not Started', priority: 'High' },
  { name: 'Quiz 3', courseId: 'dbms', type: 'Quiz', weight: 0.05, deadline: '2026-04-21', status: 'Not Started', priority: 'Low' },
  { name: 'Test 3', courseId: 'dbms', type: 'Exam', weight: 0.15, deadline: '2026-05-12', status: 'Not Started', priority: 'High' },
  // ── Probability & Statistics ──
  { name: 'Workshop - Test 1', courseId: 'stats', type: 'Exam', weight: 0.15, grade: 5.0, deadline: '2026-02-24', status: 'Done', priority: 'High' },
  { name: 'Test 1', courseId: 'stats', type: 'Exam', weight: 0.25, deadline: '2026-03-06', status: 'Not Started', priority: 'High' },
  { name: 'Workshop - Test 2', courseId: 'stats', type: 'Exam', weight: 0.20, deadline: '2026-04-07', status: 'Not Started', priority: 'High' },
  { name: 'Workshop - Test 3', courseId: 'stats', type: 'Exam', weight: 0.15, deadline: '2026-05-05', status: 'Not Started', priority: 'High' },
  { name: 'Test 2', courseId: 'stats', type: 'Exam', weight: 0.25, deadline: '2026-05-22', status: 'Not Started', priority: 'High' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)

function daysUntil(date: string) {
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
  return diff
}

function fmtDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const difficultyColor: Record<Difficulty, string> = {
  Hard: 'bg-red-500/15 text-red-400',
  Medium: 'bg-yellow-500/15 text-yellow-400',
  Easy: 'bg-green-500/15 text-green-400',
}

const typeColor: Record<string, string> = {
  Exam: 'bg-red-500/15 text-red-400',
  Quiz: 'bg-orange-500/15 text-orange-400',
  Presentation: 'bg-yellow-500/15 text-yellow-400',
  Project: 'bg-blue-500/15 text-blue-400',
  Homework: 'bg-purple-500/15 text-purple-400',
  Lab: 'bg-green-500/15 text-green-400',
}

const statusIcon = (s: AssignmentStatus) =>
  s === 'Done' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />

// ── Component ────────────────────────────────────────────────────────────────

export function StudentPage() {
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)

  const upcoming = useMemo(
    () =>
      ASSIGNMENTS
        .filter((a) => a.deadline && a.deadline >= TODAY && a.status !== 'Done')
        .sort((a, b) => a.deadline!.localeCompare(b.deadline!)),
    [],
  )

  const courseAssignments = useMemo(
    () => (selectedCourse ? ASSIGNMENTS.filter((a) => a.courseId === selectedCourse) : ASSIGNMENTS),
    [selectedCourse],
  )

  const courseMap = Object.fromEntries(COURSES.map((c) => [c.id, c]))

  const gradesByCourse = useMemo(() => {
    const map: Record<string, { graded: number; weighted: number }> = {}
    for (const a of ASSIGNMENTS) {
      if (!map[a.courseId]) map[a.courseId] = { graded: 0, weighted: 0 }
      if (a.grade !== undefined) {
        map[a.courseId].graded += a.weight
        map[a.courseId].weighted += (a.grade / 5.0) * a.weight
      }
    }
    return map
  }, [])

  return (
    <PageShell>
      {/* ── PREP Methodology ── */}
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.03] px-5 py-4">
        <p className="text-xs font-bold text-orange-400 mb-1">P.R.E.P = Preview &rarr; Record &rarr; Exercise &rarr; Promote</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="text-foreground/70">Preview</span> &mdash; Skim topic, 3 ideas + 2 doubts &nbsp;|&nbsp;
          <span className="text-foreground/70">Record</span> &mdash; In class: defs, formulas, examples &nbsp;|&nbsp;
          <span className="text-foreground/70">Exercise</span> &mdash; Same day: 5-10 problems &nbsp;|&nbsp;
          <span className="text-foreground/70">Promote</span> &mdash; Weekly review + mark mastered
        </p>
      </div>

      {/* ── Course Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {COURSES.map((course) => {
          const count = ASSIGNMENTS.filter((a) => a.courseId === course.id).length
          const grades = gradesByCourse[course.id]
          const isSelected = selectedCourse === course.id
          return (
            <button
              key={course.id}
              onClick={() => setSelectedCourse(isSelected ? null : course.id)}
              className={`flex flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-all ${
                isSelected ? 'border-foreground/30 bg-foreground/[0.05]' : 'border-border hover:border-foreground/20 hover:bg-foreground/[0.02]'
              }`}
            >
              <div className="flex items-center gap-2">
                <course.icon className={`h-4 w-4 ${course.color}`} />
                <Badge className={`text-[9px] px-1.5 py-0 ${difficultyColor[course.difficulty]}`}>
                  {course.difficulty}
                </Badge>
              </div>
              <p className="text-xs font-medium leading-tight">{course.name}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{count} items</span>
                {grades && grades.graded > 0 && (
                  <span className="text-[10px] font-bold tabular-nums text-foreground/80">
                    {((grades.weighted / grades.graded) * 5).toFixed(1)}/5
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Upcoming Deadlines ── */}
        <WidgetCard title="Upcoming Deadlines" description={`${upcoming.length} remaining`} delay={0.1} className="lg:col-span-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No upcoming deadlines</p>
          ) : (
            <div className="flex flex-col gap-1">
              {upcoming.map((a, i) => {
                const course = courseMap[a.courseId]
                const days = daysUntil(a.deadline!)
                const isUrgent = days <= 7
                return (
                  <div
                    key={`${a.courseId}-${a.name}-${i}`}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                      isUrgent ? 'bg-red-500/[0.05]' : 'hover:bg-secondary/50'
                    }`}
                  >
                    {isUrgent ? (
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                    ) : (
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.name}</p>
                      <p className="text-[10px] text-muted-foreground">{course?.name}</p>
                    </div>
                    <Badge className={`text-[9px] shrink-0 ${typeColor[a.type] ?? 'bg-secondary text-foreground'}`}>
                      {a.type}
                    </Badge>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground shrink-0">
                      {fmtDate(a.deadline!)}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] tabular-nums shrink-0 ${isUrgent ? 'text-red-400' : ''}`}
                    >
                      {days}d
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </WidgetCard>

        {/* ── Semester Overview ── */}
        <WidgetCard title="2nd Year" description="Semester overview" delay={0.15}>
          <div className="flex flex-col gap-3 py-1">
            <div className="flex items-center gap-3">
              <GraduationCap className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold tabular-nums">6</p>
                <p className="text-[10px] text-muted-foreground">Active courses</p>
              </div>
            </div>
            <div className="border-t border-border/50 pt-3 flex flex-col gap-2">
              {COURSES.map((c) => {
                const grades = gradesByCourse[c.id]
                const totalWeight = ASSIGNMENTS.filter((a) => a.courseId === c.id).reduce((sum, a) => sum + a.weight, 0)
                const gradedPct = grades ? Math.round((grades.graded / totalWeight) * 100) : 0
                return (
                  <div key={c.id} className="flex items-center gap-2">
                    <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                    <span className="text-xs flex-1 truncate">{c.name}</span>
                    <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-foreground/40 transition-all"
                        style={{ width: `${gradedPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">{gradedPct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </WidgetCard>
      </div>

      {/* ── All Assignments ── */}
      <WidgetCard
        title={selectedCourse ? `${courseMap[selectedCourse]?.name} — Assignments` : 'All Assignments'}
        description={`${courseAssignments.length} total`}
        delay={0.2}
      >
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-5 py-2 text-left font-medium w-6"></th>
                <th className="py-2 text-left font-medium">Name</th>
                {!selectedCourse && <th className="py-2 text-left font-medium">Course</th>}
                <th className="py-2 text-left font-medium">Type</th>
                <th className="py-2 text-right font-medium">Weight</th>
                <th className="py-2 text-right font-medium">Grade</th>
                <th className="py-2 text-right font-medium">Deadline</th>
                <th className="py-2 text-left font-medium pl-3">Priority</th>
              </tr>
            </thead>
            <tbody>
              {courseAssignments.map((a, i) => {
                const course = courseMap[a.courseId]
                const isPast = a.deadline && a.deadline < TODAY && a.status !== 'Done'
                return (
                  <tr
                    key={`${a.courseId}-${a.name}-${i}`}
                    className={`border-b border-border/30 transition-colors hover:bg-secondary/30 ${isPast ? 'opacity-50' : ''}`}
                  >
                    <td className="px-5 py-2.5">{statusIcon(a.status)}</td>
                    <td className="py-2.5">
                      <span className="font-medium">{a.name}</span>
                      {a.notes && (
                        <span className="ml-2 text-[10px] text-muted-foreground">({a.notes})</span>
                      )}
                    </td>
                    {!selectedCourse && (
                      <td className="py-2.5">
                        <span className={`${course?.color ?? ''}`}>{course?.name}</span>
                      </td>
                    )}
                    <td className="py-2.5">
                      <Badge className={`text-[9px] px-1.5 py-0 ${typeColor[a.type] ?? 'bg-secondary'}`}>
                        {a.type}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {(a.weight * 100).toFixed(0)}%
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {a.grade !== undefined ? (
                        <span className={a.grade >= 3 ? 'text-green-400' : 'text-red-400'}>
                          {a.grade.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {a.deadline ? fmtDate(a.deadline) : '—'}
                    </td>
                    <td className="py-2.5 pl-3">
                      {a.priority === 'High' || a.priority === 'Urgent' ? (
                        <ChevronRight className="h-3.5 w-3.5 text-orange-400" />
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </WidgetCard>
    </PageShell>
  )
}
