import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useUrlParam } from '@/lib/use-url-param'
import { SocialPage } from './SocialPage'
import { CrmPage } from '@/features/crm/CrmPage'

const SOCIAL_TABS = ['contacts', 'crm'] as const

// Social section — personal Contacts with the business CRM as a sub-page tab.
// `?tab=` and `?record=` (a Cortex record reference) are URL-addressable.
export function SocialSection() {
  const [tab, setTab] = useUrlParam('tab', 'contacts', SOCIAL_TABS)
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
      <TabsList>
        <TabsTrigger value="contacts">Contacts</TabsTrigger>
        <TabsTrigger value="crm">CRM</TabsTrigger>
      </TabsList>
      <TabsContent value="contacts">
        <SocialPage />
      </TabsContent>
      <TabsContent value="crm">
        <CrmPage />
      </TabsContent>
    </Tabs>
  )
}
