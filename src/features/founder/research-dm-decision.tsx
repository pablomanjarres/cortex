import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import type { ResearchActions } from './research-notes'
import type { ResearchDmDecision, ResearchEventView } from '../../../electron/founder-research-model'

function DecisionStatus({ decision }: { decision: ResearchDmDecision }) {
  const approve = decision.decision === 'approve'
  const { outcome } = decision
  if (outcome?.status === 'applied')
    return <Chip variant="success">{approve ? 'Approved. Noelle sends it in the next DM window.' : 'Skipped. Noelle will not send it.'}</Chip>
  if (outcome?.status === 'failed')
    return <div className="flex flex-col gap-1"><Chip variant="danger">Noelle could not apply this</Chip>{outcome.reason && <p className="text-xs text-muted-foreground">{outcome.reason}</p>}</div>
  return (
    <div className="flex flex-col gap-1">
      <Chip variant="warning">{approve ? 'Approved by you' : 'Skipped by you'} · waiting for Noelle</Chip>
      <p className="text-xs text-muted-foreground">{outcome?.reason ?? 'Noelle picks this up within 15 minutes.'}</p>
    </div>
  )
}

/** Per-recipient send decision. Nothing is sent to anyone until it is approved here or in Noelle. */
export function ResearchDmDecisionControls({ event, decision, busy, act }: ResearchActions & { event: ResearchEventView; decision: ResearchDmDecision | undefined }) {
  const open = event.draftId && event.review.id && event.status === 'pending_review' && event.review.status === 'pending'
  if (!open && !decision) return null
  const applied = decision?.outcome?.status === 'applied'
  const decide = (value: ResearchDmDecision['decision']) => act({ type: 'decide_dm', eventId: event.id, decision: value })
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4" aria-label="Send decision">
      <p className="text-sm font-medium">Send this DM to {event.recipient.name || event.recipient.handle}?</p>
      {decision && <DecisionStatus decision={decision} />}
      {open && !applied && <div className="flex flex-wrap gap-2">
        {event.platform === 'linkedin' && <Button variant={decision?.decision === 'approve' ? 'accent-outline' : 'default'} disabled={busy || decision?.decision === 'approve'} onClick={() => decide('approve')}>Approve send</Button>}
        <Button variant="secondary" disabled={busy || decision?.decision === 'skip'} onClick={() => decide('skip')}>Skip, I know them</Button>
      </div>}
      {open && event.platform === 'x' && <p className="text-xs text-muted-foreground">X DMs are approved in the X DM tracker batch. You can skip them here.</p>}
    </div>
  )
}
