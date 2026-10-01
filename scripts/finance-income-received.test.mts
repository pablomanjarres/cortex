import assert from 'node:assert/strict'
import test from 'node:test'

const months = (september: number, october: number) => [0, 0, 0, 0, 0, 0, 0, 0, september, october, 0, 0]

test('recorded income changes cash balance while planned income and other months stay intact', async () => {
  const { financeMonth, withReceivedAmount } = await import('../src/features/finance/finance-model.ts')
  const data = {
    year: 2026,
    items: [
      { id: 'mom', name: 'Mom', type: 'Income' as const, months: months(600000, 1500000) },
      { id: 'salary', name: 'Salary', type: 'Income' as const, months: months(0, 2000000) },
      { id: 'rent', name: 'Rent', type: 'Expense' as const, months: months(0, 200000), paid: months(0, 1).map(Boolean) },
    ],
  }

  assert.equal(financeMonth(data, 9).receivedIncome, 0)
  assert.equal(financeMonth(data, 9).balance, 3300000)
  const updated = withReceivedAmount(data, 'mom', 9, 700000)
  assert.equal(updated.items[0].receivedAmounts?.[9], 700000)
  assert.equal(updated.items[0].receivedAmounts?.[8], null)
  assert.equal(data.items[0].receivedAmounts, undefined)
  assert.equal(updated.items[1], data.items[1])
  assert.equal(financeMonth(updated, 9).income, 3500000)
  assert.equal(financeMonth(updated, 9).receivedIncome, 700000)
  assert.equal(financeMonth(updated, 9).balance, 500000)
  assert.equal(financeMonth(updated, 8).balance, 600000)
})

test('zero is a recorded receipt and editing another month keeps the first amount', async () => {
  const { financeMonth, withReceivedAmount } = await import('../src/features/finance/finance-model.ts')
  const data = { year: 2026, items: [
    { id: 'mom', name: 'Mom', type: 'Income' as const, months: months(600000, 1500000) },
  ] }

  const october = withReceivedAmount(data, 'mom', 9, 700000)
  const september = withReceivedAmount(october, 'mom', 8, 0)
  assert.equal(september.items[0].receivedAmounts?.[9], 700000)
  assert.equal(september.items[0].receivedAmounts?.[8], 0)
  assert.equal(financeMonth(september, 8).income, 600000)
  assert.equal(financeMonth(september, 8).receivedIncome, 0)
  assert.equal(financeMonth(september, 8).balance, 0)
})

test('clearing a recorded receipt returns that month to untracked', async () => {
  const { financeMonth, withReceivedAmount } = await import('../src/features/finance/finance-model.ts')
  const data = { year: 2026, items: [
    { id: 'mom', name: 'Mom', type: 'Income' as const, months: months(0, 1500000) },
  ] }

  const recorded = withReceivedAmount(data, 'mom', 9, 700000)
  const cleared = withReceivedAmount(recorded, 'mom', 9, null)
  assert.equal(cleared.items[0].receivedAmounts?.[9], null)
  assert.equal(financeMonth(cleared, 9).receivedIncome, 0)
  assert.equal(financeMonth(cleared, 9).balance, 1500000)
  assert.equal(recorded.items[0].receivedAmounts?.[9], 700000)
})
