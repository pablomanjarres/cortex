import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

const now = Date.parse('2026-09-27T12:00:00Z')

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
