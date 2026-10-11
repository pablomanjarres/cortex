import { useState } from 'react'
import { NotesField } from '@/components/shared/NotesField'
import { Button } from '@/components/ui/button'
import type { ResearchAction, ResearchView } from '../../../electron/founder-research-model'

export interface ResearchActions {
  busy: boolean
  act(action: ResearchAction): Promise<ResearchView | null>
}

export function ResearchNotes({ value, scope, busy, act }: ResearchActions & { value: string; scope: string }) {
  const [edited, setEdited] = useState<string | null>(null)
  const dirty = edited !== null && edited !== value
  return (
    <div className="flex flex-col gap-3" aria-label="Research notes">
      <p className="text-xs text-muted-foreground">Markdown notes are saved separately from the exact CRM conversation.</p>
      <NotesField value={edited ?? value} onChange={setEdited} title="Research notes" placeholder="Click to write research notes…" minHeight={120} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!dirty || busy} onMouseDown={event => event.preventDefault()} onClick={async () => {
          const submitted = edited ?? value
          const saved = await act({ type: 'save_note', scope, text: submitted })
          if (saved) setEdited(current => current === submitted ? null : current)
        }}>Save notes</Button>
        {dirty && <Button variant="ghost" disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => setEdited(null)}>Discard note edits</Button>}
      </div>
    </div>
  )
}
