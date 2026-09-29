import { test, expect, mockStores } from './fixtures'

test('a one-time payment changes this month without creating a budget row', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-29T15:00:00Z'))
  const months = (september: number) => [0, 0, 0, 0, 0, 0, 0, 0, september, 0, 0, 0]
  const backend = await mockStores(page, {
    'cortex-finances': {
      year: 2026,
      items: [
        { id: 'income', name: 'Salary', type: 'Income', months: months(500000) },
        { id: 'rent', name: 'Rent', type: 'Expense', category: 'Home', months: months(200000) },
      ],
    },
  })

  await page.goto('/#/finance')
  await page.getByRole('button', { name: 'Add one-time payment' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Laptop charger')
  await expect(page.getByRole('heading', { name: 'Add one-time payment' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Amount (COP)' }).fill('120000')
  await page.getByLabel('Category', { exact: true }).selectOption('Apps')
  await page.getByRole('button', { name: 'Save payment' }).click()

  await expect.poll(() => (backend.stores['cortex-finances'] as {
    items: unknown[]
    oneTimePayments?: { name: string; amount: number; date: string; paid: boolean }[]
  }).oneTimePayments).toMatchObject([
    { name: 'Laptop charger', amount: 120000, date: '2026-09-29', paid: true },
  ])
  expect((backend.stores['cortex-finances'] as { items: unknown[] }).items).toHaveLength(2)
  await expect(page.getByText('Account Balance · Sep').locator('..').locator('..')).toContainText('$380.000')
  await expect(page.getByText('Pending', { exact: true }).locator('..').locator('..')).toContainText('$200.000')
  await expect(page.getByText('Expenses', { exact: true }).first().locator('..').locator('..')).toContainText('$320K')

  await page.getByRole('button', { name: /Hide one-time payments/ }).click()
  await expect(page.getByRole('button', { name: 'Edit Laptop charger' })).toHaveCount(0)
  await page.getByRole('button', { name: /Show one-time payments/ }).click()
  await page.getByRole('button', { name: 'Edit Laptop charger' }).click()
  await page.getByRole('textbox', { name: 'Amount (COP)' }).fill('130000')
  await page.getByLabel('Status', { exact: true }).selectOption('Upcoming')
  await page.getByRole('button', { name: 'Save payment' }).click()
  await expect(page.getByText('Account Balance · Sep').locator('..').locator('..')).toContainText('$500.000')
  await expect(page.getByText('Pending', { exact: true }).locator('..').locator('..')).toContainText('$330.000')

  await page.getByRole('button', { name: 'Edit Laptop charger' }).click()
  await page.getByLabel('Date', { exact: true }).fill('2026-10-04')
  await page.getByRole('button', { name: 'Save payment' }).click()
  await expect(page.getByRole('tab', { name: 'Oct', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: 'Edit Laptop charger' })).toBeVisible()
  await expect(page.getByText('Pending', { exact: true }).locator('..').locator('..')).toContainText('$130.000')

  await page.getByRole('button', { name: 'Delete Laptop charger' }).click()
  await expect.poll(() => (backend.stores['cortex-finances'] as { oneTimePayments?: unknown[] }).oneTimePayments).toEqual([])
  await page.getByRole('tab', { name: /Sep/ }).click()
  await expect(page.getByText('Expenses', { exact: true }).first().locator('..').locator('..')).toContainText('$200K')
})
