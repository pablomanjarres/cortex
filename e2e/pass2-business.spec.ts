import { test, expect, mockStores } from './fixtures'

const october = (amount: number) => [0, 0, 0, 0, 0, 0, 0, 0, 0, amount, 0, 0]

const finances = {
  year: 2026,
  items: [
    { id: 'pay', name: 'Pay', type: 'Income', months: october(1000000) },
    { id: 'rent', name: 'Rent', type: 'Expense', category: 'Home', months: october(300000) },
  ],
  oneTimePayments: [{ id: 'fix', name: 'Repair', amount: 50000, date: '2026-10-04', category: 'Home', paid: false }],
}

for (const hidden of [false, true]) {
  test(`budget totals follow the compact columns${hidden ? ' and conceal income' : ''}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-01T15:00:00Z'))
    await mockStores(page, { 'cortex-finances': finances, 'cortex-finance-hide-income': hidden })
    await page.goto('/#/finance')
    const table = page.getByRole('table')
    const row = (label: string) => table.getByRole('row').filter({ has: page.getByRole('cell', { name: label, exact: true }) })
    await expect(table.getByRole('columnheader')).toHaveCount(17)

    await page.getByRole('button', { name: 'Toggle compact columns' }).click()
    await expect(table.getByRole('columnheader')).toHaveCount(6)
    await expect(table.getByRole('columnheader', { name: 'Oct', exact: true })).toBeVisible()
    const income = hidden ? '•••' : '$1.000.000'
    await expect(row('Income Subtotal').getByRole('cell')).toHaveText(['Income Subtotal', '', '', income, income, ''])
    await expect(row('Expense Subtotal').getByRole('cell')).toHaveText(['Expense Subtotal', '', '', '$300.000', '$300.000', ''])
    await expect(row('One-time Subtotal').getByRole('cell')).toHaveText(['One-time Subtotal', '', '', '$50.000', '$50.000', ''])
    const net = hidden ? '•••' : '$650K'
    await expect(row('Net').getByRole('cell')).toHaveText(['Net', '', '', net, net, ''])
  })
}

test('a reach-out reminder opens its contact and resets only that contact', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T15:00:00Z'))
  const backend = await mockStores(page, {
    'cortex-contacts': [
      { id: 'due', name: 'Due friend', title: 'Mentor', lastContact: '2026-09-01', interval: 14 },
      { id: 'fine', name: 'Recent friend', title: '', lastContact: '2026-10-20', interval: 14 },
    ],
  })
  await page.goto('/#/social')
  const reminder = page.getByRole('button', { name: /Due friend.*overdue/ })
  await expect(page.getByRole('button', { name: /Recent friend.*overdue/ })).toHaveCount(0)
  await expect(reminder).toHaveAttribute('aria-pressed', 'false')
  await reminder.focus()
  await page.keyboard.press('Enter')
  await expect(reminder).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Details for Due friend' })).toHaveAttribute('aria-expanded', 'true')

  await page.getByRole('button', { name: 'Reset last contact for Due friend' }).click()
  await expect.poll(() => (backend.stores['cortex-contacts'] as { id: string; lastContact: string }[]).map((c) => [c.id, c.lastContact]))
    .toEqual([['due', ''], ['fine', '2026-10-20']])
  await expect(reminder).toHaveCount(0)
})

test('a hunt order sends from the keyboard and pauses without leaving the list', async ({ page }) => {
  const backend = await mockStores(page, { 'cortex-opportunities': { items: [], lastRun: null } })
  await page.goto('/#/opportunities')
  const composer = page.getByPlaceholder(/Find me 20 remote software internships/)
  const send = page.getByRole('button', { name: 'Send', exact: true })
  await expect(send).toBeDisabled()
  await composer.fill('  Grants in Colombia  ')
  await composer.press('ControlOrMeta+Enter')
  await expect(composer).toHaveValue('')
  const objectives = () => (backend.stores['cortex-opportunities'] as { objectives?: { text: string; active: boolean }[] }).objectives ?? []
  await expect.poll(objectives).toMatchObject([{ text: 'Grants in Colombia', active: true }])

  await page.getByRole('button', { name: 'Active', exact: true }).click()
  await expect.poll(() => objectives()[0]?.active).toBe(false)
  await expect(page.getByRole('button', { name: 'Paused', exact: true })).toBeVisible()
})
