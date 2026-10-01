import { test, expect, mockStores } from './fixtures'

const months = (october: number) => [0, 0, 0, 0, 0, 0, 0, 0, 0, october, 0, 0]

test('income rows record received versus expected without changing planned income', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T15:00:00Z'))
  const backend = await mockStores(page, {
    'cortex-finances': {
      year: 2026,
      items: [
        { id: 'mom', name: 'Mom', type: 'Income', months: months(1500000) },
        { id: 'salary', name: 'Job Construcredit', type: 'Income', months: months(2000000) },
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
  await page.setViewportSize({ width: 320, height: 844 })
  await page.reload()
  await expect(page.getByText('$700K/$1.5M')).toBeVisible()
  const momCell = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Set received amount for Mom' }) }).locator('td').first()
  const longNameCell = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Set received amount for Job Construcredit' }) }).locator('td').first()
  await expect(momCell.getByText('Received', { exact: true })).toBeVisible()
  await expect(momCell.getByText('$700K/$1.5M')).toBeVisible()
  await expect(page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Set paid amount for Rent' }) }).getByText('$200K/$200K')).toBeVisible()
  for (const cell of [momCell, longNameCell]) {
    const name = cell.getByRole('textbox', { name: /Item name for/ })
    const progress = cell.getByText(/\$700K\/\$1\.5M|—\/\$2\.0M/)
    const [nameBox, progressBox, cellBox] = await Promise.all([name.boundingBox(), progress.boundingBox(), cell.boundingBox()])
    expect(nameBox && progressBox && cellBox).toBeTruthy()
    expect(progressBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height - 1)
    expect(progressBox!.x + progressBox!.width).toBeLessThanOrEqual(cellBox!.x + cellBox!.width + 1)
  }

  await page.getByRole('button', { name: 'Set received amount for Mom' }).click()
  await page.getByRole('textbox', { name: 'Received amount for Mom' }).fill('')
  await page.getByRole('textbox', { name: 'Received amount for Mom' }).press('Tab')
  await expect.poll(() => (backend.stores['cortex-finances'] as {
    items: { id: string; receivedAmounts?: (number | null)[] }[]
  }).items.find((item) => item.id === 'mom')?.receivedAmounts?.[9]).toBeNull()
  await expect(page.getByText('$700K/$1.5M')).toHaveCount(0)
  await expect(momCell.getByText('—/$1.5M')).toBeVisible()
  await expect(page.getByText('Account Balance · Oct').locator('..').locator('..')).toContainText('$3.300.000')
})

test('adding planned income does not invent a zero receipt', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T15:00:00Z'))
  const backend = await mockStores(page, { 'cortex-finances': { year: 2026, items: [] } })
  await page.goto('/#/finance')
  await page.getByRole('button', { name: 'Toggle compact columns' }).click()
  await page.getByRole('button', { name: 'Income', exact: true }).last().click()

  const row = page.locator('tr').filter({ has: page.locator('input[value="New item"]') })
  await row.locator('td').nth(3).locator('input').fill('1500000')
  await page.getByText('Account Balance · Oct').click()

  await expect(page.getByText('Account Balance · Oct').locator('..').locator('..')).toContainText('$1.500.000')
  expect((backend.stores['cortex-finances'] as { items: { receivedAmounts?: (number | null)[] }[] })
    .items[0]?.receivedAmounts).toBeUndefined()
  await expect(page.getByRole('button', { name: 'Set received amount for New item' })).toBeVisible()
})
