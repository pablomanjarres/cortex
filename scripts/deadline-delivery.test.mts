import assert from 'node:assert/strict'
import test from 'node:test'
import { runDeadlineCheck, DEFAULT_DEADLINE_ALERTS } from '../electron/deadline-alerts.ts'

function fixture(status: 'Sent' | 'Failed' | 'Muted') {
  const writes: unknown[] = []
  let attempts = 0
  const deps = {
    async readDataKeyParsed<T>(key: string, fallback: T): Promise<T> {
      if (key === 'cortex-student-assignments') return [{ id: 'exam', name: 'Exam', deadline: '2026-10-10' }] as T
      if (key === 'cortex-deadline-alerts') return { ...DEFAULT_DEADLINE_ALERTS, sent: {} } as T
      return fallback
    },
    async writeDataKey(_key: string, data: unknown) { writes.push(data); return { ok: true } },
    async push() { attempts++; return { status } },
  }
  return { deps, writes, attempts: () => attempts }
}

test('failed academic reminder stays retryable instead of consuming its threshold', async () => {
  const f = fixture('Failed')
  const result = await runDeadlineCheck(f.deps, new Date(2026, 9, 3, 12))
  assert.equal(f.attempts(), 1)
  assert.equal(result.pushed, 0)
  assert.equal(f.writes.length, 0)
})

test('muted academic reminder does not claim provider acceptance', async () => {
  const f = fixture('Muted')
  const result = await runDeadlineCheck(f.deps, new Date(2026, 9, 3, 12))
  assert.equal(result.pushed, 0)
  assert.equal(f.writes.length, 0)
})

test('accepted academic reminder consumes crossed thresholds after delivery', async () => {
  const f = fixture('Sent')
  const result = await runDeadlineCheck(f.deps, new Date(2026, 9, 9, 12))
  assert.equal(result.pushed, 1)
  const saved = f.writes[0] as { sent: Record<string, string> }
  assert.deepEqual(Object.keys(saved.sent).sort(), ['exam:1', 'exam:3', 'exam:7'])
})
