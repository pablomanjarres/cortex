import type { NoelleCrmContact } from '../../../electron/noelle-crm'

export const PLATFORM_LABELS = { x: 'X', linkedin: 'LinkedIn' } as const

const dateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Bogota', year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit',
})

export function formatCrmTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time unavailable'
  return dateTime.format(new Date(value))
}

export function latestContactActivity(contact: NoelleCrmContact): string {
  let latest = contact.lastSentAt
  for (const conversation of contact.conversations) {
    if (conversation.lastObservedAt && conversation.lastObservedAt > latest) latest = conversation.lastObservedAt
    for (const message of conversation.messages) {
      const at = message.sentAt ?? message.observedAt
      if (at > latest) latest = at
    }
  }
  return latest
}
