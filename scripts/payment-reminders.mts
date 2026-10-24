import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNTS_KEY, MAX_ACCOUNTS, parseAccountDate, type FinancialAccount } from '../src/features/finance/accounts/account-model.ts'
import { PAYMENT_REMINDERS_KEY, type PaymentReminder } from '../src/features/finance/accounts/account-reminders.ts'
import { MAX_REMINDER_HISTORY, runPaymentReminders, type ReminderDeliveryState } from './lib/payment-reminder-runner.ts'

const exec = promisify(execFile)
const base = process.env.CORTEX_API || 'http://127.0.0.1:3456'
const runtime = process.env.CORTEX_REMINDER_STATE_DIR || path.join(homedir(), 'Library', 'Application Support', 'Cortex', 'payment-reminder-state')
const notify = process.env.CORTEX_NOTIFY_SCRIPT || path.join(homedir(), 'Projects', 'pushover', 'bin', 'notify.sh')
const stateFile = path.join(runtime, 'deliveries.json')
const lockPath = path.join(runtime, 'run.lock')
const failureFile = path.join(runtime, 'failure.json')
const MAX_STATE_BYTES = 2 * 1024 * 1024

async function request(route: string, body?: unknown) {
  const response = await fetch(`${base}${route}`, {
    signal: AbortSignal.timeout(5000),
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error(`Cortex request failed (${response.status}).`)
  const text = await response.text()
  if (text.length > MAX_STATE_BYTES) throw new Error('Cortex response exceeds the reminder limit.')
  return text ? JSON.parse(text) : null
}

async function readAccounts(): Promise<FinancialAccount[]> {
  const data = await request(`/api/data?key=${ACCOUNTS_KEY}`)
  if (data === null) return []
  if (data.version !== 1 || !Array.isArray(data.accounts) || data.accounts.length > MAX_ACCOUNTS) throw new Error('Account data is not valid for reminders.')
  return data.accounts
}

async function readState(): Promise<ReminderDeliveryState> {
  let text: string
  try {
    if ((await fs.stat(stateFile)).size > MAX_STATE_BYTES) throw new Error('Reminder state exceeds the supported limit.')
    text = await fs.readFile(stateFile, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, deliveries: {} }
    throw error
  }
  const data = JSON.parse(text)
  if (data?.version !== 1 || !data.deliveries || typeof data.deliveries !== 'object' || Array.isArray(data.deliveries)) throw new Error('Reminder state needs recovery; no notifications were retried.')
  if (Object.keys(data.deliveries).length > MAX_REMINDER_HISTORY) throw new Error('Reminder history exceeds its supported limit.')
  for (const [key, value] of Object.entries(data.deliveries)) {
    const delivery = value as { status?: unknown; dueDate?: unknown; updatedAt?: unknown; reviewReportedAt?: unknown }
    if (key.length > 1024 || !delivery || !['sending', 'sent', 'uncertain'].includes(delivery.status as string)
      || !parseAccountDate(delivery.dueDate) || typeof delivery.updatedAt !== 'string' || !Number.isFinite(Date.parse(delivery.updatedAt))) {
      throw new Error('Reminder state needs recovery; no notifications were retried.')
    }
    if (delivery.reviewReportedAt !== undefined && (typeof delivery.reviewReportedAt !== 'string' || !Number.isFinite(Date.parse(delivery.reviewReportedAt)))) throw new Error('Reminder review receipt is not valid.')
  }
  return data
}

async function writeState(state: ReminderDeliveryState) {
  const temporary = `${stateFile}.${process.pid}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 })
  await fs.rename(temporary, stateFile)
}

async function send(reminder: PaymentReminder) {
  const date = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${reminder.dueDate}T12:00:00Z`))
  const when = reminder.daysLeft === 0 ? 'today' : reminder.daysLeft === 1 ? 'tomorrow' : `in ${reminder.daysLeft} days`
  const result = await exec(notify, ['-c', 'action-required', '-t', 'Credit card payment',
    '-m', `${reminder.accountName} payment is due ${when}, ${date}. Check the statement and pay before the deadline.`,
    '-p', '0', '-s', 'subtle', '--id', `cortex-payment-${reminder.key}`], { timeout: 40_000, maxBuffer: 16_384 })
  if (!/^Sent: \[action-required\]/m.test(result.stdout)) throw new Error('The notification sender did not confirm Pushcut acceptance.')
}

async function acquireLock(): Promise<boolean> {
  await fs.mkdir(runtime, { recursive: true, mode: 0o700 })
  try { await exec('/usr/bin/shlock', ['-f', lockPath, '-p', String(process.pid)], { timeout: 5000 }); return true }
  catch (error) { if ((error as { code?: unknown }).code === 1) return false; throw error }
}

export async function main(args: string[]) {
  if (args.some((arg) => arg !== '--dry-run')) throw new Error('Usage: payment-reminders.mts [--dry-run]')
  const dryRun = args.includes('--dry-run')
  const logs = path.join(homedir(), 'Library', 'Logs', 'Cortex')
  if (!dryRun) for (const name of ['payment-reminders.out.log', 'payment-reminders.err.log']) {
    const file = path.join(logs, name)
    const stat = await fs.stat(file).catch(() => null)
    if (stat && stat.size > 1024 * 1024) await fs.writeFile(file, '')
  }
  if (!await acquireLock()) { console.log(JSON.stringify({ skipped: 'already-running' })); return }
  try {
    const result = await runPaymentReminders({ now: () => new Date(), readAccounts,
      readConfig: () => request(`/api/data?key=${PAYMENT_REMINDERS_KEY}`), readState, writeState, send,
      reportHeld: async (count) => { await request('/api/automation/run', { taskName: 'Credit card payment reminders', status: 'error',
        summary: `${count} Pushcut delivery could not be confirmed. Held for review; it will not be automatically resent.` }) },
    }, dryRun)
    console.log(JSON.stringify(result))
    if (!dryRun && result.pushed > 0) await request('/api/automation/run', { taskName: 'Credit card payment reminders', status: 'success',
      summary: `${result.pushed} reminders sent; ${result.upcoming.length} confirmed payment schedules checked; ${result.held} held for review.` })
    if (!dryRun) await fs.rm(failureFile, { force: true })
    if (result.newlyHeld) { console.error('Pushcut delivery is held for review; no automatic retry will be made.'); process.exitCode = 1 }
  } catch (error) {
    if (!dryRun) {
      const summary = error instanceof Error ? error.message : 'Payment reminder check failed.'
      const previous = await fs.readFile(failureFile, 'utf8').catch(() => '')
      if (previous !== summary) try {
        await request('/api/automation/run', { taskName: 'Credit card payment reminders', status: 'error', summary })
        await fs.writeFile(failureFile, summary, { mode: 0o600 })
      } catch {
        try {
          await exec(notify, ['-c', 'service-issue', '-t', 'Cortex payment reminders need attention', '-m',
            'The payment reminder check could not reach Cortex or save its result. Open Cortex and check the reminder job.', '--id', 'cortex-payment-reminder-health'], { timeout: 40_000, maxBuffer: 16_384 })
          await fs.writeFile(failureFile, summary, { mode: 0o600 })
        } catch { /* The required LaunchAgent's nonzero exit is also monitored. */ }
      }
    }
    throw error
  } finally {
    await fs.rm(lockPath, { force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error instanceof Error ? error.message : 'Payment reminder check failed.'); process.exitCode = 1 })
}
