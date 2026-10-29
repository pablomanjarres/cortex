import fs from 'node:fs/promises'
import path from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const exec = promisify(execFile)
const source = fileURLToPath(new URL('..', import.meta.url))
const target = path.join(homedir(), 'Library', 'Application Support', 'Cortex', 'payment-reminders')
const label = 'com.pablo.cortex-payment-reminders'
const plistPath = path.join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
const logs = path.join(homedir(), 'Library', 'Logs', 'Cortex')
const files = ['scripts/payment-reminders.mts', 'scripts/lib/payment-reminder-runner.ts',
  'src/features/finance/accounts/account-reminders.ts', 'src/features/finance/accounts/account-model.ts']
const xml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const node = (await exec('/usr/bin/which', ['node'])).stdout.trim()
const uid = process.getuid?.()
if (process.platform !== 'darwin' || uid === undefined || !process.versions.amaro) throw new Error('Install with a macOS Node runtime that supports native TypeScript.')
const service = `gui/${uid}/${label}`
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(path.join(target, files[0]))}</string></array>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
<key>RunAtLoad</key><true/>
<key>StartCalendarInterval</key><dict><key>Minute</key><integer>0</integer></dict>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(path.join(logs, 'payment-reminders.out.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(logs, 'payment-reminders.err.log'))}</string>
</dict></plist>
`
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex')
const check = process.argv.slice(2).includes('--check')
if (process.argv.slice(2).some((arg) => arg !== '--check')) throw new Error('Usage: install-payment-reminders.mts [--check]')
if (check) {
  for (const file of files) if (digest(await fs.readFile(path.join(source, file))) !== digest(await fs.readFile(path.join(target, file)))) throw new Error(`Installed reminder source differs: ${file}`)
  if (await fs.readFile(plistPath, 'utf8') !== plist) throw new Error('The installed reminder schedule differs.')
  const result = await exec('/bin/launchctl', ['print', service])
  console.log(JSON.stringify({ label, sourceMatches: true, installed: true, state: result.stdout.match(/state = ([^\n]+)/)?.[1], lastExitCode: result.stdout.match(/last exit code = ([^\n]+)/)?.[1] ?? null }))
} else {
  const staging = `${target}.staging-${process.pid}`
  await fs.mkdir(staging, { recursive: true, mode: 0o700 })
  for (const file of files) {
    await fs.mkdir(path.dirname(path.join(staging, file)), { recursive: true, mode: 0o700 })
    await fs.copyFile(path.join(source, file), path.join(staging, file))
  }
  await fs.writeFile(path.join(staging, 'package.json'), '{"type":"module","private":true}\n', { mode: 0o600 })
  await fs.mkdir(logs, { recursive: true, mode: 0o700 })
  await fs.mkdir(path.dirname(plistPath), { recursive: true })
  await exec('/bin/launchctl', ['bootout', service]).catch(() => {})
  for (let attempt = 0; ; attempt++) {
    try { await exec('/bin/launchctl', ['print', service]) } catch { break }
    if (attempt >= 25) throw new Error('The previous reminder job has not stopped; installation paused before replacing its files.')
    await delay(200)
  }
  const previous = `${target}.previous`
  await fs.rm(previous, { recursive: true, force: true })
  await fs.rename(target, previous).catch((error) => { if (error.code !== 'ENOENT') throw error })
  try { await fs.rename(staging, target) } catch (error) { await fs.rename(previous, target).catch(() => {}); throw error }
  await fs.writeFile(plistPath, plist, { mode: 0o600 })
  await exec('/usr/bin/plutil', ['-lint', plistPath])
  for (let attempt = 0; ; attempt++) {
    try { await exec('/bin/launchctl', ['bootstrap', `gui/${uid}`, plistPath]); break }
    catch (error) { if (attempt >= 2) throw error; await delay(500) }
  }
  console.log(JSON.stringify({ label, installed: true, cadence: 'hourly', timeZone: 'America/Bogota', sourceFiles: files.length }))
}
