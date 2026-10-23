import { test, expect, mockStores } from './fixtures'
import type { Page } from '@playwright/test'

const layouts = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const

const fixtureBook = {
  id: 'fixture-book', title: 'Fixture book', author: 'Fixture author', status: 'Sin empezar',
  score: '', genre: '', start: '', finished: '', notes: '',
}
const fixtureContact = { id: 'fixture-contact', name: 'Fixture friend', title: 'Fixture title' }
const fixtureClient = {
  id: 'fixture-client', name: 'Fixture client', company: 'Fixture company', role: '', email: '', phone: '',
  website: '', status: 'lead', value: 0, notes: '', lastContact: '', tags: [],
}
const fixtureCrm = { orgs: [{ id: 'fixture-org', name: 'Fixture org', contacts: [fixtureClient] }], activeOrg: 'fixture-org' }

/** Opens a record with the keyboard and returns the region its toggle controls. */
async function expandWithKeyboard(page: Page, name: string) {
  const toggle = page.getByRole('button', { name: `Details for ${name}` })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const controls = await toggle.getAttribute('aria-controls')
  expect(controls).toBeTruthy()
  const region = page.locator(`[id="${controls}"]`)
  await expect(region).toBeVisible()
  return { toggle, region }
}

async function collapseWithKeyboard(page: Page, toggle: ReturnType<Page['getByRole']>, region: ReturnType<Page['locator']>) {
  await toggle.focus()
  await page.keyboard.press('Space')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(region).toBeHidden()
}

for (const layout of layouts) {
  test.describe(`${layout.name} record editors`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: layout.width, height: layout.height })
    })

    test('books edit through labelled fields and filter to an empty state', async ({ page }) => {
      const backend = await mockStores(page, { 'cortex-books': [fixtureBook] })
      await page.goto('/#/books')
      const { toggle, region } = await expandWithKeyboard(page, 'Fixture book')

      await region.getByRole('textbox', { name: 'Author', exact: true }).fill('Edited author')
      await region.getByRole('combobox', { name: 'Status', exact: true }).selectOption('Hecho')
      await region.getByRole('combobox', { name: 'Score', exact: true }).selectOption('4 stars')
      await region.getByRole('textbox', { name: 'Notes', exact: true }).fill('Fixture note')
      await expect.poll(() => (backend.stores['cortex-books'] as typeof fixtureBook[])[0])
        .toMatchObject({ author: 'Edited author', status: 'Hecho', score: '4 stars', notes: 'Fixture note' })
      expect(backend.writes.some((write) => write.key === 'cortex-books')).toBe(true)
      await collapseWithKeyboard(page, toggle, region)

      if (layout.name === 'desktop') {
        const titleHeader = page.getByRole('columnheader', { name: 'Title' })
        await expect(titleHeader).toHaveAttribute('aria-sort', 'ascending')
        await titleHeader.getByRole('button').click()
        await expect(titleHeader).toHaveAttribute('aria-sort', 'descending')
      }

      await page.getByRole('searchbox', { name: 'Search books', exact: true }).fill('no such fixture')
      await expect(page.getByText('No books match.').filter({ visible: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Details for Fixture book' })).toHaveCount(0)
    })

    test('contacts edit through labelled fields and filter to an empty state', async ({ page }) => {
      const backend = await mockStores(page, { 'cortex-contacts': [fixtureContact] })
      await page.goto('/#/social')
      const { toggle, region } = await expandWithKeyboard(page, 'Fixture friend')

      await region.getByRole('textbox', { name: 'Phone', exact: true }).fill('555 0100')
      await region.getByRole('textbox', { name: 'Email', exact: true }).fill('fixture@example.test')
      await region.getByRole('group', { name: 'Categories' }).getByRole('button', { name: /^Mentor/ }).click()
      await expect.poll(() => (backend.stores['cortex-contacts'] as Record<string, unknown>[])[0])
        .toMatchObject({ phone: '555 0100', email: 'fixture@example.test', categories: ['Mentor 🧓'] })
      await expect(region.getByRole('button', { name: /Delete contact/ })).toHaveCount(layout.name === 'desktop' ? 1 : 0)
      await collapseWithKeyboard(page, toggle, region)

      await page.getByRole('searchbox', { name: 'Search contacts', exact: true }).fill('no such fixture')
      await expect(page.getByText('No contacts match.').filter({ visible: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Details for Fixture friend' })).toHaveCount(0)
    })

    test('CRM contacts edit through labelled fields, keep typed tags and filter to empty', async ({ page }) => {
      const backend = await mockStores(page, { 'cortex-crm': fixtureCrm })
      await page.goto('/#/social?tab=crm')
      await page.getByRole('tab', { name: 'CRM', exact: true }).click()
      const { toggle, region } = await expandWithKeyboard(page, 'Fixture client')

      await region.getByRole('textbox', { name: 'Role', exact: true }).fill('Fixture role')
      await region.getByRole('textbox', { name: 'Phone', exact: true }).fill('555 0101')
      await region.getByRole('combobox', { name: 'Status', exact: true }).selectOption('active')
      const tags = region.getByRole('textbox', { name: 'Tags', exact: true })
      await tags.click()
      await tags.pressSequentially('vip, priority')
      await expect(tags).toHaveValue('vip, priority')
      await tags.press('Enter')

      const savedClient = () => (backend.stores['cortex-crm'] as typeof fixtureCrm).orgs[0].contacts[0]
      await expect.poll(savedClient).toMatchObject({ role: 'Fixture role', phone: '555 0101', status: 'active', tags: ['vip', 'priority'] })
      await expect(tags).toHaveValue('vip, priority')
      await collapseWithKeyboard(page, toggle, region)

      await page.getByRole('searchbox', { name: 'Search CRM contacts', exact: true }).fill('no such fixture')
      await expect(page.getByText('No contacts match.').filter({ visible: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Details for Fixture client' })).toHaveCount(0)
    })
  })
}
