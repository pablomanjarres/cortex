import { test, expect, mockStores } from './fixtures'

test('Credit follows Income with independent synced fees, its own subtotal and filter, and unchanged accounting', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-24T15:00:00Z'))
  const backend = await mockStores(page, {
    'cortex-finances': { year: 2026, items: [
      { id: 'salary', name: 'Example income', type: 'Income', months: Array(12).fill(200000) },
      { id: 'rent', name: 'Rent', type: 'Expense', category: 'Home', months: Array(12).fill(100000) },
    ] },
    'cortex-financial-accounts': { version: 1, accounts: [
      { id: 'card', name: 'Example credit card', institution: 'Test bank', kind: 'credit', currency: 'COP', archived: false, fees: [
        { id: 'management', name: 'Management fee', amount: 12000, cadence: 'monthly', budgetStartMonth: '2026-10' },
        { id: 'insurance', name: 'Card insurance', amount: 1000, cadence: 'monthly', budgetStartMonth: '2026-10' },
      ] },
      { id: 'debit', name: 'Example debit card', institution: 'Test bank', kind: 'debit', currency: 'COP', archived: false, fees: [
        { id: 'management', name: 'Management fee', amount: 0, cadence: 'monthly', budgetStartMonth: '2026-10' },
      ] },
    ] },
  })
  await page.goto('/#/finance')
  const groups = () => page.locator('table > tbody[aria-label]').evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')))
  await expect.poll(groups).toEqual(['Income', 'Credit', 'Expense'])
  const credit = page.getByRole('rowgroup', { name: 'Credit', exact: true })
  await expect(credit.getByRole('row').filter({ hasText: 'Example credit card · Management fee' })).toContainText('$12.000')
  await expect(credit.getByRole('row').filter({ hasText: 'Example credit card · Card insurance' })).toContainText('$1.000')
  await expect(credit.getByRole('row').filter({ hasText: 'Credit Subtotal' })).toContainText('$13.000')
  const expenses = page.getByRole('rowgroup', { name: 'Expense', exact: true })
  await expect(expenses).not.toContainText('Management fee')
  await expect(expenses.getByRole('row').filter({ hasText: 'Expense Subtotal' })).toContainText('$100.000')
  await expect(page.getByText('Expenses', { exact: true }).first().locator('..').locator('..')).toContainText('$113K')

  await page.getByRole('button', { name: 'Credit', exact: true }).click()
  await expect.poll(groups).toEqual(['Credit'])
  await expect(credit).toContainText('Card insurance')
  await page.getByRole('button', { name: 'Credit', exact: true }).click()
  await page.getByRole('button', { name: 'Manage all', exact: true }).click()
  await expect(credit).toContainText('Example debit card · Management fee')
  await page.getByRole('button', { name: 'Month focus', exact: true }).click()
  await expect(credit).not.toContainText('Example debit card · Management fee')

  await page.getByRole('tab', { name: 'Accounts & cards' }).click()
  await page.getByRole('button', { name: 'Edit Example credit card' }).click()
  await page.getByRole('dialog').getByLabel('Fee amount', { exact: true }).first().fill('15000')
  await page.getByRole('button', { name: 'Save account' }).click()
  await page.getByRole('tab', { name: 'Budget', exact: true }).click()
  await expect(credit.getByRole('row').filter({ hasText: 'Credit Subtotal' })).toContainText('$16.000')
  await expect.poll(groups).toEqual(['Income', 'Credit', 'Expense'])
  expect((backend.stores['cortex-finances'] as { items: unknown[] }).items).toHaveLength(2)
  await page.reload()
  await expect(credit.getByRole('row').filter({ hasText: 'Credit Subtotal' })).toContainText('$16.000')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Manage all', exact: true }).click()
  await page.getByRole('button', { name: 'Toggle compact columns' }).click()
  const scroller = page.locator('table').locator('..')
  await scroller.evaluate((element) => { element.scrollLeft = element.scrollWidth - element.clientWidth })
  await expect.poll(async () => {
    const bounds = await scroller.boundingBox()
    const heading = await credit.getByRole('row').first().locator('span').boundingBox()
    return Boolean(bounds && heading && heading.x >= bounds.x && heading.x + heading.width <= bounds.x + bounds.width)
  }).toBe(true)
})
