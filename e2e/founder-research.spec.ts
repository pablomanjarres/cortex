import type { Locator, Page, Route } from '@playwright/test'
import { test, expect, mockStores } from './fixtures'
import { FounderResearchService, createResearchState, computeBriefHash, type ResearchEvent, type ResearchState } from '../electron/founder-research'
import type { NoelleCrmSnapshot } from '../electron/noelle-crm'

const at = '2026-10-11T15:00:00.000Z'
function publishedState(): ResearchState {
  const state = createResearchState(at), draft = state.campaign.draft
  state.campaign.revisions = [{ ...draft, schemaVersion: 1, campaignId: 'small-software', version: 1, hash: computeBriefHash('small-software', 1, draft), publishedAt: at }]
  return state
}
function prospect(state: ResearchState): ResearchEvent {
  return { id: 'draft-fixture', requestId: 'request-fixture', draftId: 'draft-fixture', purpose: 'research_invitation', briefVersion: 1, briefHash: state.campaign.revisions[0].hash, platform: 'x', recipient: { name: 'Fixture researcher', handle: 'fixture-researcher', profileUrl: 'https://x.com/fixture-researcher' }, body: 'Fixture research invitation.', status: 'approved', review: { status: 'approved' }, evidence: [{ id: 'evidence-fixture', source: 'public_post', summary: 'Fixture internal-tool source.' }], updatedAt: at }
}
function crmReceipt(): NoelleCrmSnapshot {
  return { schemaVersion: 1, source: 'noelle', syncedAt: at, status: { lastAttemptAt: at }, contacts: [{ id: 'crm-fixture', name: 'Fixture researcher', handle: 'fixture-researcher', platform: 'x', profileUrl: 'https://x.com/fixture-researcher', firstSentAt: at, lastSentAt: at, conversations: [{ id: 'thread-fixture', url: '', lastObservedAt: at, syncStatus: 'ok', history: { complete: false }, messages: [{ id: 'send-fixture', externalId: 'native-fixture', direction: 'outbound', body: 'Fixture research invitation.', sentAt: at, observedAt: at }, { id: 'reply-fixture', direction: 'inbound', body: 'Fixture exact customer reply.', sentAt: null, observedAt: at }] }] }] }
}
async function setup(page: Page, initial: ResearchState = createResearchState(at), crm: NoelleCrmSnapshot | null = null) {
  const backend = await mockStores(page, { 'cortex-founder-research': initial, 'cortex-noelle-crm': crm })
  let saved = structuredClone(initial), tick = 0
  const service = new FounderResearchService({ read: async () => saved, readCrm: async () => backend.stores['cortex-noelle-crm'] as NoelleCrmSnapshot | null, write: async state => { saved = structuredClone(state); backend.set('cortex-founder-research', state) }, now: () => new Date(Date.parse(at) + ++tick * 1000).toISOString() })
  await page.route('**/api/founder-research**', async route => {
    const url = new URL(route.request().url())
    try {
      const view = url.pathname.endsWith('/action') ? await service.action(route.request().postDataJSON()) : await service.read()
      return route.fulfill({ json: view })
    } catch (error) { return route.fulfill({ status: 400, json: { error: String((error as Error).message) } }) }
  })
  await page.goto('/#/founder')
  await page.getByRole('tab', { name: 'Research', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Small Software', exact: true })).toBeVisible()
  return { service, backend, state: () => saved }
}

test('Research remains reachable without metrics and publishes real brief versions without sample participants', async ({ page }, testInfo) => {
  const fixture = await setup(page)
  await expect(page.getByText('Draft brief', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Publish brief', exact: true }).click()
  await expect(page.getByText('Published v1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit brief', exact: true }).click()
  await page.getByLabel('Audience', { exact: true }).fill('Real teams already sharing tools built with agents.')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByText('Unpublished changes', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Publish next version', exact: true }).click()
  await expect(page.getByText('Published v2', { exact: true })).toBeVisible()
  expect(fixture.state().campaign.revisions).toHaveLength(2)
  expect(fixture.state().events).toHaveLength(0)
  await page.getByRole('tab', { name: 'Outreach', exact: true }).click()
  await expect(page.getByText('No verified research invitations sent yet.', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Metrics', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Research', exact: true })).toBeVisible()
  expect(fixture.backend.writes.filter(write => ['cortex-founder-research', 'cortex-noelle-crm'].includes(write.key))).toHaveLength(0)
  await page.screenshot({ path: testInfo.outputPath('founder-metrics-retained.png'), fullPage: true })
})

test('staged drafts require re-review after publishing and use separate Markdown notes', async ({ page }) => {
  const state = publishedState(); state.events = [prospect(state)]
  const fixture = await setup(page, state, crmReceipt())
  await page.getByRole('tab', { name: 'Outreach', exact: true }).click()
  await expect(page.getByText('Draft preview · send not verified', { exact: true })).toBeVisible()
  await expect(page.getByText('Fixture exact customer reply.', { exact: true })).toHaveCount(0)
  await page.getByText('Click to write research notes…', { exact: true }).click()
  await page.getByPlaceholder('Click to write research notes…').fill('## Fixture interview notes\nSaved separately.')
  await page.getByRole('button', { name: 'Save notes', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Research changes saved.')
  expect(fixture.state().notes['event:draft-fixture'].text).toContain('Saved separately.')
  expect(fixture.state().events[0].body).toBe('Fixture research invitation.')
  await page.getByRole('tab', { name: 'Brief', exact: true }).click()
  await page.getByRole('button', { name: 'Edit brief', exact: true }).click()
  await page.getByLabel('Objective', { exact: true }).fill('A changed real research objective.')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await page.getByRole('button', { name: 'Publish next version', exact: true }).click()
  await page.getByRole('tab', { name: 'Outreach', exact: true }).click()
  await expect(page.getByText('Needs re-review against the current published brief.', { exact: true })).toBeVisible()
})

test('a revised research draft replaces the selected unsent copy after an automatic import', async ({ page }) => {
  const state = publishedState()
  const originalId = '795d0697-90ac-45cb-9173-c3eaf7e605d5'
  const original = { ...prospect(state), id: originalId, draftId: originalId }
  state.events = [original]
  state.notes[`event:${originalId}`] = { text: 'Original copy review note.', updatedAt: at }
  const fixture = await setup(page, state)
  await page.getByRole('tab', { name: 'Outreach', exact: true }).click()
  await expect(page.getByText(original.body, { exact: true })).toBeVisible()
  const successorId = 'b0d5e479-a564-491d-95a2-b161a1ee67f2'
  const updatedAt = '2026-10-11T15:02:00.000Z'
  const successor = { ...original, id: successorId, draftId: successorId, supersedesDraftId: originalId, body: 'Revised fixture invitation with supported context.', updatedAt }
  await fixture.service.import({ schemaVersion: 1, source: 'noelle', campaignId: 'small-software', syncedAt: updatedAt, events: [successor], status: { lastAttemptAt: updatedAt, lastSuccessfulSyncAt: updatedAt } })
  await expect(page.getByText(successor.body, { exact: true })).toBeVisible({ timeout: 12000 })
  await expect(page.getByLabel('Research prospects').getByRole('button')).toHaveCount(1)
  await expect(page.getByText(original.body, { exact: true })).toHaveCount(0)
  await expect(page.getByText('Replaces draft', { exact: true })).toBeVisible()
  expect(fixture.state().events.find(item => item.id === originalId)?.body).toBe(original.body)
  expect(fixture.state().notes[`event:${originalId}`].text).toBe('Original copy review note.')
})

test('verified sends reuse the CRM timeline and automatically render newly imported replies', async ({ page }, testInfo) => {
  const state = publishedState(), event = prospect(state)
  state.events = [{ ...event, status: 'sent', nativeExternalId: 'native-fixture', crmContactId: 'crm-fixture', conversationId: 'thread-fixture' }]
  const fixture = await setup(page, state, crmReceipt())
  await page.getByRole('tab', { name: 'Outreach', exact: true }).click()
  await expect(page.getByText('Fixture exact customer reply.', { exact: true })).toBeVisible()
  await expect(page.getByText('History incomplete', { exact: true })).toBeVisible()
  await expect(page.getByText('Draft preview · send not verified', { exact: true })).toHaveCount(0)
  const crm = crmReceipt(); crm.contacts[0].conversations[0].messages.push({ id: 'reply-new', direction: 'inbound', body: 'Fixture automatically synced follow-up.', sentAt: null, observedAt: '2026-10-11T15:01:00.000Z' })
  fixture.backend.set('cortex-noelle-crm', crm)
  await expect(page.getByText('Fixture automatically synced follow-up.', { exact: true })).toBeVisible({ timeout: 12000 })
  await page.getByRole('button', { name: 'Use reply as finding source', exact: true }).first().click()
  await expect(page.getByRole('tab', { name: 'Evidence', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('checkbox', { name: /Incoming CRM reply.*Fixture exact customer reply/ })).toBeChecked()
  await page.getByLabel('New finding', { exact: true }).fill('Fixture observation from the exact reply.')
  await page.getByRole('button', { name: 'Save finding for review', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Research changes saved.')
  expect(fixture.state().findings[0].sourceIds).toEqual(['crm:x:thread-fixture:reply-fixture'])
  await page.getByRole('tab', { name: 'Outreach', exact: true }).click()
  await page.getByRole('button', { name: 'Mark interview booked', exact: true }).click()
  await expect(page.getByText('booked · marked manually', { exact: true })).toBeVisible()
  expect(fixture.state().meetings[event.id].source).toBe('manual')
  await page.screenshot({ path: testInfo.outputPath('research-crm-reuse.png'), fullPage: true })
})

test('evidence review ties findings to source IDs and decisions to reviewed findings', async ({ page }) => {
  const state = publishedState(); state.events = [prospect(state)]
  const fixture = await setup(page, state)
  await page.getByRole('tab', { name: 'Evidence', exact: true }).click()
  await page.getByLabel('New finding', { exact: true }).fill('Fixture finding grounded in a source.')
  await page.getByRole('checkbox', { name: /Fixture internal-tool source/ }).check()
  await page.getByRole('button', { name: 'Save finding for review', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm finding', exact: true }).click()
  await page.getByLabel('New decision', { exact: true }).fill('Fixture source-backed decision.')
  await page.getByRole('checkbox', { name: /Fixture finding grounded in a source/ }).check()
  await page.getByRole('button', { name: 'Save proposed decision', exact: true }).click()
  await page.getByRole('button', { name: 'Accept decision', exact: true }).click()
  expect(fixture.state().findings[0].sourceIds).toEqual(['evidence-fixture'])
  expect(fixture.state().findings[0].reviewStatus).toBe('confirmed')
  expect(fixture.state().decisions[0].evidenceIds).toEqual([fixture.state().findings[0].id])
  expect(fixture.state().decisions[0].reviewStatus).toBe('accepted')
})

test('edits made during delayed saves retain notes, brief changes and evidence references', async ({ page }) => {
  const state = publishedState(); state.events = [prospect(state)]
  const fixture = await setup(page, state)
  const delayedSave = async (button: Locator, editPending: () => Promise<void>) => {
    let release!: () => void
    let started!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const submitted = new Promise<void>(resolve => { started = resolve })
    const handler = async (route: Route) => { started(); await pending; await route.fallback() }
    await page.route('**/api/founder-research/action', handler)
    const response = page.waitForResponse('**/api/founder-research/action')
    try {
      await button.click()
      await submitted
      await expect(button).toBeDisabled()
      await editPending()
    } finally { release() }
    await response
    await page.unroute('**/api/founder-research/action', handler)
    await expect(page.getByRole('status')).toContainText('Research changes saved.')
  }

  await page.getByText('Click to write research notes…', { exact: true }).click()
  const notes = page.getByPlaceholder('Click to write research notes…')
  const saveNotes = page.getByRole('button', { name: 'Save notes', exact: true })
  await notes.fill('Submitted campaign note.')
  await delayedSave(saveNotes, () => notes.fill('New campaign note while saving.'))
  await expect(notes).toHaveValue('New campaign note while saving.')
  expect(fixture.state().notes.campaign.text).toBe('Submitted campaign note.')
  await saveNotes.click()
  await expect(saveNotes).toBeDisabled()
  expect(fixture.state().notes.campaign.text).toBe('New campaign note while saving.')

  await page.getByRole('button', { name: 'Edit brief', exact: true }).click()
  const objective = page.getByLabel('Objective', { exact: true })
  const saveDraft = page.getByRole('button', { name: 'Save draft', exact: true })
  await objective.fill('Submitted research objective.')
  await delayedSave(saveDraft, () => objective.fill('New research objective while saving.'))
  await expect(objective).toHaveValue('New research objective while saving.')
  expect(fixture.state().campaign.draft.objective).toBe('Submitted research objective.')
  await saveDraft.click()
  await expect(saveDraft).toBeDisabled()
  expect(fixture.state().campaign.draft.objective).toBe('New research objective while saving.')

  await fixture.service.action({ type: 'save_draft', draft: { ...fixture.state().campaign.draft, objective: 'Externally updated research objective.' }, expectedUpdatedAt: fixture.state().campaign.draftUpdatedAt })
  await page.getByRole('button', { name: 'Refresh research', exact: true }).click()
  await expect(objective).toHaveValue('Externally updated research objective.')
  await objective.fill('Fresh local edit after external research update.')
  await saveDraft.click()
  await expect(page.getByRole('status')).toContainText('Research changes saved.')
  await expect(saveDraft).toBeDisabled()
  expect(fixture.state().campaign.draft.objective).toBe('Fresh local edit after external research update.')

  await page.getByRole('tab', { name: 'Evidence', exact: true }).click()
  const finding = page.getByLabel('New finding', { exact: true })
  const source = page.getByRole('checkbox', { name: /Fixture internal-tool source/ })
  const saveFinding = page.getByRole('button', { name: 'Save finding for review', exact: true })
  await finding.fill('Submitted source-backed finding.')
  await source.check()
  await delayedSave(saveFinding, () => finding.fill('New source-backed finding while saving.'))
  await expect(finding).toHaveValue('New source-backed finding while saving.')
  await expect(source).toBeChecked()
  await saveFinding.click()
  await expect(finding).toHaveValue('')
  expect(fixture.state().findings.map(item => ({ text: item.text, sourceIds: item.sourceIds }))).toEqual([
    { text: 'Submitted source-backed finding.', sourceIds: ['evidence-fixture'] },
    { text: 'New source-backed finding while saving.', sourceIds: ['evidence-fixture'] },
  ])

  const decision = page.getByLabel('New decision', { exact: true })
  const supportingFinding = page.getByRole('checkbox', { name: /Submitted source-backed finding/ })
  const saveDecision = page.getByRole('button', { name: 'Save proposed decision', exact: true })
  await decision.fill('Submitted research decision.')
  await supportingFinding.check()
  await delayedSave(saveDecision, async () => {
    await decision.fill('New research decision while saving.')
    await page.getByRole('checkbox', { name: /New source-backed finding while saving/ }).check()
  })
  await expect(decision).toHaveValue('New research decision while saving.')
  await expect(supportingFinding).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /New source-backed finding while saving/ })).toBeChecked()
  await saveDecision.click()
  await expect(decision).toHaveValue('')
  expect(fixture.state().decisions.map(item => item.text)).toEqual(['Submitted research decision.', 'New research decision while saving.'])
  expect(fixture.state().decisions[1].evidenceIds).toEqual(fixture.state().findings.map(item => item.id))
})

test('phone Research view wraps content and exposes failed sync without losing staged work', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const state = publishedState(); state.events = [{ ...prospect(state), body: 'x'.repeat(500) }]; state.sync.error = 'Fixture research sync unavailable.'
  await setup(page, state)
  await expect(page.getByText('Fixture research sync unavailable. Saved research is retained.')).toBeVisible()
  await page.getByRole('tab', { name: 'Outreach', exact: true }).click()
  await expect(page.getByText('x'.repeat(500), { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('research-phone.png'), fullPage: true })
})

test('generation status distinguishes current, older, missing and failed draft passes', async ({ page }) => {
  const state = publishedState(), brief = state.campaign.revisions[0]
  state.sync.generation = [{ schemaVersion: 1, campaignId: 'small-software', platform: 'x', purpose: 'research_invitation', observedAt: at, status: 'success', windowKey: 'fixture-window', briefVersion: 1, briefHash: brief.hash, eligible: 2, staged: 1, pending: 1, sent: 0 }]
  const fixture = await setup(page, state)
  await expect(page.getByText('Current brief checked', { exact: true })).toBeVisible()
  await expect(page.getByText('Not run yet', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit brief', exact: true }).click()
  await page.getByLabel('Objective', { exact: true }).fill('A changed real objective for generation checks.')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await page.getByRole('button', { name: 'Publish next version', exact: true }).click()
  await expect(page.getByText('Older or unpublished brief', { exact: true })).toBeVisible()
  await fixture.service.import({ schemaVersion: 1, source: 'noelle', campaignId: 'small-software', syncedAt: '2026-10-11T15:03:00.000Z', events: [], status: { lastAttemptAt: '2026-10-11T15:03:00.000Z', generation: [{ ...state.sync.generation[0], observedAt: '2026-10-11T15:03:00.000Z', status: 'error', error: 'brief_unavailable' }] } })
  await expect(page.getByText('Needs attention', { exact: true })).toBeVisible({ timeout: 12000 })
  await expect(page.getByText('brief unavailable', { exact: true })).toBeVisible()
})
