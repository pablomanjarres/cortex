import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StudentWorkspacePage } from './StudentWorkspacePage'
import { MaterialsTab } from './MaterialsTab'
import { NotesTab } from './NotesTab'

// Student section — the existing Overview page plus the study-hub tabs.
// Each tab page renders its own PageShell (same shape as LibraryPage).
export function StudentSection() {
  return (
    <Tabs defaultValue="overview">
      <TabsList className="max-w-full rounded-xl">
        <TabsTrigger value="overview" className="min-h-11 rounded-lg">Overview</TabsTrigger>
        <TabsTrigger value="materials" className="min-h-11 rounded-lg">Materials</TabsTrigger>
        <TabsTrigger value="notes" className="min-h-11 rounded-lg">Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <StudentWorkspacePage />
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
