import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { TrendingUp, Lightbulb, Users, Calendar } from 'lucide-react'

export function FounderPage() {
  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <WidgetCard title="KPI Dashboard" description="Key metrics at a glance" delay={0}>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'MRR', value: '$0', change: '+0%' },
              { label: 'Users', value: '0', change: '+0%' },
              { label: 'Churn', value: '0%', change: '0%' },
              { label: 'NPS', value: '—', change: '—' },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{kpi.value}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{kpi.change}</p>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="Sprint Board" description="Current sprint tasks" delay={0.1}>
          <div className="flex flex-col gap-2">
            {['To Do', 'In Progress', 'Done'].map((col) => (
              <div key={col}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col}</p>
                <div className="rounded-lg border border-border/50 bg-secondary/30 p-3 text-center text-xs text-muted-foreground">
                  Add tasks to your sprint
                </div>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="Idea Capture" description="Quick capture" delay={0.2}>
          <div className="flex flex-col items-center gap-3 py-6">
            <Lightbulb className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Capture your next big idea</p>
          </div>
        </WidgetCard>

        <WidgetCard title="Meetings Today" delay={0.3}>
          <div className="flex items-center gap-4 py-4">
            <Calendar className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold tabular-nums">0</p>
              <p className="text-xs text-muted-foreground">meetings scheduled</p>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Networking" description="People & follow-ups" delay={0.4}>
          <div className="flex items-center gap-4 py-4">
            <Users className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">No contacts yet</p>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Revenue" delay={0.5}>
          <div className="flex items-center gap-4 py-4">
            <TrendingUp className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold tabular-nums">$0</p>
              <p className="text-xs text-muted-foreground">monthly recurring</p>
            </div>
          </div>
        </WidgetCard>
      </div>
    </PageShell>
  )
}
