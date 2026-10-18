// Research narrative (notes, findings, decisions) lives in the knowledge vault
// once a campaign has been migrated; Cortex keeps the operational research
// state (brief draft, published revisions/hashes, Noelle events, meetings,
// sync receipts). The campaign manifest note is the authority switch: it is
// written last by the migration, and until it exists (or when the vault is
// absent) the stored state stays authoritative, exactly as before.

import { createHash } from 'node:crypto'
import type { ResearchDecision, ResearchFinding, ResearchState } from '../founder-research-model.js'
import { ResearchConflictError } from '../founder-research.js'
import type { PropertyValue, Properties } from './frontmatter.js'
import { refs } from './refs.js'
import { VaultError, type KnowledgeVaultService } from './vault.js'

export const RESEARCH_TYPES = { campaign: 'research-campaign', note: 'research-note', finding: 'research-finding', decision: 'research-decision' } as const
export const researchFolder = (campaignId: string) => `Research/${campaignId}`
const campaignTitle = (campaignId: string) => campaignId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')

export type ResearchNarrative = Pick<ResearchState, 'notes' | 'findings' | 'decisions'>
interface VaultNarrative extends ResearchNarrative { revisions: Map<string, { path: string; revision: string }>; skipped: string[] }

const ISO = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/
const iso = (value: PropertyValue | undefined): string | null => typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const strings = (value: PropertyValue | undefined, max: number): string[] | null => Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === 'string' && item && item.length <= max) ? value as string[] : null
const slug = (text: string, max: number) => text.replace(/[\\/:*?"<>|#^[\]\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim() || 'Untitled'
const noteId = (campaignId: string, scope: string) => `research-note-${createHash('sha1').update(`${campaignId}\0${scope}`).digest('hex').slice(0, 16)}`

export class ResearchNarrativeStore {
  private readonly vault: KnowledgeVaultService
  /** Revisions observed at the last read, used as the base for the next write. */
  private observed = new Map<string, { path: string; revision: string }>()
  constructor(vault: KnowledgeVaultService) { this.vault = vault }

  /** True when the vault is present and holds this campaign's manifest. */
  authoritative(campaignId: string): boolean {
    if (!this.vault.primary()) return false
    return this.vault.readNotes(researchFolder(campaignId), RESEARCH_TYPES.campaign).some(note => note.properties.campaign === campaignId)
  }

  /** Vault narrative when authoritative, otherwise null (stored state applies). */
  read(campaignId: string): VaultNarrative | null {
    if (!this.authoritative(campaignId)) return null
    const narrative = this.readRecords(campaignId)
    this.observed = narrative.revisions
    return narrative
  }

  private readRecords(campaignId: string): VaultNarrative {
    const folder = researchFolder(campaignId)
    const revisions = new Map<string, { path: string; revision: string }>()
    const skipped: string[] = []
    const notes: ResearchState['notes'] = {}, findings: ResearchFinding[] = [], decisions: ResearchDecision[] = []
    for (const note of this.vault.readNotes(folder)) {
      const p = note.properties, id = note.ref.id
      if (!id || p.campaign !== campaignId) continue
      const keep = () => revisions.set(id, { path: note.ref.path, revision: note.revision })
      if (p.type === RESEARCH_TYPES.note) {
        const scope = p.scope, updatedAt = iso(p.updated)
        if (typeof scope !== 'string' || !(scope === 'campaign' || /^event:.{1,500}$/.test(scope)) || !updatedAt || note.body.length > 100_000 || notes[scope]) { skipped.push(note.ref.path); continue }
        notes[scope] = { text: note.body, updatedAt }; keep()
      } else if (p.type === RESEARCH_TYPES.finding) {
        const sourceIds = strings(p.source_ids, 2_000), createdAt = iso(p.created), status = p.status
        if (!sourceIds?.length || !createdAt || !['unreviewed', 'confirmed', 'rejected'].includes(String(status)) || !note.body.trim() || note.body.length > 10_000) { skipped.push(note.ref.path); continue }
        findings.push({ id, text: note.body, sourceIds, reviewStatus: status as ResearchFinding['reviewStatus'], createdAt }); keep()
      } else if (p.type === RESEARCH_TYPES.decision) {
        const evidenceIds = strings(p.evidence_ids, 500), createdAt = iso(p.created), status = p.status
        if (!evidenceIds?.length || !createdAt || !['proposed', 'accepted', 'rejected'].includes(String(status)) || !note.body.trim() || note.body.length > 10_000) { skipped.push(note.ref.path); continue }
        decisions.push({ id, text: note.body, evidenceIds, reviewStatus: status as ResearchDecision['reviewStatus'], createdAt }); keep()
      }
    }
    const order = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
    return { notes, findings: findings.sort(order), decisions: decisions.sort(order), revisions, skipped }
  }

  /** Write changed or new narrative records. Existing records are updated against the revision last read. */
  write(campaignId: string, next: ResearchNarrative, now: string): void {
    const current = this.readRecords(campaignId)
    const folder = researchFolder(campaignId), cortexRefs = [refs.research(campaignId)]
    const update = (id: string, body: string, properties: Properties) => {
      const base = this.observed.get(id) ?? current.revisions.get(id)!
      try { this.vault.updateNote({ path: current.revisions.get(id)!.path, baseRevision: base.revision, body, properties }) } catch (error) {
        if (error instanceof VaultError && error.status === 409) throw new ResearchConflictError('Research notes changed in the vault. Reload them before saving.')
        throw error
      }
    }
    for (const [scope, note] of Object.entries(next.notes)) {
      const id = noteId(campaignId, scope), prior = current.notes[scope]
      if (!prior) this.vault.createAt(`${folder}/Notes/${scope === 'campaign' ? 'Campaign' : `Event ${slug(scope.slice(6), 60)} ${id.slice(-6)}`}.md`, { id, type: RESEARCH_TYPES.note, campaign: campaignId, scope, area: 'research', cortex_refs: cortexRefs, created: note.updatedAt, updated: note.updatedAt }, note.text)
      else if (prior.text !== note.text) update(id, note.text, { updated: now })
    }
    for (const finding of next.findings) {
      const prior = current.findings.find(item => item.id === finding.id)
      if (!prior) this.vault.createAt(`${folder}/Findings/${slug(finding.text, 50)} ${finding.id.slice(0, 8)}.md`, { id: finding.id, type: RESEARCH_TYPES.finding, campaign: campaignId, status: finding.reviewStatus, source_ids: finding.sourceIds, area: 'research', cortex_refs: cortexRefs, created: finding.createdAt, updated: finding.createdAt }, finding.text)
      else if (prior.reviewStatus !== finding.reviewStatus || prior.text !== finding.text) update(finding.id, finding.text, { status: finding.reviewStatus })
    }
    for (const decision of next.decisions) {
      const prior = current.decisions.find(item => item.id === decision.id)
      if (!prior) this.vault.createAt(`${folder}/Decisions/${slug(decision.text, 50)} ${decision.id.slice(0, 8)}.md`, { id: decision.id, type: RESEARCH_TYPES.decision, campaign: campaignId, status: decision.reviewStatus, evidence_ids: decision.evidenceIds, area: 'research', cortex_refs: cortexRefs, created: decision.createdAt, updated: decision.createdAt }, decision.text)
      else if (prior.reviewStatus !== decision.reviewStatus || prior.text !== decision.text) update(decision.id, decision.text, { status: decision.reviewStatus })
    }
    this.observed = this.readRecords(campaignId).revisions
  }

  /**
   * Copy stored narrative into the vault, then write the manifest that makes
   * the vault authoritative. Idempotent: records already in the vault are left
   * untouched (differences are reported), and a second run creates nothing.
   */
  migrate(state: ResearchState, opts: { dryRun?: boolean; now: string }) {
    const primary = this.vault.primary()
    if (!primary) throw new VaultError(503, 'The knowledge vault is not available.')
    const campaignId = state.campaign.id, folder = researchFolder(campaignId)
    const current = this.readRecords(campaignId)
    const missing: ResearchNarrative = { notes: {}, findings: [], decisions: [] }
    const differing: string[] = []
    for (const [scope, note] of Object.entries(state.notes)) {
      if (!current.notes[scope]) missing.notes[scope] = note
      else if (current.notes[scope].text !== note.text) differing.push(`note:${scope}`)
    }
    for (const finding of state.findings) {
      const prior = current.findings.find(item => item.id === finding.id)
      if (!prior) missing.findings.push(finding)
      else if (prior.text !== finding.text || prior.reviewStatus !== finding.reviewStatus) differing.push(`finding:${finding.id}`)
    }
    for (const decision of state.decisions) {
      const prior = current.decisions.find(item => item.id === decision.id)
      if (!prior) missing.decisions.push(decision)
      else if (prior.text !== decision.text || prior.reviewStatus !== decision.reviewStatus) differing.push(`decision:${decision.id}`)
    }
    const manifestExists = this.authoritative(campaignId)
    const result = {
      dryRun: !!opts.dryRun, vault: primary.name, folder, campaignId,
      toCreate: { notes: Object.keys(missing.notes).length, findings: missing.findings.length, decisions: missing.decisions.length, manifest: !manifestExists },
      alreadyInVault: { notes: Object.keys(current.notes).length, findings: current.findings.length, decisions: current.decisions.length },
      differing, skippedVaultFiles: current.skipped, authority: manifestExists ? 'vault' as const : 'cortex' as const, verified: false,
    }
    if (opts.dryRun) return result
    this.observed = current.revisions
    this.write(campaignId, { notes: { ...current.notes, ...missing.notes }, findings: [...current.findings, ...missing.findings], decisions: [...current.decisions, ...missing.decisions] }, opts.now)
    const after = this.readRecords(campaignId)
    const verified = Object.entries(state.notes).every(([scope, note]) => after.notes[scope] && (after.notes[scope].text === note.text || differing.includes(`note:${scope}`)))
      && state.findings.every(item => after.findings.some(found => found.id === item.id))
      && state.decisions.every(item => after.decisions.some(found => found.id === item.id))
    if (!verified) return { ...result, verified }
    if (!manifestExists) {
      this.vault.createAt(`${folder}/${campaignTitle(campaignId)} research.md`, { id: `research-${campaignId}`, type: RESEARCH_TYPES.campaign, campaign: campaignId, area: 'research', status: 'active', narrative_authority: 'vault', cortex_refs: [refs.research(campaignId)], created: opts.now, updated: opts.now },
        `# ${campaignTitle(campaignId)} research\n\nNotes, findings and decisions for this campaign live in this folder. Published brief revisions, outreach events and sync receipts stay in Cortex.`)
    }
    return { ...result, authority: 'vault' as const, verified }
  }
}

type ResearchStoreDeps = { read(): Promise<ResearchState | null>; write(state: ResearchState): Promise<void> }

/**
 * Wrap the stored research deps so narrative reads/writes go to the vault when
 * it is authoritative. The stored copy of the narrative is left as it was at
 * migration time (kept as source data, never updated, never read back).
 */
export function vaultBackedResearch(store: ResearchStoreDeps, narrative: ResearchNarrativeStore, opts: { now?: () => string; afterWrite?: (merged: ResearchState) => Promise<void> } = {}): ResearchStoreDeps {
  return {
    read: async () => {
      const state = await store.read()
      if (!state) return null
      const vault = narrative.read(state.campaign.id)
      return vault ? { ...state, notes: vault.notes, findings: vault.findings, decisions: vault.decisions } : state
    },
    write: async state => {
      if (narrative.authoritative(state.campaign.id)) {
        narrative.write(state.campaign.id, state, opts.now?.() ?? new Date().toISOString())
        const stored = await store.read()
        await store.write({ ...state, notes: stored?.notes ?? {}, findings: stored?.findings ?? [], decisions: stored?.decisions ?? [] })
      } else await store.write(state)
      await opts.afterWrite?.(state)
    },
  }
}
