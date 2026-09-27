import { ArrowRight, BookOpen, CalendarDays, ListTodo, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fmtDate, type Assignment, type Course } from './student-types'
import type { StudentOverview } from './student-overview'

export function StudentOverviewCards({ semester, today, overview, priorityCourse, onOpenPriority, onAddCourse, onAddAssignment }: {
  semester: string
  today: string
  overview: StudentOverview
  priorityCourse?: Course
  onOpenPriority: (assignment: Assignment) => void
  onAddCourse: () => void
  onAddAssignment: () => void
}) {
  const next = overview.priorityAssignment
  const overdue = Boolean(next?.deadline && next.deadline < today)
  const action = next
    ? { label: 'Review assignment', onClick: () => onOpenPriority(next) }
    : overview.courseCount > 0
      ? { label: overview.courseCount === 1 ? 'Add an assignment' : 'Choose a course', onClick: onAddAssignment }
      : { label: 'Add your first course', onClick: onAddCourse }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(14rem,0.85fr)]">
      <section className="relative flex min-h-[18rem] flex-col overflow-hidden rounded-[1.75rem] border border-accent/20 bg-focus-surface p-5 text-[#140C38] shadow-card dark:text-white sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-20 size-56 rounded-full bg-white/30 blur-3xl dark:bg-[#CFEF87]/15" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-[#5A44B1] dark:text-[#E1DBFF]"><Sparkles className="size-4" /> Study flow</span>
          <span className="max-w-full truncate rounded-full bg-white/45 px-3 py-1 text-xs font-semibold dark:bg-white/12">{semester || 'Your semester'}</span>
        </div>

        <div className="relative my-auto py-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#5D5382] dark:text-[#D7D0FA]">
            {overdue ? 'Needs your attention' : next ? 'Your next deadline' : overview.openCount ? 'Keep your momentum' : 'A fresh page'}
          </p>
          <h2 className="max-w-xl text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl">
            {next?.name ?? (overview.openCount ? `${overview.openCount} open ${overview.openCount === 1 ? 'assignment' : 'assignments'}` : overview.courseCount ? 'Ready for what comes next?' : 'Start with one course.')}
          </h2>
          <p className="mt-3 text-sm text-[#5D5382] dark:text-[#DDD6FF]">
            {next?.deadline
              ? `${priorityCourse?.name ?? 'Course'} · ${next.type} · ${overdue ? 'Overdue since' : 'Due'} ${fmtDate(next.deadline)}`
              : overview.openCount ? 'Add a deadline to see which task comes first.' : overview.courseCount ? 'Add an assignment when you know your next deadline.' : 'Add a course to bring your study work together.'}
          </p>
          <Button size="lg" onClick={action.onClick} className="mt-6 min-h-11">
            {action.label}<ArrowRight className="size-4" />
          </Button>
        </div>

        <div className="relative flex flex-wrap gap-2" aria-label="P.R.E.P. study method">
          {['Preview', 'Record', 'Exercise', 'Promote'].map((step, index) => (
            <span key={step} className={`rounded-full px-3 py-1 text-xs font-medium ${index % 2 ? 'bg-white/35 dark:bg-white/12' : 'bg-[#E5F8BF] text-[#354321] dark:bg-[#CFEF87] dark:text-[#263711]'}`}>{step}</span>
          ))}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        <div className="flex min-h-28 flex-col justify-between rounded-[1.4rem] border border-success/20 bg-progress-surface p-4 text-[#1F3117] shadow-card dark:bg-[#CFEF87] dark:text-[#18220A]">
          <div className="flex items-center justify-between gap-2 text-sm font-semibold"><span>This week</span><CalendarDays className="size-5" /></div>
          <div><p className="font-mono text-3xl font-semibold tabular-nums">{overview.dueThisWeek}</p><p className="text-xs">{overview.dueThisWeek === 1 ? 'open deadline' : 'open deadlines'} · Mon–Sun</p></div>
        </div>
        <div className="surface flex min-h-28 flex-col justify-between rounded-[1.4rem] p-4">
          <div className="flex items-center justify-between gap-2 text-sm font-semibold text-muted-foreground"><span>Open work</span><ListTodo className="size-5 text-warning" /></div>
          <div><p className="font-mono text-3xl font-semibold tabular-nums">{overview.openCount}</p><p className="text-xs text-muted-foreground">{overview.overdueCount ? `${overview.overdueCount} overdue` : 'Across this semester'}</p></div>
        </div>
        <div className="surface flex min-h-28 flex-col justify-between rounded-[1.4rem] p-4">
          <div className="flex items-center justify-between gap-2 text-sm font-semibold text-muted-foreground"><span>Courses</span><BookOpen className="size-5 text-accent" /></div>
          <div><p className="font-mono text-3xl font-semibold tabular-nums">{overview.courseCount}</p><p className="text-xs text-muted-foreground">In {semester || 'this semester'}</p></div>
        </div>
      </div>
    </div>
  )
}
