import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FounderResearchService, ResearchConflictError, researchArchiveFiles, parseResearchState, type ResearchState } from '../electron/founder-research.ts'
import { KnowledgeVaultService } from '../electron/knowledge/vault.ts'
import { ResearchNarrativeStore, researchFolder, vaultBackedResearch } from '../electron/knowledge/research-narrative.ts'
import { parseNote, bodyOf } from '../electron/knowledge/frontmatter.ts'

const start = '2026-10-18T12:00:00.000Z'

function harness(opts: { vault?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-research-vault-'))
  const root = path.join(dir, 'Eightfold')
  if (opts.vault !== false) fs.mkdirSync(root)
  let clock = start
  let stored: ResearchState | null = null
  const archives: ResearchState[] = []
  const vault = new KnowledgeVaultService({ configuredRoot: root, registryPaths: [], legacyMarsRoot: path.join(dir, 'no-mars'), now: () => new Date(clock) })
  const narrative = new ResearchNarrativeStore(vault)
  const store = { read: async () => structuredClone(stored), write: async (next: ResearchState) => { stored = structuredClone(next) } }
  const deps = vaultBackedResearch(store, narrative, { now: () => clock, afterWrite: async merged => { archives.push(structuredClone(merged)) } })
  const service = new FounderResearchService({ ...deps, readCrm: async () => null, now: () => clock })
  return {
    dir, root, vault, narrative, service, archives,
    stored: () => stored!,
    tick: () => { clock = new Date(Date.parse(clock) + 1_000).toISOString(); return clock },
    files: (sub: string) => { const full = path.join(root, researchFolder('small-software'), sub); return fs.existsSync(full) ? fs.readdirSync(full).sort() : [] },
  }
}

async function seedStoreNarrative(h: ReturnType<typeof harness>) {
  await h.service.action({ type: 'publish' })
  h.tick()
  await h.service.action({ type: 'save_note', scope: 'campaign', text: 'Campaign note\nwith two lines\n' })
  const state = h.stored()
  // Findings need a known source; inject one event the way a Noelle import would.
  const brief = state.campaign.revisions[0]
  await h.service.import({ schemaVersion: 1, source: 'noelle', campaignId: 'small-software', syncedAt: start, status: { lastAttemptAt: start, lastSuccessfulSyncAt: start }, events: [{ id: 'draft-1', requestId: 'request-1', draftId: 'draft-1', purpose: 'research_invitation', briefVersion: brief.version, briefHash: brief.hash, platform: 'x', recipient: { name: 'Fixture', handle: 'fixture', profileUrl: 'https://x.com/fixture' }, body: 'Hello', status: 'approved', review: { status: 'approved' }, evidence: [{ id: 'source-1', source: 'public_post' }], updatedAt: start }] })
  h.tick()
  await h.service.action({ type: 'save_note', scope: 'event:draft-1', text: 'Event note' })
  const withFinding = await h.service.action({ type: 'add_finding', text: 'Teams struggle with auth', sourceIds: ['source-1'], reviewStatus: 'unreviewed' })
  await h.service.action({ type: 'add_decision', text: 'Interview five more teams', evidenceIds: [withFinding.findings[0].id], reviewStatus: 'proposed' })
}

test('without a migrated vault the stored state stays authoritative and nothing is written to the vault', async () => {
  const h = harness()
  await seedStoreNarrative(h)
  assert.equal(h.stored().notes.campaign.text, 'Campaign note\nwith two lines\n')
  assert.equal(h.stored().findings.length, 1)
  assert.equal(fs.readdirSync(h.root).length, 0)
  assert.equal(h.narrative.authoritative('small-software'), false)
})

test('migration is a verified, idempotent copy that switches authority only after every record lands', async () => {
  const h = harness()
  await seedStoreNarrative(h)
  const before = structuredClone(h.stored())
  const dry = h.narrative.migrate(before, { dryRun: true, now: h.tick() })
  assert.deepEqual(dry.toCreate, { notes: 2, findings: 1, decisions: 1, manifest: true })
  assert.equal(dry.authority, 'cortex')
  assert.equal(fs.readdirSync(h.root).length, 0)

  const result = h.narrative.migrate(before, { now: h.tick() })
  assert.equal(result.verified, true)
  assert.equal(result.authority, 'vault')
  assert.deepEqual(h.files(''), ['Decisions', 'Findings', 'Notes', 'Small Software research.md'])
  assert.equal(h.files('Notes').length, 2)
  const campaign = parseNote(fs.readFileSync(path.join(h.root, researchFolder('small-software'), 'Notes', 'Campaign.md'), 'utf8'))
  assert.equal(bodyOf(campaign), 'Campaign note\nwith two lines\n')
  assert.deepEqual(campaign.properties.cortex_refs, ['research:small-software'])
  assert.equal(campaign.properties.type, 'research-note')
  assert.deepEqual(h.stored(), before, 'stored source data is kept unchanged')

  const again = h.narrative.migrate(before, { now: h.tick() })
  assert.deepEqual(again.toCreate, { notes: 0, findings: 0, decisions: 0, manifest: false })
  assert.equal(again.verified, true)
  const view = await h.service.read()
  assert.deepEqual(view.notes, before.notes)
  assert.deepEqual(view.findings, before.findings)
  assert.deepEqual(view.decisions, before.decisions)
})

test('after migration narrative reads and writes go to the vault while brief revisions and hashes stay in Cortex', async () => {
  const h = harness()
  await seedStoreNarrative(h)
  const frozen = structuredClone(h.stored())
  h.narrative.migrate(frozen, { now: h.tick() })

  h.tick()
  await h.service.action({ type: 'save_note', scope: 'campaign', text: 'Edited in Cortex' })
  const notePath = path.join(h.root, researchFolder('small-software'), 'Notes', 'Campaign.md')
  assert.equal(bodyOf(parseNote(fs.readFileSync(notePath, 'utf8'))), 'Edited in Cortex')
  assert.deepEqual(h.stored().notes, frozen.notes, 'stored narrative is not a second authority')

  // An edit made in Obsidian is what Cortex reads back.
  const raw = fs.readFileSync(notePath, 'utf8')
  fs.writeFileSync(notePath, raw.replace('Edited in Cortex', 'Edited in Obsidian'))
  assert.equal((await h.service.read()).notes.campaign.text, 'Edited in Obsidian')

  const finding = (await h.service.read()).findings[0]
  h.tick()
  const reviewed = await h.service.action({ type: 'review_finding', id: finding.id, reviewStatus: 'confirmed' })
  assert.equal(reviewed.findings[0].reviewStatus, 'confirmed')
  assert.equal(h.stored().findings[0].reviewStatus, 'unreviewed')
  const added = await h.service.action({ type: 'add_finding', text: 'Second finding', sourceIds: ['source-1'], reviewStatus: 'unreviewed' })
  assert.equal(added.findings.length, 2)
  assert.equal(h.files('Findings').length, 2)

  h.tick()
  await h.service.action({ type: 'save_draft', draft: { ...frozen.campaign.draft, title: 'Small Software v2' } })
  const published = await h.service.action({ type: 'publish' })
  assert.equal(h.stored().campaign.revisions.length, 2)
  assert.deepEqual(h.stored().campaign.revisions, published.campaign.revisions)

  const exports = researchArchiveFiles(parseResearchState(await h.service.read()), null)
  assert.match(exports['notes.md'], /Edited in Obsidian/)
  assert.match(exports['findings-and-decisions.md'], /Second finding/)
  assert.match(exports['state.json'], /Edited in Obsidian/)
  assert.match(h.archives.at(-1)!.notes.campaign.text, /Edited in Obsidian/)
})

test('a vault edit between read and write is a conflict, not an overwrite', async () => {
  const h = harness()
  await seedStoreNarrative(h)
  h.narrative.migrate(structuredClone(h.stored()), { now: h.tick() })
  const current = h.narrative.read('small-software')!
  const notePath = path.join(h.root, researchFolder('small-software'), 'Notes', 'Campaign.md')
  fs.writeFileSync(notePath, fs.readFileSync(notePath, 'utf8').replace('Campaign note', 'Concurrent'))
  assert.throws(() => h.narrative.write('small-software', { ...current, notes: { ...current.notes, campaign: { text: 'Mine', updatedAt: h.tick() } } }, h.tick()), ResearchConflictError)
  assert.match(fs.readFileSync(notePath, 'utf8'), /Concurrent/)
})

test('invalid vault records are skipped and reported, and an absent vault falls back to the stored state', async () => {
  const h = harness()
  await seedStoreNarrative(h)
  h.narrative.migrate(structuredClone(h.stored()), { now: h.tick() })
  fs.writeFileSync(path.join(h.root, researchFolder('small-software'), 'Findings', 'Broken.md'), '---\nid: broken\ntype: research-finding\ncampaign: small-software\nstatus: maybe\n---\n\nNo sources\n')
  const narrative = h.narrative.read('small-software')!
  assert.deepEqual(narrative.skipped, [`${researchFolder('small-software')}/Findings/Broken.md`])
  assert.equal((await h.service.read()).findings.length, 1)

  fs.rmSync(h.root, { recursive: true })
  const view = await h.service.read()
  assert.equal(view.notes.campaign.text, 'Campaign note\nwith two lines\n')
  assert.throws(() => h.narrative.migrate(h.stored(), { now: h.tick() }), /not available/)
})
