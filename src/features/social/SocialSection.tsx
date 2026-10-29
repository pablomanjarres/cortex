import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SocialPage } from './SocialPage'
import { CrmPage } from '@/features/crm/CrmPage'

// Social section — personal Contacts with the business CRM as a sub-page tab.
export function SocialSection() {
  return (
    <Tabs defaultValue="contacts">
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
