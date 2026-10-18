import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { openKnowledgeRecord } from '@/lib/knowledge'
import { cn } from '@/lib/utils'

interface KnowledgeLinkProps {
  /** Cortex record reference from `recordRefs` in @/lib/knowledge; renders nothing when null. */
  cortexRef: string | null
  label?: string
  className?: string
}

/**
 * KnowledgeLink — opens the Eightfold vault note for a Cortex record in Obsidian.
 * Resolution happens on click, so lists of records cost no requests up front.
 */
export function KnowledgeLink({ cortexRef, label = 'Open in Eightfold', className }: KnowledgeLinkProps) {
  const [state, setState] = useState<{ pending: boolean; message: string | null }>({ pending: false, message: null })
  if (!cortexRef) return null
  const open = async () => {
    setState({ pending: true, message: null })
    try {
      const link = await openKnowledgeRecord(cortexRef)
      setState({ pending: false, message: !link.available ? 'The Eightfold vault is not available on this device.' : link.notes.length ? null : 'No note links this record yet. Opened a vault search.' })
    } catch (error) {
      setState({ pending: false, message: error instanceof Error ? error.message : 'The vault is unavailable' })
    }
  }
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Button type="button" variant="ghost" size="xs" onClick={(event) => { event.stopPropagation(); void open() }} disabled={state.pending}>
        <BookOpen aria-hidden="true" /> {label}
      </Button>
      <span role="status" aria-live="polite" className="text-2xs text-muted-foreground">{state.message}</span>
    </span>
  )
}
