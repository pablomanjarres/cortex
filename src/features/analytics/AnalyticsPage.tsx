import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { BarChart3, Flame, TrendingUp, Calendar } from 'lucide-react'

export function AnalyticsPage() {
  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <WidgetCard title="Trend Charts" description="Track any metric over time" delay={0} className="lg:col-span-2">
          <div className="flex flex-col items-center gap-3 py-12">
            <TrendingUp className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Start tracking to see trends</p>
          </div>
        </WidgetCard>

        <WidgetCard title="Active Streaks" delay={0.1}>
          <div className="flex flex-col items-center gap-3 py-6">
            <Flame className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No active streaks yet</p>
          </div>
        </WidgetCard>

        <WidgetCard title="Heatmap" description="Activity over time" delay={0.2} className="lg:col-span-2">
          <div className="flex flex-col items-center gap-3 py-12">
            <BarChart3 className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Activity heatmap will appear here</p>
          </div>
        </WidgetCard>

        <WidgetCard title="Weekly Summary" delay={0.3}>
          <div className="flex flex-col items-center gap-3 py-6">
            <Calendar className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Complete a week to see your summary</p>
          </div>
        </WidgetCard>
      </div>
    </PageShell>
  )
}
