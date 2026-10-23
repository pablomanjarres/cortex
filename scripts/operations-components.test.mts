import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRunLog, parseScheduledTasks, runStatusOf, timeAgo } from '../src/features/automations/automation-runs.ts'
import {
  ageRuleOf, deadlineTypeOf, deadlineTypePatch, parseAmountUsd, requires18PlusFor,
  type Opportunity,
} from '../src/features/opportunities/opportunity-model.ts'

test('automation run status has one owner with a safe fallback', () => {
  assert.equal(runStatusOf({ status: 'error' }).label, 'Error')
  assert.equal(runStatusOf({ status: 'pending-approval' }).chip, 'warning')
  assert.equal(runStatusOf({ status: 'unknown' as never }).label, 'Success')
})

test('automation run times read relative to now', () => {
  const now = Date.parse('2026-10-23T12:00:00Z')
  assert.equal(timeAgo('2026-10-23T11:59:30Z', now), 'just now')
  assert.equal(timeAgo('2026-10-23T11:15:00Z', now), '45m ago')
  assert.equal(timeAgo('2026-10-23T09:00:00Z', now), '3h ago')
  assert.equal(timeAgo('2026-10-20T12:00:00Z', now), '3d ago')
})

test('stored run logs parse into displayable runs', () => {
  const runs = parseRunLog({ runs: [
    { id: 'a', taskName: 'backup', timestamp: '2026-10-23T11:00:00Z', status: 'error', summary: 'failed', fullOutput: 'log', approved: false },
    { id: 'b', taskName: 'backup', timestamp: '2026-10-23T10:00:00Z', status: 'renamed-status' },
    { id: 3, taskName: 'broken' },
    null,
  ] })
  assert.deepEqual(runs, [
    { id: 'a', taskName: 'backup', timestamp: '2026-10-23T11:00:00Z', status: 'error', summary: 'failed', fullOutput: 'log', approved: false },
    { id: 'b', taskName: 'backup', timestamp: '2026-10-23T10:00:00Z', status: 'success', summary: '', fullOutput: '' },
  ])
  assert.deepEqual(parseRunLog(null), [])
  assert.deepEqual(parseRunLog({ runs: 'nope' }), [])
})

test('scheduled tasks parse names and optional descriptions', () => {
  assert.deepEqual(parseScheduledTasks([{ name: 'daily', description: 'Runs daily' }, { name: 'bare' }, { description: 'nameless' }]), [
    { name: 'daily', description: 'Runs daily' },
    { name: 'bare', description: '' },
  ])
  assert.deepEqual(parseScheduledTasks({}), [])
})

test('deadline type writes keep the legacy rolling flag in sync', () => {
  assert.deepEqual(deadlineTypePatch('always-open'), { deadlineType: 'always-open', rolling: true })
  assert.deepEqual(deadlineTypePatch('rolling'), { deadlineType: 'rolling', rolling: true })
  assert.deepEqual(deadlineTypePatch('fixed'), { deadlineType: 'fixed', rolling: false })
  const legacy = { rolling: true, deadline: null } as unknown as Opportunity
  assert.equal(deadlineTypeOf(legacy), 'rolling')
})

test('amount and age rule edits normalize to stored values', () => {
  assert.equal(parseAmountUsd(''), null)
  assert.equal(parseAmountUsd('abc'), null)
  assert.equal(parseAmountUsd('-5'), 0)
  assert.equal(parseAmountUsd('1500.6'), 1501)
  for (const value of [true, false, null]) {
    const rule = ageRuleOf({ requires18Plus: value } as Opportunity)
    assert.equal(requires18PlusFor(rule), value)
  }
})
