import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { KnowledgeLink } from '@/components/shared/KnowledgeLink'
import { recordRefs } from '@/lib/knowledge'
import { useUrlParam } from '@/lib/use-url-param'
import { FounderPage } from './FounderPage'
import { ResearchPage } from './ResearchPage'

const FOUNDER_TABS = ['metrics', 'research'] as const

export function FounderSection() {
  const [tab, setTab] = useUrlParam('tab', 'metrics', FOUNDER_TABS)
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList aria-label="Founder sections">
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
        </TabsList>
        <KnowledgeLink cortexRef={recordRefs.home()} label="Eightfold Home" />
      </div>
      <TabsContent value="metrics"><FounderPage /></TabsContent>
      <TabsContent value="research"><ResearchPage /></TabsContent>
    </Tabs>
  )
}
