import { useState } from 'react'
import type { NoelleCrmContact, NoelleCrmSnapshot } from '../../../electron/noelle-crm'
import { useStore } from '@/lib/store'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { NoelleCrmSyncStatus } from './noelle-crm-sync-status'
import { NoelleCrmContactList } from './noelle-crm-contact-list'
import { NoelleCrmTimeline } from './noelle-crm-timeline'
import { noelleContactKey } from './noelle-crm-model'

export function NoelleCrmPanel() {
  const [snapshot] = useStore<NoelleCrmSnapshot | null>('cortex-noelle-crm', null)
  const [selected, setSelected] = useState<string | null>(null)
  const contacts = snapshot?.contacts ?? []
  const contact = contacts.find((item) => noelleContactKey(item) === selected) ?? contacts[0]
  const select = (item: NoelleCrmContact) => setSelected(noelleContactKey(item))
  const selectedKey = contact ? noelleContactKey(contact) : null
  return (
    <WidgetCard id="noelle-dm-crm" title="DM conversations" description="People we have sent DMs to on X and LinkedIn. Sends and replies update automatically.">
      <NoelleCrmSyncStatus snapshot={snapshot} />
      {contacts.length === 0 ? (
        <EmptyState message="No sent DM contacts synced yet." hint="Only confirmed DM recipients are added here." />
      ) : (
        <div className="mt-5 grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <NoelleCrmContactList contacts={contacts} selected={selectedKey} onSelect={select} />
          {contact && <NoelleCrmTimeline key={selectedKey} contact={contact} />}
        </div>
      )}
    </WidgetCard>
  )
}
