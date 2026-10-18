import type { Page } from '@playwright/test'
import { test, expect, mockStores } from './fixtures'
import { createResearchState } from '../electron/founder-research'

const crm = {
  activeOrg: 'first',
  orgs: [
    { id: 'first', name: 'First', contacts: [{ id: 'crm-1', name: 'Fixture lead', company: 'One', role: '', email: '', phone: '', website: '', status: 'lead', value: 0, notes: '', lastContact: '', tags: [] }] },
    { id: 'second', name: 'Second', contacts: [{ id: 'crm-2', name: 'Fixture partner', company: 'Two', role: '', email: '', phone: '', website: '', status: 'active', value: 0, notes: '', lastContact: '', tags: [] }] },
  ],
}

async function mockKnowledge(page: Page, available: boolean) {
  const requested: string[] = []
  await page.route('**/api/knowledge/links**', async (route) => {
    const ref = new URL(route.request().url()).searchParams.get('ref') ?? ''
    requested.push(ref)
    await route.fulfill({ json: { ref, available, notes: [], uri: null, cortexUrl: null } })
  })
  return requested
}

test('a CRM record link opens the CRM tab, switches to its org, expands it and resolves its vault note', async ({ page }) => {
  const backend = await mockStores(page, { 'cortex-crm': crm, 'cortex-noelle-crm': null })
  const requested = await mockKnowledge(page, false)
  await page.goto('/#/social?tab=crm&record=crm%3Acrm-2')
  await expect(page.getByRole('tab', { name: 'CRM', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByPlaceholder('Notes about this contact...')).toBeVisible()
  await expect.poll(() => (backend.stores['cortex-crm'] as typeof crm).activeOrg).toBe('second')
  await page.getByRole('button', { name: 'Open in Eightfold', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'The Eightfold vault is not available on this device.' })).toBeVisible()
  expect(requested).toEqual(['crm:crm-2'])

  await page.getByRole('tab', { name: 'Contacts', exact: true }).click()
  await expect(page).toHaveURL(/#\/social\?record=crm%3Acrm-2$/)
})

test('founder tabs and the research view are URL-addressable and link to the vault', async ({ page }) => {
  await mockStores(page, { 'cortex-founder-research': createResearchState('2026-10-18T12:00:00.000Z') })
  await page.route('**/api/founder-research', (route) => route.fulfill({ json: { ...createResearchState('2026-10-18T12:00:00.000Z'), events: [], crmContacts: [], sources: [] } }))
  const requested = await mockKnowledge(page, true)
  await page.goto('/#/founder?tab=research&view=evidence')
  await expect(page.getByRole('heading', { name: 'Small Software', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Evidence', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Research notes in Eightfold', exact: true }).click()
  await page.getByRole('button', { name: 'Eightfold Home', exact: true }).click()
  await expect.poll(() => requested).toEqual(['research:small-software', 'home:eightfold'])
  await page.getByRole('tab', { name: 'Metrics', exact: true }).click()
  await expect(page).toHaveURL(/#\/founder\?view=evidence$/)
})

test('a project link expands that project with its vault link', async ({ page }) => {
  await mockStores(page, { 'cortex-project-meta': {} })
  await page.route('**/api/projects/scan', (route) => route.fulfill({ json: [
    { name: 'Alpha', path: '/p/Alpha', description: null, type: 'app', hasPackageJson: true, hasClaude: false, gitRemote: null, latestCommit: null, workflows: [], techStack: [], scripts: [], connections: [] },
    { name: 'My Cortex', path: '/p/My Cortex', description: null, type: 'app', hasPackageJson: true, hasClaude: false, gitRemote: null, latestCommit: null, workflows: [], techStack: [], scripts: [], connections: [] },
  ] }))
  const requested = await mockKnowledge(page, true)
  await page.goto('/#/projects?project=my-cortex')
  const card = page.locator('#project-my-cortex')
  await expect(card.getByRole('button', { name: 'Open in Eightfold', exact: true })).toBeVisible()
  await expect(page.locator('#project-alpha').getByRole('button', { name: 'Open in Eightfold', exact: true })).toHaveCount(0)
  await card.getByRole('button', { name: 'Open in Eightfold', exact: true }).click()
  await expect.poll(() => requested).toEqual(['project:my-cortex'])
})
