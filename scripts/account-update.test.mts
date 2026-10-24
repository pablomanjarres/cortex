import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAccountChange } from '../src/features/finance/accounts/account-update.ts'
import type { AccountsData, FinancialAccount } from '../src/features/finance/accounts/account-model.ts'

test('a conflicting archive preserves the bank and lets the next queued update succeed', () => {
  const bank: FinancialAccount = { id: 'bank', name: 'Savings', institution: 'Bank', kind: 'bank', currency: 'COP', fees: [], archived: false }
  const state: AccountsData = { version: 1, accounts: [bank, { ...bank, id: 'debit', kind: 'debit', linkedAccountId: 'bank' }] }
  const result = applyAccountChange(state, { type: 'archive', id: 'bank', archived: true })
  assert.equal(result.data, state)
  assert.match(result.error!, /linked|debit/i)
  const next = applyAccountChange(result.data, { type: 'save', account: { ...bank, name: 'Updated savings' } })
  assert.equal(next.error, null)
  assert.equal(next.data.accounts[0].name, 'Updated savings')
  assert.equal(next.data.accounts.length, 2)
})
