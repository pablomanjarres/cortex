import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

test('the unattended CLI proves dry run, actual sender receipt, dedupe, lock, and failure reporting', { skip: process.platform !== 'darwin' }, async () => {
  const exec = promisify(execFile)
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cortex-reminder-test-'))
  const sender = path.join(root, 'notify.sh'), deliveries = path.join(root, 'pushes.txt'), state = path.join(root, 'state')
  const config = { enabled: true, daysBefore: 3, hour: 0, timeZone: 'America/Bogota', excludedAccountIds: [] }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const accounts = { version: 1, accounts: [{ id: 'example', name: 'Example card', institution: 'Test bank', kind: 'credit', currency: 'COP', archived: false, dueDay: Number(today.slice(-2)), fees: [] }] }
  const reports: { status: string }[] = []
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk
      reports.push(JSON.parse(body)); res.end('{"ok":true}'); return
    }
    res.end(JSON.stringify(req.url?.includes('cortex-card-payment-reminders') ? config : accounts))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const env = { ...process.env, CORTEX_API: `http://127.0.0.1:${port}`, CORTEX_REMINDER_STATE_DIR: state, CORTEX_NOTIFY_SCRIPT: sender, CORTEX_TEST_DELIVERIES: deliveries }
  const run = (...args: string[]) => exec(process.execPath, ['scripts/payment-reminders.mts', ...args], { env, timeout: 15_000 })
  try {
    await fs.writeFile(sender, '#!/bin/sh\nprintf "push\\n" >> "$CORTEX_TEST_DELIVERIES"\nprintf "Sent: [action-required] Credit card payment\\n"\n', { mode: 0o700 })
    assert.equal(JSON.parse((await run('--dry-run')).stdout).due.length, 1)
    await assert.rejects(fs.stat(path.join(state, 'deliveries.json')), /ENOENT/)
    assert.equal(reports.length, 0)
    assert.equal(JSON.parse((await run()).stdout).pushed, 1)
    assert.equal(JSON.parse((await run()).stdout).pushed, 0)
    assert.equal(await fs.readFile(deliveries, 'utf8'), 'push\n')
    assert.equal(reports.at(-1)?.status, 'success')

    await exec('/usr/bin/shlock', ['-f', path.join(state, 'run.lock'), '-p', String(process.pid)])
    assert.equal(JSON.parse((await run()).stdout).skipped, 'already-running')
    await fs.rm(path.join(state, 'run.lock'))

    await fs.writeFile(path.join(state, 'deliveries.json'), '{"version":1,"deliveries":{}}')
    await fs.writeFile(sender, '#!/bin/sh\nprintf "push\\n" >> "$CORTEX_TEST_DELIVERIES"\nexit 22\n', { mode: 0o700 })
    await assert.rejects(run(), /held for review/)
    assert.equal(reports.at(-1)?.status, 'error')
    const held = JSON.parse(await fs.readFile(path.join(state, 'deliveries.json'), 'utf8'))
    assert.equal(Object.values(held.deliveries).length, 1)
    assert.equal((Object.values(held.deliveries)[0] as { status: string }).status, 'uncertain')
    await assert.rejects(run(), /needs verification/)
    assert.equal(await fs.readFile(deliveries, 'utf8'), 'push\npush\n')
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await fs.rm(root, { recursive: true, force: true })
  }
})
