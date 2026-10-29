import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAccountAmount } from '../src/features/finance/accounts/account-input.ts'

test('COP amounts preserve grouped thousands, signed balances, and unknown drafts', () => {
  assert.equal(parseAccountAmount('35.000', 'COP'), 35000)
  assert.equal(parseAccountAmount('1.500.000', 'COP'), 1500000)
  assert.equal(parseAccountAmount('35,000', 'COP'), 35000)
  assert.equal(parseAccountAmount('-35.000', 'COP'), -35000)
  assert.equal(parseAccountAmount('', 'COP'), undefined)
  assert.ok(Number.isNaN(parseAccountAmount('1.5', 'COP')))
  assert.ok(Number.isNaN(parseAccountAmount('oops', 'COP')))
})

test('foreign amounts keep two decimal places and accept either decimal separator', () => {
  assert.equal(parseAccountAmount('12.99', 'USD'), 12.99)
  assert.equal(parseAccountAmount('12,99', 'USD'), 12.99)
  assert.equal(parseAccountAmount('1.500,99', 'EUR'), 1500.99)
  assert.equal(parseAccountAmount('1,500.99', 'USD'), 1500.99)
  assert.ok(Number.isNaN(parseAccountAmount('12.9999', 'USD')))
})
