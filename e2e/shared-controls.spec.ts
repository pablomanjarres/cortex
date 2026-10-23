import { test, expect, mockStores } from './fixtures'

test('notes formatting can be reached and used with the keyboard', async ({ page }) => {
  const backend = await mockStores(page, {
    'cortex-captures': [{ id: 'note', title: 'Keyboard note', source: 'other', content: 'hello', url: '', imageIds: [], createdAt: '2026-10-23T12:00:00Z' }],
  })
  await page.goto('/#/library?kind=captures')
  await page.getByText('Keyboard note', { exact: true }).click()
  await page.getByText('hello', { exact: true }).click()
  const editor = page.locator('textarea').first()
  await expect(editor).toBeFocused()
  await editor.press('ControlOrMeta+A')
  const bold = page.getByRole('button', { name: 'Bold', exact: true })
  await bold.focus()
  await expect(bold).toBeVisible()
  await bold.press('Enter')
  await expect(editor).toHaveValue('**hello**')
  await expect.poll(() => (backend.stores['cortex-captures'] as { content: string }[])[0].content).toBe('**hello**')
})

test('thought details have one labelled editor with keyboard expansion', async ({ page }) => {
  const backend = await mockStores(page, {
    'cortex-thoughts': [{ id: 'thought', name: 'A useful thought', subline: '', topic: '', book: '', highValue: false }],
  })
  await page.goto('/#/library')
  await page.getByRole('tab', { name: 'Thoughts', exact: true }).click()
  const toggle = page.getByRole('button', { name: 'Details for A useful thought', exact: true })
  await toggle.focus()
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await page.getByLabel('Details', { exact: true }).fill('New detail')
  await page.getByLabel('Topic', { exact: true }).selectOption('Study')
  await expect.poll(() => (backend.stores['cortex-thoughts'] as { topic: string }[])[0].topic).toBe('Study')
  await page.getByRole('searchbox', { name: 'Search thoughts', exact: true }).fill('no match')
  await expect(page.getByText('No thoughts match.', { exact: true })).toBeVisible()
})

test('fullscreen notes use the shared dialog and restore focus on Escape', async ({ page }) => {
  await mockStores(page, {
    'cortex-captures': [{ id: 'note', title: 'Fullscreen note', source: 'other', content: 'hello', url: '', imageIds: [], createdAt: '2026-10-23T12:00:00Z' }],
  })
  await page.goto('/#/library?kind=captures')
  await page.getByText('Fullscreen note', { exact: true }).click()
  const fullscreen = page.getByRole('button', { name: 'Fullscreen', exact: true })
  await fullscreen.click()
  const dialog = page.getByRole('dialog', { name: 'Notes editor', exact: true })
  await expect(dialog).toBeVisible({ timeout: 2000 })
  await expect(dialog.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('hello')
  await dialog.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(dialog.getByText('hello', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(fullscreen).toBeFocused()
})

test('Market and Student share numeric editing with cancel and one save', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T15:00:00Z'))
  const months = Array.from({ length: 12 }, (_, month) => month === 9 ? 500000 : 0)
  const backend = await mockStores(page, {
    'cortex-food-sync-v1': true,
    'cortex-finances': { year: 2026, items: [{ id: 'food', name: 'Food', type: 'Expense', category: 'Food', months }] },
  })
  await page.goto('/#/gym')
  await page.getByRole('tab', { name: 'Market', exact: true }).click()
  const trigger = page.getByRole('button', { name: 'Edit food budget (COP)', exact: true })
  await expect(trigger).toBeVisible()
  const before = backend.writes.filter(write => write.key === 'cortex-finances').length
  await trigger.click()
  const input = page.getByRole('textbox', { name: 'Food budget (COP)', exact: true })
  await input.fill('600000')
  await input.press('Escape')
  await expect(trigger).toBeFocused()
  expect(backend.writes.filter(write => write.key === 'cortex-finances')).toHaveLength(before)
  await trigger.click()
  await input.fill('550000')
  await input.press('Enter')
  await expect(trigger).toBeFocused()
  await expect.poll(() => backend.writes.filter(write => write.key === 'cortex-finances').length).toBe(before + 1)
  await expect.poll(() => (backend.stores['cortex-finances'] as { items: { months: number[] }[] }).items[0].months[9]).toBe(550000)
})
