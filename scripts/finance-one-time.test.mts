import assert from 'node:assert/strict'
import test from 'node:test'

type FinanceModel = typeof import('../src/features/finance/finance-model.ts')
const loadModel = async (): Promise<FinanceModel> => import('../src/features/finance/finance-model.ts')

const months = (september: number, october = 0) => [0, 0, 0, 0, 0, 0, 0, 0, september, october, 0, 0]

test('paid and upcoming one-time expenses affect only their own month and category', async () => {
  const { financeMonth } = await loadModel()
  const data = {
    year: 2026,
    items: [
      { id: 'income', name: 'Salary', type: 'Income' as const, months: months(500000) },
      { id: 'food', name: 'Food', type: 'Expense' as const, category: 'Food', months: months(200000),
        paid: months(1).map(Boolean), paidAmounts: months(250000) },
    ],
    oneTimePayments: [
      { id: 'charger', name: 'Charger', amount: 120000, date: '2026-09-29', category: 'Apps', paid: true },
      { id: 'taxi', name: 'Taxi', amount: 50000, date: '2026-09-30', category: 'Transport', paid: false },
      { id: 'book', name: 'Book', amount: 30000, date: '2026-10-01', category: 'Education', paid: false },
      { id: 'next-year', name: 'Later', amount: 90000, date: '2027-09-01', category: 'Other', paid: true },
    ],
  }

  const september = financeMonth(data, 8)
  assert.equal(september.income, 500000)
  assert.equal(september.expenses, 370000)
  assert.equal(september.savings, 130000)
  assert.equal(september.balance, 130000)
  assert.equal(september.pending, 50000)
  assert.equal(september.paidCount, 2)
  assert.equal(september.totalPayable, 3)
  assert.deepEqual(september.oneTimePayments.map(p => p.id), ['charger', 'taxi'])
  assert.deepEqual(september.categoryBreakdown, [
    { name: 'Food', value: 200000 },
    { name: 'Apps', value: 120000 },
    { name: 'Transport', value: 50000 },
  ])

  const october = financeMonth(data, 9)
  assert.equal(october.expenses, 30000)
  assert.equal(october.balance, 0)
  assert.equal(october.pending, 30000)
  assert.deepEqual(october.oneTimePayments.map(p => p.id), ['book'])
})

test('older finance records without one-time payments keep their current totals', async () => {
  const { financeMonth } = await loadModel()
  const september = financeMonth({
    year: 2026,
    items: [
      { id: 'income', name: 'Salary', type: 'Income', months: months(500000) },
      { id: 'rent', name: 'Rent', type: 'Expense', category: 'Home', months: months(200000),
        paid: months(1).map(Boolean) },
    ],
  }, 8)

  assert.equal(september.expenses, 200000)
  assert.equal(september.balance, 300000)
  assert.equal(september.pending, 0)
  assert.deepEqual(september.oneTimePayments, [])
})
