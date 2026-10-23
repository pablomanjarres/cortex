import { Select } from '@/components/ui/select'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import type { NoelleCrmContact, NoelleCrmConversation, NoelleCrmMessage } from '../../../electron/noelle-crm'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/shared/EmptyState'
import { PLATFORM_LABELS, formatCrmTime } from './noelle-crm-model'

const PAGE_SIZE = 50

function ConversationStatus({ conversation }: { conversation: NoelleCrmConversation }) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm" variant={conversation.syncStatus === 'error' ? 'warning' : conversation.syncStatus === 'ok' ? 'success' : 'neutral'}>
          {conversation.syncStatus === 'ok' ? 'Conversation synced' : conversation.syncStatus === 'error' ? 'Conversation needs attention' : 'Conversation pending'}
        </Chip>
        {conversation.history?.complete === false && <Chip size="sm" variant="warning">History incomplete</Chip>}
        {conversation.lastObservedAt && <span className="text-muted-foreground">Observed {formatCrmTime(conversation.lastObservedAt)}</span>}
      </div>
      {conversation.syncStatus === 'error' && conversation.syncError && <p className="break-words text-warning">{conversation.syncError}</p>}
      {conversation.history?.complete === false && conversation.history.reason && <p className="break-words text-muted-foreground">{conversation.history.reason}</p>}
    </div>
  )
}

function MessageItem({ message, source }: { message: NoelleCrmMessage; source?: ReactNode }) {
  const inbound = message.direction === 'inbound'
  return (
    <li className={`min-w-0 rounded-md border border-border/60 p-3 ${inbound ? 'bg-secondary/30' : 'bg-accent/5'}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-2xs text-muted-foreground">
        <span className="font-medium">{inbound ? 'Received' : 'Outgoing'}{message.deliveryStatus ? ` · ${message.deliveryStatus.replaceAll('_', ' ')}` : ''}</span>
        <time dateTime={message.sentAt ?? undefined} className="font-mono">{formatCrmTime(message.sentAt)}</time>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{message.body || 'Message has no text.'}</p>
      {!message.sentAt && <p className="mt-2 font-mono text-2xs text-muted-foreground">Observed {formatCrmTime(message.observedAt)}</p>}
      {source && <div className="mt-3 border-t border-border/60 pt-2">{source}</div>}
    </li>
  )
}

export function NoelleCrmTimeline({ contact, renderMessageSource }: {
  contact: NoelleCrmContact
  renderMessageSource?(message: NoelleCrmMessage, conversation: NoelleCrmConversation): ReactNode
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const selectId = useId()
  const conversations = useMemo(() => [...contact.conversations].sort((a, b) => (b.lastObservedAt ?? '').localeCompare(a.lastObservedAt ?? '')), [contact.conversations])
  const conversation = conversations.find((item) => item.id === selected) ?? conversations[0]
  const messages = conversation?.messages ?? []
  return (
    <div className="flex min-w-0 flex-col gap-4 border-t border-border/60 pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="break-words text-base font-semibold">{contact.name || contact.handle}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{PLATFORM_LABELS[contact.platform]}{contact.handle ? ` · ${contact.handle}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {contact.profileUrl && <a href={contact.profileUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-accent">Open profile <ExternalLink className="h-3 w-3" /></a>}
          {conversation?.url && <a href={conversation.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-accent">Open conversation <ExternalLink className="h-3 w-3" /></a>}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span>First DM sent <span className="font-mono">{formatCrmTime(contact.firstSentAt)}</span></span>
        <span>Last DM sent <span className="font-mono">{formatCrmTime(contact.lastSentAt)}</span></span>
      </div>
      {conversations.length > 1 && (
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className="text-xs text-muted-foreground">Conversation</label>
          <Select id={selectId} value={conversation?.id} onChange={(event) => { setSelected(event.target.value); setVisible(PAGE_SIZE) }}
            className="h-11 w-full min-w-0 rounded-md border border-input bg-input/20 px-3 text-xs">
            {conversations.map((item, index) => <option key={item.id} value={item.id}>Thread {index + 1} · {formatCrmTime(item.lastObservedAt)}</option>)}
          </Select>
        </div>
      )}
      {conversation && <ConversationStatus conversation={conversation} />}
      {messages.length === 0 ? <EmptyState message="No conversation messages recorded yet." hint="Confirmed DM sends are tracked while conversation history is collected." /> : (
        <div className="flex min-w-0 flex-col gap-3">
          {messages.length > visible && <Button variant="secondary" onClick={() => setVisible((count) => count + PAGE_SIZE)} className="min-h-11">Show older messages ({messages.length - visible})</Button>}
          <ol className="flex min-w-0 flex-col gap-3" aria-label="Conversation messages">
            {messages.slice(-visible).map((message) => <MessageItem key={message.id} message={message} source={conversation && renderMessageSource?.(message, conversation)} />)}
          </ol>
        </div>
      )}
    </div>
  )
}
