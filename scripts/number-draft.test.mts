import test from 'node:test'
import assert from 'node:assert/strict'

const { parseNumberDraft, formatNumberDraft } = await import('../src/lib/number-draft.ts')

const grade = { min: 0, max: 5, blank: 'clear' as const }
const weight = { min: 0, max: 100 }

test('decimal drafts accept dot and comma and round to one place', () => {
  assert.deepEqual(parseNumberDraft('4.5', grade), { ok: true, value: 4.5 })
  assert.deepEqual(parseNumberDraft('4,5', grade), { ok: true, value: 4.5 })
  assert.deepEqual(parseNumberDraft(' 3.04 ', grade), { ok: true, value: 3 })
  assert.deepEqual(parseNumberDraft('0', grade), { ok: true, value: 0 })
  assert.deepEqual(parseNumberDraft('5', grade), { ok: true, value: 5 })
})

test('junk and out-of-range drafts are rejected', () => {
  for (const draft of ['4abc', 'abc', '-', '1e2', '5.1', '-0.5', '1.2.3', 'Infinity']) {
    assert.equal(parseNumberDraft(draft, grade).ok, false, draft)
  }
  assert.equal(parseNumberDraft('150', weight).ok, false)
  assert.deepEqual(parseNumberDraft('100', weight), { ok: true, value: 100 })
})

test('blank clears a grade but is rejected for required numbers', () => {
  assert.deepEqual(parseNumberDraft('', grade), { ok: true, value: undefined })
  assert.deepEqual(parseNumberDraft('  ', grade), { ok: true, value: undefined })
  assert.equal(parseNumberDraft('', weight).ok, false)
})

test('drafts format integers without decimals', () => {
  assert.equal(formatNumberDraft(3), '3')
  assert.equal(formatNumberDraft(4.5), '4.5')
  assert.equal(formatNumberDraft(undefined), '')
})


test('unbounded drafts remain finite and whole-money rules reject fractions', () => {
  assert.equal(parseNumberDraft('9'.repeat(400), { min: 0 }).ok, false)
  assert.deepEqual(parseNumberDraft('500000', { min: 0, integer: true }), { ok: true, value: 500000 })
  assert.equal(parseNumberDraft('500000.5', { min: 0, integer: true }).ok, false)
  const large = parseNumberDraft('9'.repeat(307), { min: 0 })
  assert.equal(large.ok && Number.isFinite(large.value), true)
})


test('whole-money drafts preserve thousands grouping without changing grade decimals', () => {
  const rule = { min: 0, integer: true }
  for (const value of ['646000', '646.000', '646,000']) assert.deepEqual(parseNumberDraft(value, rule), { ok: true, value: 646000 })
  for (const value of ['1.250.000', '1,250,000']) assert.deepEqual(parseNumberDraft(value, rule), { ok: true, value: 1250000 })
  for (const value of ['646.5', '646,5', '1.234,567']) assert.deepEqual(parseNumberDraft(value, rule), { ok: false })
  assert.deepEqual(parseNumberDraft('4,5', grade), { ok: true, value: 4.5 })
})
