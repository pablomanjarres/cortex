import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Badge } from '@/components/ui/badge'
import { Clock, BookOpen, GraduationCap, CalendarDays } from 'lucide-react'

export function StudentPage() {
  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <WidgetCard title="Assignments" description="Upcoming deadlines" delay={0} className="lg:col-span-2">
          <div className="flex flex-col gap-2">
            {[
              { course: 'Formal Languages', task: 'Problem Set 4', due: 'Mar 25', status: 'pending' },
              { course: 'Algorithms', task: 'Midterm study', due: 'Mar 28', status: 'in-progress' },
              { course: 'Systems', task: 'Lab 3 report', due: 'Apr 1', status: 'pending' },
            ].map((assignment) => (
              <div key={assignment.task} className="flex items-center gap-4 rounded-lg px-3 py-2.5 hover:bg-secondary transition-colors">
                <div className="flex-1">
                  <p className="text-sm font-medium">{assignment.task}</p>
                  <p className="text-xs text-muted-foreground">{assignment.course}</p>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">{assignment.due}</span>
                <Badge variant="secondary" className="text-[10px] uppercase">
                  {assignment.status}
                </Badge>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="Exam Countdown" delay={0.1}>
          <div className="flex flex-col gap-3 py-2">
            {[
              { course: 'Formal Languages', days: 12 },
              { course: 'Algorithms', days: 18 },
            ].map((exam) => (
              <div key={exam.course} className="flex items-center justify-between">
                <span className="text-sm">{exam.course}</span>
                <Badge variant="secondary" className="tabular-nums">
                  {exam.days}d
                </Badge>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="Study Hours" description="This week" delay={0.2}>
          <div className="flex items-center gap-4 py-4">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-3xl font-bold tabular-nums">0h</p>
              <p className="text-xs text-muted-foreground">Target: 25h/week</p>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="GPA Tracker" delay={0.3}>
          <div className="flex items-center gap-4 py-4">
            <GraduationCap className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-3xl font-bold tabular-nums">—</p>
              <p className="text-xs text-muted-foreground">cumulative GPA</p>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Reading Queue" delay={0.4}>
          <div className="flex items-center gap-4 py-4">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No items in queue</p>
          </div>
        </WidgetCard>
      </div>
    </PageShell>
  )
}
