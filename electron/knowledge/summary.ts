// Curated operational summary for the knowledge vault's overview refresh
// (GET /api/knowledge/summary). Bounded aggregates and record references only:
// no raw store mirrors, no message bodies, no contact details.

import { cortexRecordUrl, refs } from './refs.js'
import { projectPriorityRank } from '../project-priority.js'

export interface SummaryInputs {
  now: Date
  /** Web origin used for Cortex record URLs, e.g. http://localhost:3456. */
  origin: string
  timeZone?: string
  vault: { name: string; homeUri: string | null } | null
  projectMeta: unknown
  goals: unknown
  calendar: { events: unknown; from: string; to: string } | { error: string } | null
  finances: unknown
  crm: unknown
  contacts: unknown
  noelleCrm: unknown
  founderHistory: unknown
  research: unknown
}

const LIMITS = { projects: 50, goals: 20, events: 15 } as const
const obj = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const str = (value: unknown, max = 200): string | null => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
const num = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0
const safe = (make: () => string): string | null => { try { return make() } catch { return null } }

function goalProgress(goal: Record<string, unknown>): number {
  if (goal.status === 'done') return 100
  const milestones = arr(goal.milestones).map(obj).filter(Boolean) as Record<string, unknown>[]
  if (milestones.length) return Math.round((milestones.filter(item => item.done === true).length / milestones.length) * 100)
  return Math.max(0, Math.min(100, Math.round(num(goal.progress))))
}

export function buildKnowledgeSummary(input: SummaryInputs) {
  const url = (ref: string) => cortexRecordUrl(input.origin, ref)
  const now = input.now
  const month = now.getMonth(), year = now.getFullYear()

  const projectStatusRank: Record<string, number> = { active: 0, wip: 1, archived: 2 }
  const projects = Object.entries(obj(input.projectMeta) ?? {}).flatMap(([name, raw]) => {
    const meta = obj(raw), ref = safe(() => refs.project(name))
    if (!meta || !ref) return []
    const status = str(meta.status, 20) ?? 'unknown'
    return [{ ref, name: str(meta.displayName) ?? name, status, priority: projectPriorityRank(meta.priority), tagline: str(meta.tagline, 240), cortexUrl: url(ref) }]
  }).sort((a, b) => (projectStatusRank[a.status] ?? 3) - (projectStatusRank[b.status] ?? 3) || a.priority - b.priority || a.name.localeCompare(b.name))

  const goals = (arr(input.goals).map(obj).filter(Boolean) as Record<string, unknown>[]).filter(goal => typeof goal.id === 'string' && safe(() => refs.goal(String(goal.id))))
  const activeGoals = goals.filter(goal => goal.status === 'active')

  let calendar: Record<string, unknown> = { available: false }
  if (input.calendar && 'events' in input.calendar) {
    const events = (arr(input.calendar.events).map(obj).filter(Boolean) as Record<string, unknown>[])
      .filter(event => typeof event.startDate === 'string')
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))
    calendar = { available: true, from: input.calendar.from, to: input.calendar.to, count: events.length, upcoming: events.slice(0, LIMITS.events).map(event => ({ title: str(event.title, 160) ?? 'Untitled', start: event.startDate, end: event.endDate ?? null, allDay: event.isAllDay === true, calendar: str(event.calendar, 80) })) }
  } else if (input.calendar && 'error' in input.calendar) calendar = { available: false, error: input.calendar.error }

  const financeData = obj(input.finances)
  let finance: Record<string, unknown> = { available: false }
  if (financeData && num(financeData.year) === year) {
    const totals = { income: 0, expenses: 0, subscriptions: 0 }
    for (const item of arr(financeData.items).map(obj)) {
      const amount = num(arr(item?.months)[month])
      if (item?.type === 'Income') totals.income += amount
      else if (item?.type === 'Expense') totals.expenses += amount
      else if (item?.type === 'Subscription') totals.subscriptions += amount
    }
    finance = { available: true, basis: 'planned monthly budget', year, month: month + 1, ...totals, net: totals.income - totals.expenses - totals.subscriptions }
  }

  const crmOrgs = arr(obj(input.crm)?.orgs).map(obj).filter(Boolean) as Record<string, unknown>[]
  const crmContacts = crmOrgs.flatMap(org => arr(org.contacts).map(obj).filter(Boolean) as Record<string, unknown>[])
  const byStatus: Record<string, number> = {}
  for (const contact of crmContacts) { const status = str(contact.status, 20) ?? 'unknown'; byStatus[status] = (byStatus[status] ?? 0) + 1 }
  const noelle = obj(input.noelleCrm)
  const noelleContacts = arr(noelle?.contacts).map(obj).filter(Boolean) as Record<string, unknown>[]
  const conversations = noelleContacts.flatMap(contact => arr(contact.conversations).map(obj).filter(Boolean) as Record<string, unknown>[])
  const messages = conversations.flatMap(conversation => arr(conversation.messages).map(obj).filter(Boolean) as Record<string, unknown>[])

  const history = (arr(input.founderHistory).map(obj).filter(Boolean) as Record<string, unknown>[]).filter(entry => typeof entry.date === 'string').sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const latest = history.at(-1)
  const recent = history.slice(-7)
  const research = obj(input.research)
  const researchEvents = arr(research?.events).map(obj).filter(Boolean) as Record<string, unknown>[]
  const latestBrief = obj(arr(obj(research?.campaign)?.revisions).at(-1))
  const campaignId = str(obj(research?.campaign)?.id, 100)

  return {
    schemaVersion: 1 as const,
    generatedAt: now.toISOString(),
    timeZone: input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    cortex: { url: `${input.origin.replace(/\/$/, '')}/`, home: url(refs.home()) },
    vault: input.vault ? { name: input.vault.name, available: true, homeUri: input.vault.homeUri } : { available: false },
    projects: { total: projects.length, items: projects.slice(0, LIMITS.projects) },
    goals: {
      active: activeGoals.length, done: goals.filter(goal => goal.status === 'done').length,
      items: activeGoals.slice(0, LIMITS.goals).map(goal => { const ref = refs.goal(String(goal.id)); return { ref, title: str(goal.title, 200) ?? 'Untitled', area: str(goal.area, 60), period: str(goal.period, 20), targetDate: str(goal.targetDate, 10), progress: goalProgress(goal), cortexUrl: url(ref) } }),
    },
    calendar,
    finance,
    crm: {
      manual: { orgs: crmOrgs.length, contacts: crmContacts.length, byStatus, activeValue: crmContacts.filter(contact => contact.status === 'active').reduce((sum, contact) => sum + num(contact.value), 0), cortexUrl: `${input.origin.replace(/\/$/, '')}/#/social?tab=crm` },
      noelle: { contacts: noelleContacts.length, conversations: conversations.length, outbound: messages.filter(message => message.direction === 'outbound').length, inbound: messages.filter(message => message.direction === 'inbound').length, syncedAt: str(noelle?.syncedAt, 40) },
      personalContacts: arr(input.contacts).length,
    },
    founder: {
      latest: latest ? { date: latest.date, commits: num(latest.commits), users: num(latest.users), deploys: num(latest.deploys), mrr: num(latest.mrr), prsOpen: num(latest.prsOpen), prsMerged: num(latest.prsMerged) } : null,
      last7Days: { days: recent.length, commits: recent.reduce((sum, entry) => sum + num(entry.commits), 0), deploys: recent.reduce((sum, entry) => sum + num(entry.deploys), 0) },
      research: research && campaignId ? {
        ref: refs.research(campaignId), cortexUrl: url(refs.research(campaignId)),
        latestBrief: latestBrief ? { version: num(latestBrief.version), hash: str(latestBrief.hash, 64), publishedAt: str(latestBrief.publishedAt, 40) } : null,
        events: researchEvents.length, verifiedSent: researchEvents.filter(event => event.verifiedSent === true).length,
        findings: arr(research.findings).length, decisions: arr(research.decisions).length,
        lastSuccessfulSyncAt: str(obj(research.sync)?.lastSuccessfulSyncAt, 40),
      } : null,
    },
  }
}

export type KnowledgeSummary = ReturnType<typeof buildKnowledgeSummary>
