import { test, expect, mockStores } from './fixtures'

const months = (october: number) => [0, 0, 0, 0, 0, 0, 0, 0, 0, october, 0, 0]

test('income rows record received versus expected without changing planned income', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T15:00:00Z'))
  const backend = await mockStores(page, {
    'cortex-finances': {
      year: 2026,
      items: [
        { id: 'mom', name: 'Mom', type: 'Income', months: months(1500000) },
        { id: 'salary', name: 'Salary', type: 'Income', months: months(2000000) },
        { id: 'rent', name: 'Rent', type: 'Expense', category: 'Home', months: months(200000), paid: months(1).map(Boolean) },
      ],
    },
  })

  await page.goto('/#/finance')
  await expect(page.getByText('Account Balance · Oct').locator('..').locator('..')).toContainText('$3.300.000')
  await page.getByRole('button', { name: 'Set received amount for Mom' }).click()
  await page.getByRole('textbox', { name: 'Received amount for Mom' }).press('Tab')
  expect((backend.stores['cortex-finances'] as { items: { id: string; receivedAmounts?: (number | null)[] }[] })
    .items.find((item) => item.id === 'mom')?.receivedAmounts).toBeUndefined()
  await expect(page.getByText('Account Balance · Oct').locator('..').locator('..')).toContainText('$3.300.000')
  await page.getByRole('button', { name: 'Set received amount for Mom' }).click()
  await page.getByRole('textbox', { name: 'Received amount for Mom' }).fill('700000')
  await page.getByRole('textbox', { name: 'Received amount for Mom' }).press('Tab')

  await expect.poll(() => (backend.stores['cortex-finances'] as {
    items: { id: string; receivedAmounts?: (number | null)[] }[]
  }).items.find((item) => item.id === 'mom')?.receivedAmounts?.[9]).toBe(700000)
  await expect(page.getByText('$700K/$1.5M')).toBeVisible()
  await expect(page.getByText('Account Balance · Oct').locator('..').locator('..')).toContainText('$2.500.000')
  await expect(page.getByText('$3.5M', { exact: true })).toBeVisible()
  expect((backend.stores['cortex-finances'] as { items: { id: string; months: number[] }[] })
    .items.find((item) => item.id === 'mom')?.months[9]).toBe(1500000)

  await page.getByRole('button', { name: 'Income', exact: true }).first().click()
  await expect(page.getByText('$700K/$1.5M')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Set received amount for Mom' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Hidden' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByText('$700K/$1.5M')).toBeVisible()
})
