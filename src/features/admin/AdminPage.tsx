import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { CalendarDays, ListTodo, Mail, Receipt } from 'lucide-react'

export function AdminPage() {
  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <WidgetCard title="Important Dates" description="Birthdays, deadlines, renewals" delay={0}>
          <div className="flex flex-col items-center gap-3 py-6">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No upcoming dates</p>
          </div>
        </WidgetCard>

        <WidgetCard title="Errands & Tasks" description="One-off to-dos" delay={0.1}>
          <div className="flex flex-col items-center gap-3 py-6">
            <ListTodo className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">All clear!</p>
          </div>
        </WidgetCard>

        <WidgetCard title="Inbox Zero" delay={0.2}>
          <div className="flex flex-col items-center gap-3 py-6">
            <Mail className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-3xl font-bold tabular-nums">—</p>
              <p className="text-xs text-muted-foreground">unread emails</p>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Bills Calendar" description="Upcoming bills" delay={0.3}>
          <div className="flex flex-col items-center gap-3 py-6">
            <Receipt className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No bills tracked yet</p>
          </div>
        </WidgetCard>
      </div>
    </PageShell>
  )
}
