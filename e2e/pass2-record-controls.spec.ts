import { test, expect, mockStores } from './fixtures'

const book = (id: string, title: string, status: string) => ({
  id, title, author: `${title} author`, status, score: '', genre: '', start: '', finished: '', notes: '',
})
const books = [book('reading-book', 'Reading fixture', 'En curso'), book('done-book', 'Done fixture', 'Hecho')]

test('book status filter clears on a second press and rows reopen by row click', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockStores(page, { 'cortex-books': books })
  await page.goto('/#/books')

  const statusGroup = page.getByRole('group', { name: 'Filter by status' })
  const done = statusGroup.getByRole('button', { name: 'Hecho', exact: true })
  await done.click()
  await expect(done).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Details for Reading fixture' })).toHaveCount(0)
  await done.click()
  await expect(done).toHaveAttribute('aria-pressed', 'false')
  const toggle = page.getByRole('button', { name: 'Details for Reading fixture' })
  await expect(toggle).toBeVisible()

  const row = page.getByRole('row').filter({ has: toggle })
  await row.getByText('Reading fixture author').click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const region = page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`)
  await expect(region.getByRole('textbox', { name: 'Author', exact: true })).toHaveValue('Reading fixture author')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(region).toBeHidden()
  await expect(region.getByRole('textbox', { name: 'Author', exact: true })).toHaveCount(0)

  await row.getByText('Reading fixture author').click()
  await expect(region.getByRole('textbox', { name: 'Author', exact: true })).toBeVisible()
})

test('a row delete control removes the contact without expanding it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const backend = await mockStores(page, { 'cortex-contacts': [{ id: 'delete-me', name: 'Delete fixture' }, { id: 'keep-me', name: 'Keep fixture' }] })
  await page.goto('/#/social')

  const keep = page.getByRole('button', { name: 'Details for Keep fixture' })
  const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Details for Delete fixture' }) })
  await row.hover()
  await row.getByRole('button', { name: 'Delete contact' }).click()
  await expect.poll(() => (backend.stores['cortex-contacts'] as { id: string }[]).map((c) => c.id)).toEqual(['keep-me'])
  await expect(keep).toHaveAttribute('aria-expanded', 'false')
})

test('phone CRM cards clear the status filter and reopen with the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const contact = {
    id: 'phone-client', name: 'Phone client', company: 'Phone company', role: '', email: '', phone: '',
    website: '', status: 'lead', value: 0, notes: '', lastContact: '', tags: [],
  }
  await mockStores(page, { 'cortex-crm': { orgs: [{ id: 'org', name: 'Org', contacts: [contact] }], activeOrg: 'org' } })
  await page.goto('/#/social?tab=crm')
  await page.getByRole('tab', { name: 'CRM', exact: true }).click()

  const status = page.getByRole('group', { name: 'Filter by status' })
  const active = status.getByRole('button', { name: 'Active', exact: true })
  await active.click()
  await expect(page.getByText('No contacts match.').filter({ visible: true })).toBeVisible()
  await active.click()
  await expect(active).toHaveAttribute('aria-pressed', 'false')

  const toggle = page.getByRole('button', { name: 'Details for Phone client' })
  const box = await toggle.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  for (const expanded of ['true', 'false', 'true']) {
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', expanded)
  }
  const region = page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`)
  await expect(region.getByRole('textbox', { name: 'Role', exact: true })).toBeVisible()
})

test('DM platform filter clears on a second press', async ({ page }) => {
  const at = '2026-10-11T15:00:00.000Z'
  const contact = (id: string, name: string, platform: 'x' | 'linkedin') => ({
    id, name, platform, handle: id, profileUrl: '', firstSentAt: at, lastSentAt: at,
    conversations: [{ id: `${id}-thread`, url: '', syncStatus: 'ok', lastObservedAt: at, history: { complete: true },
      messages: [{ id: `${id}-message`, direction: 'outbound', body: 'Hello.', sentAt: at, observedAt: at, deliveryStatus: 'sent' }] }],
  })
  await mockStores(page, { 'cortex-noelle-crm': {
    schemaVersion: 1, source: 'noelle', syncedAt: at, status: { lastAttemptAt: at, lastSuccessfulSyncAt: at },
    contacts: [contact('x-one', 'X fixture person', 'x'), contact('li-one', 'LinkedIn fixture person', 'linkedin')],
  } })
  await page.goto('/#/social')
  await page.getByRole('tab', { name: 'CRM', exact: true }).click()

  const platform = page.getByRole('group', { name: 'Filter by platform' })
  const x = platform.getByRole('button', { name: 'X · 1', exact: true })
  await x.click()
  await expect(page.getByRole('button', { name: /LinkedIn fixture person/ })).toHaveCount(0)
  await x.click()
  await expect(x).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: /LinkedIn fixture person/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /X fixture person/ })).toBeVisible()
})

test('the archived project filter clears on a second press', async ({ page }) => {
  const project = (name: string) => ({
    name, path: `/fixtures/${name}`, description: name, type: 'app', hasPackageJson: true,
    hasClaude: false, gitRemote: null, latestCommit: null, workflows: [], techStack: [], scripts: [], connections: [],
  })
  const projects = [project('Live project'), project('Shelved project')]
  await mockStores(page, {
    'cortex-cache-projects': { data: projects, lastUpdated: '2026-10-01T12:00:00Z' },
    'cortex-project-meta': { 'Shelved project': { status: 'archived' } },
  })
  await page.route('**/api/projects/scan', (route) => route.fulfill({ json: projects }))
  await page.goto('/#/projects')

  const archived = page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: 'Archived', exact: true })
  await archived.click()
  await expect(archived).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Live project', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Shelved project', { exact: true }).first()).toBeVisible()
  await archived.click()
  await expect(archived).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('Live project', { exact: true }).first()).toBeVisible()
})
