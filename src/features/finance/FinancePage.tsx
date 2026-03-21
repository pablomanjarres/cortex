import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Progress } from '@/components/ui/progress'
import { DollarSign, CreditCard, PiggyBank, TrendingUp } from 'lucide-react'

export function FinancePage() {
  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <WidgetCard title="Spending This Week" delay={0}>
          <div className="flex items-center gap-4 py-4">
            <DollarSign className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-3xl font-bold tabular-nums">$0</p>
              <p className="text-xs text-muted-foreground">Budget: $—/week</p>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Budget vs Actual" description="March 2026" delay={0.1}>
          <div className="flex flex-col gap-3 py-2">
            {['Food', 'Transport', 'Entertainment', 'Subscriptions'].map((cat) => (
              <div key={cat}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{cat}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">$0 / $—</span>
                </div>
                <Progress value={0} className="h-1" />
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="Savings Goals" delay={0.2}>
          <div className="flex items-center gap-4 py-4">
            <PiggyBank className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Set up your savings goals</p>
          </div>
        </WidgetCard>

        <WidgetCard title="Subscriptions" description="Monthly recurring" delay={0.3}>
          <div className="flex items-center gap-4 py-4">
            <CreditCard className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold tabular-nums">$0</p>
              <p className="text-xs text-muted-foreground">/month</p>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Net Worth" delay={0.4}>
          <div className="flex items-center gap-4 py-4">
            <TrendingUp className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-3xl font-bold tabular-nums">—</p>
              <p className="text-xs text-muted-foreground">Last updated: never</p>
            </div>
          </div>
        </WidgetCard>
      </div>
    </PageShell>
  )
}
