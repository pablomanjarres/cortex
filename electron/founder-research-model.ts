import type { NoelleCrmContact } from './noelle-crm.js'

export const FOUNDER_RESEARCH_KEY = 'cortex-founder-research'
export const RESEARCH_BRIEF_LIMITS = { title: 300, audience: 3_000, objective: 3_000, invitationGuidance: 3_000, questions: 12, question: 1_000 } as const
export interface ResearchBriefDraft {
  title: string; audience: string; objective: string; questions: string[]; invitationGuidance: string
}
export interface PublishedResearchBrief extends ResearchBriefDraft {
  schemaVersion: 1; campaignId: string; version: number; hash: string; publishedAt: string
}
export interface ResearchEvent {
  id: string; requestId: string | null; draftId: string | null
  supersedesRequestId?: string; supersedesDraftId?: string
  purpose: 'research_invitation' | 'research_followup'
  briefVersion: number; briefHash: string; platform: 'x' | 'linkedin'
  recipient: { name: string; handle: string; profileUrl: string }
  body: string
  status: 'prospect' | 'drafted' | 'pending_review' | 'approved' | 'rejected' | 'queued' | 'sending' | 'sent' | 'blocked' | 'error'
  review: { status: 'pending' | 'approved' | 'rejected' | 'needs_review' | 'unknown'; id?: string | null; reason?: string | null; reviewedAt?: string | null }
  evidence: { id: string; source: string; url?: string; summary?: string }[]
  nativeExternalId?: string | null; sentAt?: string | null; crmContactId?: string | null; conversationId?: string | null
  updatedAt: string
}
export interface ResearchFinding {
  id: string; text: string; sourceIds: string[]; reviewStatus: 'unreviewed' | 'confirmed' | 'rejected'; createdAt: string
}
export interface ResearchDecision {
  id: string; text: string; evidenceIds: string[]; reviewStatus: 'proposed' | 'accepted' | 'rejected'; createdAt: string
}
export interface ResearchGeneration {
  schemaVersion: 1; campaignId: 'small-software'; purpose: ResearchEvent['purpose']; platform: ResearchEvent['platform']
  observedAt: string; status: 'success' | 'error'; windowKey: string
  briefVersion?: number; briefHash?: string; eligible?: number; staged?: number; pending?: number; error?: string; sent: 0
}
export interface ResearchSource {
  id: string; kind: 'context' | 'draft' | 'reply'; label: string; preview: string
  platform?: ResearchEvent['platform']; crmContactId?: string; conversationId?: string; messageId?: string
}
export interface ResearchState {
  schemaVersion: 1
  campaign: { id: string; draft: ResearchBriefDraft; draftUpdatedAt: string; revisions: PublishedResearchBrief[] }
  events: ResearchEvent[]
  notes: Record<string, { text: string; updatedAt: string }>
  findings: ResearchFinding[]; decisions: ResearchDecision[]
  meetings: Record<string, { status: 'booked' | 'completed'; source: 'manual'; updatedAt: string }>
  sync: { syncedAt: string | null; lastAttemptAt: string | null; lastSuccessfulSyncAt: string | null; error?: string; generation?: ResearchGeneration[] }
}
export interface ResearchEventView extends ResearchEvent {
  verifiedSent: boolean; verifiedSentAt: string | null; requiresReview: boolean; verificationReason: string | null; superseded: boolean
}
export interface ResearchView extends Omit<ResearchState, 'events'> { events: ResearchEventView[]; crmContacts: NoelleCrmContact[]; sources: ResearchSource[] }
export type ResearchAction =
  | { type: 'save_draft'; draft: ResearchBriefDraft; expectedUpdatedAt?: string }
  | { type: 'publish'; expectedUpdatedAt?: string }
  | { type: 'save_note'; scope: string; text: string }
  | { type: 'add_finding'; text: string; sourceIds: string[]; reviewStatus: ResearchFinding['reviewStatus'] }
  | { type: 'add_decision'; text: string; evidenceIds: string[]; reviewStatus: ResearchDecision['reviewStatus'] }
  | { type: 'review_finding'; id: string; reviewStatus: ResearchFinding['reviewStatus'] }
  | { type: 'review_decision'; id: string; reviewStatus: ResearchDecision['reviewStatus'] }
  | { type: 'set_meeting'; eventId: string; status: 'booked' | 'completed' }
