import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { HabitsPage } from './HabitsPage'
import { StatsPage } from '@/features/stats/StatsPage'

// Habits section — the Habits tracker with Stats folded in as a sub-page tab.
export function HabitsSection() {
  return (
    <Tabs defaultValue="habits">
      <TabsList>
        <TabsTrigger value="habits">Habits</TabsTrigger>
        <TabsTrigger value="stats">Stats</TabsTrigger>
      </TabsList>
      <TabsContent value="habits">
        <HabitsPage />
      </TabsContent>
      <TabsContent value="stats">
        <StatsPage />
      </TabsContent>
    </Tabs>
  )
}
