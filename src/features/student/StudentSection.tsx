import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StudentPage } from './StudentPage'
import { MaterialsTab } from './MaterialsTab'
import { NotesTab } from './NotesTab'

// Student section — the existing Overview page plus the study-hub tabs.
// Each tab page renders its own PageShell (same shape as LibraryPage).
export function StudentSection() {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="materials">Materials</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <StudentPage />
      </TabsContent>
      <TabsContent value="materials">
        <MaterialsTab />
      </TabsContent>
      <TabsContent value="notes">
        <NotesTab />
      </TabsContent>
    </Tabs>
  )
}
