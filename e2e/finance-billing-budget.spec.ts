import { test, expect, mockStores } from './fixtures'
import { applyCreditCardCommand, emptyCreditCardState } from '../electron/credit-card-model'
import type { FinanceData } from '../src/features/finance/finance-model'

const finance: FinanceData = { year: 2026, items: [
  { id: 'salary', name: 'Salary', type: 'Income', months: Array(12).fill(500000) },
  { id: 'rent', name: 'Rent', type: 'Expense', category: 'Home', months: Array(12).fill(100000) },
  { id: 'music', name: 'Music', type: 'Subscription', category: 'Entertainment', months: Array(12).fill(5000) },
] }

function cardWithStatement() {
  let state = applyCreditCardCommand(emptyCreditCardState(), {
    type: 'initialize', requestId: 'billing-fixture',
    card: { id: 'card', name: 'Everyday card', limit: 500000, closingDay: 4, dueDay: 24 },
    purchases: [{ id: 'lamp', name: 'Desk lamp', amount: 120001, installments: 3, firstDueDate: '2026-11-24', status: 'posted' }],
  }, '2026-10-03T15:00:00Z')
  state = applyCreditCardCommand(state, { type: 'cycle.save', requestId: 'statement-fixture',
    cycle: { id: '2026-11', dueDate: '2026-11-24', interest: 1000, fees: 500, chargesConfirmed: true,
      confirmedAmount: 50000, statementConfirmed: true } }, '2026-10-03T15:00:00Z')
  return applyCreditCardCommand(state, { type: 'payment.save', requestId: 'payment-fixture',
    payment: { id: 'early', amount: 10000, paidDate: '2026-10-03', status: 'completed',
      allocations: [{ cycleId: '2026-11', amount: 10000 }] } }, '2026-10-03T15:00:00Z')
}

test('optional billing day persists, clamps short months, and clears without changing amounts', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-03T15:00:00Z'))
  await page.setViewportSize({ width: 320, height: 900 })
  const backend = await mockStores(page, { 'cortex-finances': finance })
  await page.goto('/#/finance')
  await page.getByRole('button', { name: 'Budget', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Set billing date for Salary' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Set billing date for Rent' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Monthly billing day').fill('32')
  await dialog.getByRole('button', { name: 'Save billing date' }).click()
  await expect(dialog).toBeVisible()
  expect(backend.writes.filter((write) => write.key === 'cortex-finances')).toHaveLength(0)
  await dialog.getByLabel('Monthly billing day').fill('31')
  await page.screenshot({ path: '.private/finance-billing/date-editor-320.png', animations: 'disabled' })
  await dialog.getByLabel('Monthly billing day').press('Enter')
  await expect.poll(() => (backend.stores['cortex-finances'] as FinanceData).items[1].billingDay).toBe(31)
  await page.getByRole('tab', { name: 'Feb', exact: true }).click()
  const rent = page.locator('tr').filter({ has: page.getByRole('button', { name: 'Set paid amount for Rent' }) })
  await expect(rent).toContainText('Feb 28')
  await page.reload()
  await expect(rent).toContainText('Oct 31')
  await page.getByRole('button', { name: /billing date for Rent/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Clear billing date' }).click()
  await expect.poll(() => (backend.stores['cortex-finances'] as FinanceData).items[1].billingDay).toBeUndefined()
  expect((backend.stores['cortex-finances'] as FinanceData).items[1].months).toEqual(Array(12).fill(100000))
  await expect(page.getByRole('button', { name: 'Set billing date for Music' })).toBeVisible()
})

for (const width of [320, 1440]) {
  test(`Budget identifies installments and reconciles charges without duplicate writes at ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-03T15:00:00Z'))
    await page.setViewportSize({ width, height: 900 })
    const backend = await mockStores(page, { 'cortex-finances': finance, 'cortex-credit-card': cardWithStatement() })
    await page.goto('/#/finance')
    await page.getByRole('tab', { name: 'Nov', exact: true }).click()
    await page.getByRole('button', { name: 'Budget', exact: true }).click()
    const budget = page.locator('#budget')
    const row = (name: string) => budget.locator('tr').filter({ has: page.getByText(name, { exact: true }) })
    await expect(row('Desk lamp')).toContainText('1/3')
    await expect(row('Desk lamp')).toContainText('Nov 24')
    await expect(row('Desk lamp')).toContainText('$40.000')
    await expect(row('Desk lamp').locator('td').first()).toContainText('$40.000')
    await expect(row('Interest')).toContainText('$1.000')
    await expect(row('Fees')).toContainText('$500')
    await expect(row('Additional statement amount')).toContainText('$8.500')
    await expect(row('Credit card Subtotal')).toContainText('$50.000')
    await expect(budget).toContainText('Paid toward this month')
    await expect(budget).toContainText('$10.000')
    await expect(budget).toContainText('Remaining')
    await page.getByRole('tab', { name: 'Dec', exact: true }).click()
    await expect(row('Desk lamp')).toContainText('2/3')
    await expect(row('Credit card Subtotal')).toContainText('$40.000')
    expect(backend.cardCommands).toHaveLength(0)
    expect(backend.writes.filter((write) => ['cortex-finances', 'cortex-credit-card'].includes(write.key))).toHaveLength(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await row('Desk lamp').scrollIntoViewIfNeeded()
    await expect(row('Desk lamp').getByText('Desk lamp', { exact: true })).toBeInViewport()
    await page.screenshot({ path: `.private/finance-billing/budget-${width}.png`, animations: 'disabled' })
  })
}
