import { useState } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { NoelleCrmContactList } from '@/features/crm/noelle-crm-contact-list'
import { NoelleCrmTimeline } from '@/features/crm/noelle-crm-timeline'
import { PLATFORM_LABELS, formatCrmTime } from '@/features/crm/noelle-crm-model'
import { ResearchNotes, type ResearchActions } from './research-notes'
import { ReviewStatusChip } from './research-review'
import type { ResearchEventView, ResearchView } from '../../../electron/founder-research-model'

function ResearchProvenance({ event }: { event: ResearchEventView }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 border-t border-border pt-3 text-xs">
      <div className="flex flex-wrap gap-2"><Chip>{event.purpose === 'research_invitation' ? 'Research invitation' : 'Research follow-up'}</Chip><Chip>Brief v{event.briefVersion}</Chip><ReviewStatusChip status={event.review.status}>Review: {event.review.status.replaceAll('_', ' ')}</ReviewStatusChip></div>
      {event.requiresReview && <p className="text-warning">Needs re-review against the current published brief.</p>}
      {event.verificationReason && <p className="text-warning">{event.verificationReason}</p>}
      {event.review.reason && <p className="text-muted-foreground">{event.review.reason}</p>}
      <dl className="grid gap-1 text-muted-foreground">
        {[['Request', event.requestId], ['Replaces request', event.supersedesRequestId], ['Draft', event.draftId], ['Replaces draft', event.supersedesDraftId], ['Review', event.review.id], ['Native send', event.nativeExternalId], ['Conversation', event.conversationId]].filter(([, value]) => value).map(([label, value]) => <div key={label} className="flex min-w-0 flex-wrap gap-x-2"><dt>{label}</dt><dd className="break-all font-mono">{value}</dd></div>)}
        <div><dt className="inline">Brief hash </dt><dd className="inline break-all font-mono">{event.briefHash}</dd></div>
      </dl>
      {event.evidence.length > 0 && <ul className="flex flex-col gap-2" aria-label="Invitation evidence">{event.evidence.map(source => <li key={source.id} className="flex flex-col gap-1">
        <span className="font-medium">{source.source.replaceAll('_', ' ')}</span>
        {source.summary && <p className="text-muted-foreground">{source.summary}</p>}
        <span className="break-all font-mono text-2xs text-muted-foreground">{source.id}</span>
        {source.url && <a className="text-accent" href={source.url} target="_blank" rel="noreferrer">Open source</a>}
      </li>)}</ul>}
    </div>
  )
}

export function ResearchOutreach({ view, busy, act, onUseSource }: ResearchActions & { view: ResearchView; onUseSource(id: string): void }) {
  const [selectedStage, setSelectedStage] = useState<string | null>(null)
  const [selectedContact, setSelectedContact] = useState<string | null>(null)
  const [visible, setVisible] = useState(25)
  const staged = view.events.filter(event => !event.verifiedSent && !event.superseded)
  const stage = staged.find(event => event.id === selectedStage) ?? staged[0]
  const contact = view.crmContacts.find(item => `${item.platform}:${item.id}` === selectedContact) ?? view.crmContacts[0]
  const participantEvents = contact ? view.events.filter(event => event.verifiedSent && event.platform === contact.platform && event.crmContactId === contact.id) : []
  const participant = participantEvents[0]
  return (
    <div className="flex flex-col gap-5">
      <WidgetCard title="Prospect staging" description="Requests and draft previews stay here until an exact native send is verified in the CRM. Delivery is handled in Noelle.">
        {staged.length === 0 ? <EmptyState message="No research prospects staged yet." hint="Noelle research requests appear here with their published brief and source evidence." /> : <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.7fr)]">
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto p-1" aria-label="Research prospects">
            {staged.slice(0, visible).map(event => <Button key={event.id} variant={stage?.id === event.id ? 'accent-outline' : 'ghost'} aria-pressed={stage?.id === event.id} className="h-auto min-h-16 justify-start px-3 py-3 text-left whitespace-normal" onClick={() => setSelectedStage(event.id)}>
              <span className="flex min-w-0 flex-col gap-1"><span className="break-words">{event.recipient.name || event.recipient.handle || 'Research prospect'}</span><span className="text-xs font-normal text-muted-foreground">{PLATFORM_LABELS[event.platform]} · {event.status.replaceAll('_', ' ')}{event.requiresReview ? ' · needs re-review' : ''}</span></span>
            </Button>)}
            {staged.length > visible && <Button variant="secondary" onClick={() => setVisible(visible + 25)}>Show more prospects</Button>}
          </div>
          {stage && <div className="flex min-w-0 flex-col gap-4 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
            <div className="flex flex-wrap items-center gap-3"><h4 className="text-base font-semibold">{stage.recipient.name || stage.recipient.handle}</h4><Chip>{stage.status.replaceAll('_', ' ')}</Chip>{stage.recipient.profileUrl && <a className="text-xs text-accent" href={stage.recipient.profileUrl} target="_blank" rel="noreferrer">Open profile</a>}</div>
            <div className="rounded-md border border-border bg-secondary/40 p-4"><p className="mb-2 text-xs font-medium text-muted-foreground">Draft preview · send not verified</p><p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{stage.body || 'A draft has not been created for this request.'}</p></div>
            <ResearchProvenance event={stage} />
            <ResearchNotes key={stage.id} value={view.notes[`event:${stage.id}`]?.text ?? ''} scope={`event:${stage.id}`} busy={busy} act={act} />
          </div>}
        </div>}
      </WidgetCard>
      <WidgetCard title="Verified participants" description="Only campaign invitations matched to confirmed CRM sends appear here. Original conversations come from the shared CRM.">
        {view.crmContacts.length === 0 ? <EmptyState message="No verified research invitations sent yet." hint="Existing DM contacts join this campaign only when a research invitation has exact send proof." /> : <div className="grid gap-5 lg:grid-cols-[minmax(230px,0.8fr)_minmax(0,1.7fr)]">
          <NoelleCrmContactList contacts={view.crmContacts} selected={contact ? `${contact.platform}:${contact.id}` : null} onSelect={item => setSelectedContact(`${item.platform}:${item.id}`)} />
          {contact && <div className="flex min-w-0 flex-col gap-5">
            <NoelleCrmTimeline key={`${contact.platform}:${contact.id}`} contact={contact} renderMessageSource={(message, conversation) => {
              const source = view.sources.find(item => item.kind === 'reply' && item.platform === contact.platform && item.crmContactId === contact.id && item.conversationId === conversation.id && item.messageId === message.id)
              return source && <div className="flex flex-col gap-1"><span className="break-all font-mono text-2xs text-muted-foreground">{source.id}</span><Button className="self-start" variant="link" size="sm" onClick={() => onUseSource(source.id)}>Use reply as finding source</Button></div>
            }} />
            {participant && <div className="flex min-w-0 flex-col gap-4 lg:pl-5">
              <div className="flex flex-wrap items-center gap-2"><Chip variant="success">Verified send</Chip><span className="font-mono text-xs text-muted-foreground">{formatCrmTime(participant.verifiedSentAt)}</span>{view.meetings[participant.id] && <Chip>{view.meetings[participant.id].status} · marked manually</Chip>}</div>
              <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => act({ type: 'set_meeting', eventId: participant.id, status: 'booked' })}>Mark interview booked</Button><Button variant="secondary" disabled={busy} onClick={() => act({ type: 'set_meeting', eventId: participant.id, status: 'completed' })}>Mark interview completed</Button></div>
              <p className="text-xs text-muted-foreground">Interview status records your confirmation. A DM or reply does not set it automatically.</p>
              <ResearchProvenance event={participant} />
              <ResearchNotes key={participant.id} value={view.notes[`event:${participant.id}`]?.text ?? ''} scope={`event:${participant.id}`} busy={busy} act={act} />
            </div>}
          </div>}
        </div>}
      </WidgetCard>
    </div>
  )
}
