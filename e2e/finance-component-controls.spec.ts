import type { Page } from '@playwright/test'
import { test, expect, mockStores } from './fixtures'

const october = (amount: number) => [0, 0, 0, 0, 0, 0, 0, 0, amount, amount, 0, 0]

type Item = { id: string; months: number[]; paid?: boolean[]; paidAmounts?: number[]; receivedAmounts?: (number | null)[] }

const fixture = () => ({
  year: 2026,
  items: [
    { id: 'mom', name: 'Mom', type: 'Income', months: october(1500000) },
    { id: 'rent', name: 'Rent', type: 'Expense', category: 'Home', months: october(200000) },
    { id: 'internet', name: 'Internet', type: 'Expense', category: 'Home', months: october(100000), paid: october(1).map(Boolean) },
  ],
})

async function openFinance(page: Page, extra: Record<string, unknown> = {}) {
  await page.clock.setFixedTime(new Date('2026-10-01T15:00:00Z'))
  const backend = await mockStores(page, { 'cortex-finances': fixture(), ...extra })
  await page.goto('/#/finance')
  await expect(page.getByRole('button', { name: 'Set paid amount for Rent' })).toBeVisible()
  const item = (id: string) => (backend.stores['cortex-finances'] as { items: Item[] }).items.find((entry) => entry.id === id)!
  const financeWrites = () => backend.writes.filter((write) => write.key === 'cortex-finances').length
  return { backend, item, financeWrites }
}

const rowFor = (page: Page, trigger: string) =>
  page.getByRole('row').filter({ has: page.getByRole('button', { name: trigger }) }).locator('td').first()

for (const { kind, name, label, draft, partial } of [
  { kind: 'paid', name: 'Rent', label: 'Paid', draft: '200000', partial: '$50K/$200K' },
  { kind: 'received', name: 'Mom', label: 'Received', draft: '', partial: '$50K/$1.5M' },
] as const) {
  test(`${kind} editor exposes its state and Escape cancels without saving`, async ({ page }) => {
    const { item, financeWrites } = await openFinance(page)
    const trigger = page.getByRole('button', { name: `Set ${kind} amount for ${name}` })
    const editor = page.getByRole('textbox', { name: `${label} amount for ${name}` })
    const before = financeWrites()

    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await trigger.click()
    await expect(editor).toBeFocused()
    await expect(editor).toHaveValue(draft)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(trigger).toHaveAttribute('aria-controls', (await editor.getAttribute('id'))!)

    await editor.fill('50000')
    await editor.press('Escape')
    await expect(editor).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await page.waitForTimeout(300)
    expect(financeWrites()).toBe(before)
    expect(item(name.toLowerCase()).paidAmounts).toBeUndefined()
    expect(item(name.toLowerCase()).receivedAmounts).toBeUndefined()
  })

  test(`${kind} editor saves a partial amount exactly once on Enter`, async ({ page }) => {
    const { item, financeWrites } = await openFinance(page)
    const trigger = page.getByRole('button', { name: `Set ${kind} amount for ${name}` })
    const editor = page.getByRole('textbox', { name: `${label} amount for ${name}` })
    const before = financeWrites()

    await trigger.click()
    await editor.fill('50000')
    await editor.press('Enter')
    await expect(editor).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect.poll(financeWrites).toBe(before + 1)
    await page.waitForTimeout(300)
    expect(financeWrites()).toBe(before + 1)

    const saved = item(name.toLowerCase())
    if (kind === 'paid') {
      expect(saved.paidAmounts?.[9]).toBe(50000)
      expect(saved.paid?.[9]).toBe(false)
      await expect(page.getByText('Pending', { exact: true }).locator('..').locator('..')).toContainText('$150.000')
    } else {
      expect(saved.receivedAmounts?.[9]).toBe(50000)
      expect(saved.receivedAmounts?.[8]).toBeNull()
      expect(saved.months[9]).toBe(1500000)
    }
    await expect(rowFor(page, `Set ${kind} amount for ${name}`).getByText(partial)).toBeVisible()
  })

  test(`${kind} draft stays in its month when the month changes while editing`, async ({ page }) => {
    const { item } = await openFinance(page)
    await page.getByRole('button', { name: `Set ${kind} amount for ${name}` }).click()
    await page.getByRole('textbox', { name: `${label} amount for ${name}` }).fill('60000')
    await page.getByRole('tab', { name: 'Sep', exact: true }).click()

    await expect(page.getByRole('textbox', { name: `${label} amount for ${name}` })).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Set ${kind} amount for ${name}` })).toHaveAttribute('aria-expanded', 'false')
    const amounts = kind === 'paid' ? () => item('rent').paidAmounts : () => item('mom').receivedAmounts
    await expect.poll(() => amounts()?.[9]).toBe(60000)
    expect(amounts()?.[8] ?? null).toBe(kind === 'paid' ? 0 : null)
    await expect(rowFor(page, `Set ${kind} amount for ${name}`).getByText(kind === 'paid' ? '$0/$200K' : '—/$1.5M')).toBeVisible()
  })
}

test('a complete payment and a legacy paid flag both read as settled', async ({ page }) => {
  const { item, financeWrites } = await openFinance(page)
  await expect(rowFor(page, 'Set paid amount for Internet').getByText('$100K/$100K')).toBeVisible()

  const before = financeWrites()
  await page.getByRole('button', { name: 'Set paid amount for Internet' }).click()
  await expect(page.getByRole('textbox', { name: 'Paid amount for Internet' })).toHaveValue('100000')
  await page.getByRole('textbox', { name: 'Paid amount for Internet' }).press('Enter')
  await page.waitForTimeout(300)
  expect(financeWrites()).toBe(before)
  expect(item('internet').paidAmounts).toBeUndefined()

  await page.getByRole('button', { name: 'Set paid amount for Rent' }).click()
  await page.getByRole('textbox', { name: 'Paid amount for Rent' }).press('Enter')
  await expect.poll(() => item('rent').paid?.[9]).toBe(true)
  expect(item('rent').paidAmounts?.[9]).toBe(200000)
  await expect(page.getByText('bills settled this month').locator('..')).toContainText('2/2')
})

test('received income keeps an explicit zero distinct from an unknown receipt', async ({ page }) => {
  const { item } = await openFinance(page)
  const editor = page.getByRole('textbox', { name: 'Received amount for Mom' })
  await page.getByRole('button', { name: 'Set received amount for Mom' }).click()
  await editor.fill('0')
  await editor.press('Enter')
  await expect.poll(() => item('mom').receivedAmounts?.[9]).toBe(0)
  await expect(rowFor(page, 'Set received amount for Mom').getByText('$0/$1.5M')).toBeVisible()

  await page.getByRole('button', { name: 'Set received amount for Mom' }).click()
  await expect(editor).toHaveValue('0')
  await editor.fill('')
  await editor.press('Tab')
  await expect.poll(() => item('mom').receivedAmounts?.[9]).toBeNull()
  await expect(rowFor(page, 'Set received amount for Mom').getByText('—/$1.5M')).toBeVisible()
})

test('concealed income hides receipt controls while expenses stay editable', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T15:00:00Z'))
  const data = fixture()
  const items = [{ ...data.items[0], receivedAmounts: [null, null, null, null, null, null, null, null, null, 700000, null, null] }, ...data.items.slice(1)]
  await mockStores(page, { 'cortex-finances': { ...data, items }, 'cortex-finance-hide-income': true })
  await page.goto('/#/finance')

  await expect(page.getByRole('button', { name: 'Hidden' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Set paid amount for Rent' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Set received amount for Mom' })).toHaveCount(0)
  const momCell = page.getByRole('row').filter({ has: page.getByRole('textbox', { name: 'Item name for Mom' }) }).locator('td').first()
  await expect(momCell.getByText('Received', { exact: true })).toHaveCount(0)
  await expect(page.getByText('$700K/$1.5M')).toHaveCount(0)

  await page.getByRole('button', { name: 'Hidden' }).click()
  await expect(page.getByRole('button', { name: 'Set received amount for Mom' })).toBeVisible()
  await expect(momCell.getByText('$700K/$1.5M')).toBeVisible()
})
