import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PenLine, Heart, Trophy, Calendar } from 'lucide-react'

export function JournalPage() {
  return (
    <PageShell>
      <Tabs defaultValue="journal" className="w-full">
        <TabsList className="mb-6 bg-secondary">
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="gratitude">Gratitude</TabsTrigger>
          <TabsTrigger value="wins">Wins</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="journal">
          <WidgetCard title="Quick Journal" description="Today's entry" delay={0}>
            <div className="flex flex-col gap-3">
              <textarea
                className="min-h-[200px] w-full rounded-lg border border-border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Write about your day..."
              />
              <div className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Markdown supported</p>
              </div>
            </div>
          </WidgetCard>
        </TabsContent>

        <TabsContent value="gratitude">
          <WidgetCard title="Gratitude Log" description="3 things you're grateful for" delay={0}>
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Heart className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type="text"
                    className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder={`I'm grateful for...`}
                  />
                </div>
              ))}
            </div>
          </WidgetCard>
        </TabsContent>

        <TabsContent value="wins">
          <WidgetCard title="Wins Tracker" description="Celebrate your progress" delay={0}>
            <div className="flex flex-col items-center gap-3 py-8">
              <Trophy className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Log your wins here</p>
            </div>
          </WidgetCard>
        </TabsContent>

        <TabsContent value="review">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <WidgetCard title="Weekly Review" delay={0}>
              <div className="flex items-center gap-4 py-6">
                <Calendar className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Complete your weekly review</p>
              </div>
            </WidgetCard>
            <WidgetCard title="Monthly Review" delay={0.1}>
              <div className="flex items-center gap-4 py-6">
                <Calendar className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Complete your monthly review</p>
              </div>
            </WidgetCard>
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
