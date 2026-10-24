import { useMemo, useState } from 'react'
import type { NoelleCrmContact } from '../../../electron/noelle-crm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/EmptyState'
import { FilterChips } from '@/components/shared/FilterChips'
import { PLATFORM_LABELS, formatCrmTime, latestContactActivity, noelleContactChannel, noelleContactKey, noelleContactName } from './noelle-crm-model'

const PAGE_SIZE = 25
const PLATFORMS: readonly NoelleCrmContact['platform'][] = ['x', 'linkedin']

export function NoelleCrmContactList({ contacts, selected, onSelect }: {
  contacts: NoelleCrmContact[]
  selected: string | null
  onSelect(contact: NoelleCrmContact): void
}) {
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState<NoelleCrmContact['platform'] | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return contacts
      .filter((contact) => (!platform || contact.platform === platform) &&
        (!query || `${contact.name} ${contact.handle}`.toLowerCase().includes(query)))
      .map((contact) => ({ contact, activity: latestContactActivity(contact) }))
      .sort((a, b) => b.activity.localeCompare(a.activity) || a.contact.name.localeCompare(b.contact.name))
  }, [contacts, search, platform])

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Input
        aria-label="Search DM contacts" placeholder="Search DM contacts..." value={search}
        onChange={(event) => { setSearch(event.target.value); setVisible(PAGE_SIZE) }}
      />
      <FilterChips label="Filter by platform" size="md" value={platform} className="gap-2" chipClassName="min-h-11 sm:min-h-8"
        onChange={(value) => { setPlatform(value); setVisible(PAGE_SIZE) }}
        options={PLATFORMS.map((value) => ({ value, label: `${PLATFORM_LABELS[value]} · ${contacts.filter((contact) => contact.platform === value).length}` }))} />
      {filtered.length === 0 ? (
        <EmptyState message="No DM contacts match." hint="Clear the search or platform filter." />
      ) : (
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto p-1" aria-label="DM contacts">
          {filtered.slice(0, visible).map(({ contact, activity }) => {
            const key = noelleContactKey(contact)
            const inbound = contact.conversations.reduce((count, conversation) => count + conversation.messages.filter((message) => message.direction === 'inbound').length, 0)
            return (
              <Button key={key} variant={selected === key ? 'accent-outline' : 'ghost'}
                aria-pressed={selected === key} onClick={() => onSelect(contact)}
                className="h-auto min-h-14 w-full min-w-0 justify-start px-3 py-3 text-left whitespace-normal">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="break-words text-sm font-medium">{noelleContactName(contact)}</span>
                  <span className="text-xs font-normal text-muted-foreground">{noelleContactChannel(contact)} · {inbound} {inbound === 1 ? 'reply' : 'replies'}</span>
                  <span className="font-mono text-2xs font-normal text-muted-foreground">{formatCrmTime(activity)}</span>
                </span>
              </Button>
            )
          })}
          {filtered.length > visible && <Button variant="secondary" onClick={() => setVisible((count) => count + PAGE_SIZE)} className="min-h-11">Show more contacts</Button>}
        </div>
      )}
    </div>
  )
}
