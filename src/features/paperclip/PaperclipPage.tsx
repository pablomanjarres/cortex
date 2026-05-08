import { PageShell } from '@/components/shared/PageShell'
import { PaperclipSection } from './PaperclipSection'

export function PaperclipPage() {
  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Paperclip</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Agents, heartbeats & live runs</p>
        </div>
      </div>
      <PaperclipSection />
    </PageShell>
  )
}
