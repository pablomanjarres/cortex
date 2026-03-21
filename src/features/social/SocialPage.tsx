import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { UserPlus, Battery, Bell } from 'lucide-react'

export function SocialPage() {
  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <WidgetCard title="Reach Out List" description="People to contact" delay={0}>
          <div className="flex flex-col items-center gap-3 py-6">
            <UserPlus className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Add people to your reach out list</p>
          </div>
        </WidgetCard>

        <WidgetCard title="Social Energy" description="Your social battery" delay={0.1}>
          <div className="flex flex-col items-center gap-4 py-6">
            <Battery className="h-10 w-10 text-muted-foreground" />
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  className="h-8 w-8 rounded-md bg-secondary text-xs text-muted-foreground hover:bg-secondary/80 transition-colors"
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Relationship Maintenance" delay={0.2}>
          <div className="flex flex-col items-center gap-3 py-6">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Set up reminders to check in</p>
          </div>
        </WidgetCard>
      </div>
    </PageShell>
  )
}
