export const NOELLE_CRM_KEY = 'cortex-noelle-crm'

export interface NoelleCrmMessage {
  id: string
  externalId?: string
  direction: 'inbound' | 'outbound'
  body: string
  sentAt: string | null
  observedAt: string
  deliveryStatus?: string
}

export interface NoelleCrmConversation {
  id: string
  url: string
  lastObservedAt: string | null
  syncStatus: 'pending' | 'ok' | 'error'
  syncError?: string
  history?: { complete: boolean; cursor?: string | null; reason?: string | null }
  messages: NoelleCrmMessage[]
}

export interface NoelleCrmContact {
  id: string
  name: string
  platform: 'x' | 'linkedin'
  handle: string
  profileUrl: string
  firstSentAt: string
  lastSentAt: string
  conversations: NoelleCrmConversation[]
}

export interface NoelleCrmSnapshot {
  schemaVersion: 1
  source: 'noelle'
  syncedAt: string
  contacts: NoelleCrmContact[]
  status: {
    lastSuccessfulSyncAt?: string | null
    lastAttemptAt: string
    error?: string
  }
  pagination?: { hasMore: boolean; nextCursor: string | null }
}

export interface NoelleCrmStoredSnapshot extends NoelleCrmSnapshot {
  /** Last complete export applied to eligibility, retained across newer partial pages. */
  lastCompleteSyncAt?: string
}

export class NoelleCrmValidationError extends Error {}

function invalid(field: string): never {
  throw new NoelleCrmValidationError(`Invalid Noelle CRM ${field}`)
}

function record(raw: unknown, field: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid(field)
  return raw as Record<string, unknown>
}

function text(raw: unknown, field: string, max = 500, required = false): string {
  if (typeof raw !== 'string' || raw.length > max || (required && !raw.trim())) invalid(field)
  return raw
}

function timestamp(raw: unknown, field: string, nullable = false): string | null {
  if (nullable && raw === null) return null
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw))) invalid(field)
  return new Date(raw).toISOString()
}

function collection(raw: unknown, field: string, maximum: number): unknown[] {
  if (!Array.isArray(raw) || raw.length > maximum) invalid(field)
  return raw
}

function platformUrl(raw: unknown, platform: NoelleCrmContact['platform'], field: string): string {
  const value = text(raw, field, 2_000)
  if (!value) return ''
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const allowed = platform === 'x' ? ['x.com', 'twitter.com'] : ['linkedin.com']
    if (url.protocol !== 'https:' || url.username || url.password || !allowed.includes(host)) invalid(field)
    return url.href
  } catch { return invalid(field) }
}

function parseSnapshot(raw: unknown, stored: boolean): NoelleCrmSnapshot {
  const input = record(raw, 'snapshot')
  const messagesPerConversation = stored ? 100_000 : 10_000
  const maximumTotalMessages = stored ? 1_000_000 : 100_000
  if (input.schemaVersion !== 1 || input.source !== 'noelle') invalid('schemaVersion/source')
  const syncedAt = timestamp(input.syncedAt, 'syncedAt')!
  const status = record(input.status, 'status')
  let pagination: NoelleCrmSnapshot['pagination']
  if (input.pagination !== undefined) {
    const page = record(input.pagination, 'pagination')
    if (typeof page.hasMore !== 'boolean') invalid('pagination hasMore')
    pagination = {
      hasMore: page.hasMore,
      nextCursor: page.nextCursor === null ? null : text(page.nextCursor, 'pagination nextCursor', 200, true),
    }
    if (!pagination.hasMore && pagination.nextCursor !== null) invalid('pagination nextCursor')
  }
  let totalMessages = 0
  const contacts = collection(input.contacts, 'contacts', 5_000).map((rawContact) => {
    const contact = record(rawContact, 'contact')
    if (contact.platform !== 'x' && contact.platform !== 'linkedin') invalid('platform')
    const platform = contact.platform
    const firstSentAt = timestamp(contact.firstSentAt, 'firstSentAt')!
    const lastSentAt = timestamp(contact.lastSentAt, 'lastSentAt')!
    if (lastSentAt < firstSentAt) invalid('lastSentAt')
    const conversations = collection(contact.conversations, 'conversations', 500).map((rawConversation) => {
      const conversation = record(rawConversation, 'conversation')
      if (!['pending', 'ok', 'error'].includes(conversation.syncStatus as string)) invalid('syncStatus')
      let history: NoelleCrmConversation['history']
      if (conversation.history !== undefined) {
        const value = record(conversation.history, 'history')
        if (typeof value.complete !== 'boolean') invalid('history complete')
        history = {
          complete: value.complete,
          ...(value.cursor !== undefined ? { cursor: value.cursor === null ? null : text(value.cursor, 'history cursor', 2_000) } : {}),
          ...(value.reason !== undefined ? { reason: value.reason === null ? null : text(value.reason, 'history reason', 2_000) } : {}),
        }
      }
      const messages = collection(conversation.messages, stored ? `stored messages per conversation limit (${messagesPerConversation})` : 'messages', messagesPerConversation).map((rawMessage) => {
        if (++totalMessages > maximumTotalMessages) invalid(stored ? `stored total messages limit (${maximumTotalMessages})` : 'total messages')
        const message = record(rawMessage, 'message')
        if (message.direction !== 'inbound' && message.direction !== 'outbound') invalid('direction')
        return {
          id: text(message.id, 'message id', 200, true),
          ...(message.externalId !== undefined ? { externalId: text(message.externalId, 'externalId', 500) } : {}),
          direction: message.direction,
          body: text(message.body, 'body', 100_000),
          sentAt: timestamp(message.sentAt, 'sentAt', true),
          observedAt: timestamp(message.observedAt, 'observedAt')!,
          ...(message.deliveryStatus !== undefined ? { deliveryStatus: text(message.deliveryStatus, 'deliveryStatus', 100) } : {}),
        } as NoelleCrmMessage
      })
      return {
        id: text(conversation.id, 'conversation id', 200, true),
        url: conversation.url === null ? '' : platformUrl(conversation.url, platform, 'conversation url'),
        lastObservedAt: timestamp(conversation.lastObservedAt, 'lastObservedAt', true),
        syncStatus: conversation.syncStatus,
        ...(conversation.syncError !== undefined ? { syncError: text(conversation.syncError, 'syncError', 2_000) } : {}),
        ...(history ? { history } : {}),
        messages,
      } as NoelleCrmConversation
    })
    return {
      id: text(contact.id, 'contact id', 200, true),
      name: text(contact.name, 'name'),
      platform,
      handle: text(contact.handle, 'handle'),
      profileUrl: platformUrl(contact.profileUrl, platform, 'profileUrl'),
      firstSentAt,
      lastSentAt,
      conversations,
    } as NoelleCrmContact
  })
  return {
    schemaVersion: 1, source: 'noelle', syncedAt, contacts,
    ...(pagination ? { pagination } : {}),
    status: {
      lastAttemptAt: timestamp(status.lastAttemptAt, 'lastAttemptAt')!,
      ...(status.lastSuccessfulSyncAt !== undefined ? { lastSuccessfulSyncAt: timestamp(status.lastSuccessfulSyncAt, 'lastSuccessfulSyncAt', true) } : {}),
      ...(status.error !== undefined ? { error: text(status.error, 'status error', 2_000) } : {}),
    },
  }
}

/** The import boundary requires verified send dates and preserves source text verbatim. */
export function parseNoelleCrmSnapshot(raw: unknown): NoelleCrmSnapshot {
  return parseSnapshot(raw, false)
}

/** Saved history may accumulate across bounded import pages without losing exact messages. */
export function parseStoredNoelleCrmSnapshot(raw: unknown): NoelleCrmStoredSnapshot {
  const snapshot = parseSnapshot(raw, true)
  const input = record(raw, 'snapshot')
  if (input.lastCompleteSyncAt === undefined) return snapshot
  const lastCompleteSyncAt = timestamp(input.lastCompleteSyncAt, 'lastCompleteSyncAt')!
  if (lastCompleteSyncAt > snapshot.syncedAt) invalid('lastCompleteSyncAt')
  return { ...snapshot, lastCompleteSyncAt }
}

function mergeMessages(current: NoelleCrmMessage[], incoming: NoelleCrmMessage[]): NoelleCrmMessage[] {
  const messages = new Map(current.map((message) => [message.id, message]))
  const externalIds = new Map(current.filter((message) => message.externalId).map((message) => [message.externalId!, message.id]))
  for (const message of incoming) {
    const id = messages.has(message.id) ? message.id : externalIds.get(message.externalId ?? '') ?? message.id
    const previous = messages.get(id)
    if (!previous || message.observedAt >= previous.observedAt) {
      messages.set(id, { ...previous, ...message, id, sentAt: message.sentAt ?? previous?.sentAt ?? null })
    }
    if (message.externalId) externalIds.set(message.externalId, id)
  }
  return [...messages.values()].sort((a, b) => (a.sentAt ?? a.observedAt).localeCompare(b.sentAt ?? b.observedAt) || a.id.localeCompare(b.id))
}

function isCompleteSnapshot(snapshot: NoelleCrmSnapshot): boolean {
  return snapshot.pagination?.hasMore === false && snapshot.pagination.nextCursor === null &&
    !!snapshot.status.lastSuccessfulSyncAt && !snapshot.status.error
}

/** Complete exports own contact eligibility; partial observations preserve saved history. */
export function mergeNoelleCrmSnapshot(current: NoelleCrmStoredSnapshot | null, incoming: NoelleCrmSnapshot): NoelleCrmStoredSnapshot {
  const lastCompleteSyncAt = current?.lastCompleteSyncAt ?? (current && isCompleteSnapshot(current) ? current.syncedAt : null)
  const completedPage = incoming.pagination?.hasMore === true && incoming.syncedAt === lastCompleteSyncAt
  const fresh = !current || incoming.syncedAt >= current.syncedAt && !completedPage
  const completesCurrentPages = current?.pagination?.hasMore === true && incoming.syncedAt === current.syncedAt
  const authoritative = isCompleteSnapshot(incoming) && (!lastCompleteSyncAt || incoming.syncedAt > lastCompleteSyncAt) &&
    (!current || incoming.syncedAt > current.syncedAt || completesCurrentPages)
  const eligible = new Set(incoming.contacts.map((contact) => `${contact.platform}:${contact.id}`))
  const retained = (current?.contacts ?? []).filter((contact) => !authoritative || eligible.has(`${contact.platform}:${contact.id}`))
  const contacts = new Map(retained.map((contact) => [`${contact.platform}:${contact.id}`, contact]))
  for (const contact of incoming.contacts) {
    const key = `${contact.platform}:${contact.id}`
    const previous = contacts.get(key)
    if (!previous && lastCompleteSyncAt && incoming.syncedAt <= lastCompleteSyncAt) continue
    const conversations = new Map((previous?.conversations ?? []).map((conversation) => [conversation.id, conversation]))
    for (const conversation of contact.conversations) {
      const prior = conversations.get(conversation.id)
      conversations.set(conversation.id, {
        ...(prior && !fresh ? prior : conversation),
        ...((fresh ? conversation.history ?? prior?.history : prior?.history ?? conversation.history)
          ? { history: fresh ? conversation.history ?? prior?.history : prior?.history ?? conversation.history } : {}),
        lastObservedAt: [prior?.lastObservedAt, conversation.lastObservedAt].filter((value): value is string => !!value).sort().at(-1) ?? null,
        messages: mergeMessages(prior?.messages ?? [], conversation.messages),
      })
    }
    contacts.set(key, {
      ...(previous && !fresh ? previous : contact),
      firstSentAt: previous && previous.firstSentAt < contact.firstSentAt ? previous.firstSentAt : contact.firstSentAt,
      lastSentAt: previous && previous.lastSentAt > contact.lastSentAt ? previous.lastSentAt : contact.lastSentAt,
      conversations: [...conversations.values()],
    })
  }
  const latestStatus = current && !fresh ? current.status : incoming.status
  const lastSuccessfulSyncAt = [current?.status.lastSuccessfulSyncAt, incoming.status.lastSuccessfulSyncAt]
    .filter((value): value is string => !!value).sort().at(-1) ?? null
  const nextCompleteSyncAt = authoritative ? incoming.syncedAt : lastCompleteSyncAt
  return {
    schemaVersion: 1, source: 'noelle', syncedAt: current && !fresh ? current.syncedAt : incoming.syncedAt,
    contacts: [...contacts.values()],
    ...(nextCompleteSyncAt ? { lastCompleteSyncAt: nextCompleteSyncAt } : {}),
    status: { ...latestStatus, lastSuccessfulSyncAt },
    ...((fresh ? incoming.pagination : current?.pagination)
      ? { pagination: fresh ? incoming.pagination : current?.pagination } : {}),
  }
}

export function isLoopbackAddress(address: string): boolean {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
}

export class NoelleCrmService {
  private queue: Promise<unknown> = Promise.resolve()
  private deps: { read(): Promise<NoelleCrmStoredSnapshot | null>; write(snapshot: NoelleCrmStoredSnapshot): Promise<void> }
  constructor(deps: { read(): Promise<NoelleCrmStoredSnapshot | null>; write(snapshot: NoelleCrmStoredSnapshot): Promise<void> }) { this.deps = deps }

  async import(raw: unknown): Promise<{ ok: true; contacts: number; conversations: number; messages: number; syncedAt: string }> {
    const incoming = parseNoelleCrmSnapshot(raw)
    const run = async () => {
      const current = await this.deps.read()
      const next = parseStoredNoelleCrmSnapshot(mergeNoelleCrmSnapshot(current, incoming))
      if (JSON.stringify(next) !== JSON.stringify(current)) await this.deps.write(next)
      let conversations = 0
      let messages = 0
      for (const contact of next.contacts) {
        conversations += contact.conversations.length
        for (const conversation of contact.conversations) messages += conversation.messages.length
      }
      return { ok: true as const, contacts: next.contacts.length, conversations, messages, syncedAt: next.syncedAt }
    }
    const next = this.queue.then(run, run)
    this.queue = next.then(() => undefined, () => undefined)
    return next
  }
}
