import assert from 'node:assert/strict'
import test from 'node:test'

const months = (september: number, october: number) => [0, 0, 0, 0, 0, 0, 0, 0, september, october, 0, 0]

test('legacy paid flags read as fully paid and drive settled counts', async () => {
  const { financeMonth, isPaidFor, paidAmountFor, settlementFor } = await import('../src/features/finance/finance-model.ts')
  const internet = { id: 'internet', name: 'Internet', type: 'Expense' as const, months: months(0, 100000), paid: months(1, 1).map(Boolean) }
  assert.equal(paidAmountFor(internet, 9), 100000)
  assert.equal(isPaidFor(internet, 9), true)
  assert.equal(isPaidFor(internet, 8), false, 'an unplanned month is never settled')
  assert.deepEqual(settlementFor(internet, 9), { kind: 'paid', amount: 100000, expected: 100000, status: 'complete' })
  const month = financeMonth({ year: 2026, items: [internet] }, 9)
  assert.equal(month.paidCount, 1)
  assert.equal(month.pending, 0)
})

test('paid amounts record partial and complete payments without touching other months', async () => {
  const { financeMonth, settlementFor, withPaidAmount, withSettlement } = await import('../src/features/finance/finance-model.ts')
  const data = { year: 2026, items: [{ id: 'rent', name: 'Rent', type: 'Expense' as const, months: months(200000, 200000) }] }

  const partial = withSettlement(data, 'rent', 9, 50000)
  assert.deepEqual(partial.items[0].paidAmounts, months(0, 50000))
  assert.equal(partial.items[0].paid?.[9], false)
  assert.equal(settlementFor(partial.items[0], 9).status, 'partial')
  assert.equal(settlementFor(partial.items[0], 8).status, 'open')
  assert.equal(financeMonth(partial, 9).pending, 150000)
  assert.equal(data.items[0].paidAmounts, undefined)

  const complete = withPaidAmount(partial, 'rent', 9, 200000)
  assert.equal(complete.items[0].paid?.[9], true)
  assert.equal(settlementFor(complete.items[0], 9).status, 'complete')
  assert.equal(financeMonth(complete, 9).paidCount, 1)
  assert.throws(() => withPaidAmount(data, 'rent', 9, -1), RangeError)
  assert.throws(() => withPaidAmount(data, 'rent', 12, 1), RangeError)
})

test('income settlements keep unknown receipts distinct from an explicit zero', async () => {
  const { settlementFor, withSettlement } = await import('../src/features/finance/finance-model.ts')
  const data = { year: 2026, items: [{ id: 'mom', name: 'Mom', type: 'Income' as const, months: months(0, 1500000) }] }

  assert.deepEqual(settlementFor(data.items[0], 9), { kind: 'received', amount: null, expected: 1500000, status: 'open' })
  const zero = withSettlement(data, 'mom', 9, 0)
  assert.equal(zero.items[0].receivedAmounts?.[9], 0)
  assert.equal(settlementFor(zero.items[0], 9).amount, 0)
  const partial = withSettlement(zero, 'mom', 9, 700000)
  assert.equal(settlementFor(partial.items[0], 9).status, 'partial')
  assert.equal(partial.items[0].months[9], 1500000)
  const cleared = withSettlement(partial, 'mom', 9, null)
  assert.equal(cleared.items[0].receivedAmounts?.[9], null)
  assert.equal(cleared.items[0].paidAmounts, undefined, 'income never gains paid amounts')
  assert.equal(withSettlement(data, 'missing', 9, 1), data)
})
