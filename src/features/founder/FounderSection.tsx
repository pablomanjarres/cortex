import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FounderPage } from './FounderPage'
import { ResearchPage } from './ResearchPage'

export function FounderSection() {
  return (
    <Tabs defaultValue="metrics">
      <TabsList aria-label="Founder sections">
        <TabsTrigger value="metrics">Metrics</TabsTrigger>
        <TabsTrigger value="research">Research</TabsTrigger>
      </TabsList>
      <TabsContent value="metrics"><FounderPage /></TabsContent>
      <TabsContent value="research"><ResearchPage /></TabsContent>
    </Tabs>
  )
}
