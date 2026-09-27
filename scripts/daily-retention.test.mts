import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { shouldDeleteDailyFile } from '../electron/daily-retention.ts'

const now = Date.parse('2026-09-27T12:00:00Z')
const retentionMs = 90 * 24 * 60 * 60 * 1000

test('focus-session files never expire by age', () => {
  for (const file of [
    'cortex-daily-sessions-2020-01-01.json',
    'cortex-daily-sessions-2026-06-29.json',
    'cortex-daily-sessions-2026-09-27.json',
    'cortex-daily-sessions-2027-01-01.json',
  ]) {
    assert.equal(shouldDeleteDailyFile(file, now, retentionMs), false, file)
  }
})

test('other daily files retain the strict 90-day age boundary', () => {
  const midnight = Date.parse('2026-09-27T00:00:00Z')
  assert.equal(shouldDeleteDailyFile('cortex-daily-score-2026-06-29.json', midnight, retentionMs), false)
  assert.equal(shouldDeleteDailyFile('cortex-daily-score-2026-06-29.json', midnight + 1, retentionMs), true)
  assert.equal(shouldDeleteDailyFile('cortex-daily-habits-2026-06-28.json', midnight, retentionMs), true)
  assert.equal(shouldDeleteDailyFile('cortex-daily-score-2026-06-30.json', now, retentionMs), false)
  assert.equal(shouldDeleteDailyFile('cortex-daily-score-2026-12-01.json', now, retentionMs), false)
})

test('cleanup ignores unrelated files, malformed date suffixes, and non-JSON files', () => {
  for (const file of [
    'cortex-score-2020-01-01.json',
    'cortex-daily-score-2020-01-01.json.bak',
    'cortex-daily-score-2020-01-01.tmp',
    'cortex-daily-score-invalid.json',
    'cortex-daily-score-2026-13-01.json',
    'cortex-daily-sessions-invalid.json',
  ]) {
    assert.equal(shouldDeleteDailyFile(file, now, retentionMs), false, file)
  }
})

test('daily cleanup preserves old focus-session records while removing old daily caches', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-retention-'))
  const sessionFile = 'cortex-daily-sessions-2026-06-29.json'
  const cacheFile = 'cortex-daily-score-2026-06-29.json'
  const sessionContents = '[{"id":"historical-focus","minutes":90}]'
  try {
    fs.writeFileSync(path.join(dataDir, sessionFile), sessionContents)
    fs.writeFileSync(path.join(dataDir, cacheFile), '{}')
    const source = fs.readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8')
    const cleanup = source.match(/^function cleanupOldDailyFiles\(\) \{[\s\S]*?^\}/m)?.[0]
    assert.ok(cleanup, 'production cleanup function is available')
    vm.runInNewContext(`${cleanup}\ncleanupOldDailyFiles()`, {
      fs,
      path,
      dataDir,
      DAILY_FILE_RETENTION_DAYS: 90,
      shouldDeleteDailyFile,
      Date: class extends Date { static now() { return now } },
      console,
    })
    assert.equal(fs.existsSync(path.join(dataDir, sessionFile)), true, 'old focus sessions survive cleanup')
    assert.equal(fs.readFileSync(path.join(dataDir, sessionFile), 'utf8'), sessionContents)
    assert.equal(fs.existsSync(path.join(dataDir, cacheFile)), false, 'old daily cache is still removed')
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})
