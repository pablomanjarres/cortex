import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { secureWebOrigin } from './web-origin.js'

export const GYM_REST_RECEIPTS_KEY = 'cortex-gym-rest-alerts'
const MAX_ATTEMPTS = 3
const MAX_RECEIPTS = 128

type NotifyRunner = (file: string, args: string[]) => Promise<string>

export function gymRestUrl(raw: unknown): string | undefined {
  const origin = secureWebOrigin(raw)
  return origin ? `${origin}/#/gym` : undefined
}

function runNotify(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 45_000, maxBuffer: 64 * 1024, encoding: 'utf8' }, (error, stdout) => {
      if (error) reject(new Error(`Notification command failed (${error.killed ? 'timeout' : error.code ?? 'unknown exit'})`))
      else resolve(stdout)
    })
  })
}

export async function sendGymRestAlert(script: string, id: string, url?: string, run: NotifyRunner = runNotify): Promise<'sent' | 'muted'> {
  const args = ['-c', 'gym-rest', '-t', 'Rest finished', '-m', 'Time for your next set.', '-s', 'cosmic', '--id', id]
  if (url) args.push('--url', url, '--url-title', 'Open workout')
  const output = await run(script, args)
  if (/^Muted:/m.test(output)) return 'muted'
  if (/^Sent:/m.test(output)) return 'sent'
  throw new Error('Notification command did not acknowledge delivery')
}

export interface GymRestReceipt {
  attempts: number
  updatedAt: number
  sentAt?: number
}

export interface GymRestAlertDeps {
  now(): number
  schedule(fire: () => Promise<void>, delayMs: number): () => void
  readActive(): Promise<unknown>
  readReceipts(): Promise<Record<string, GymRestReceipt>>
  writeReceipts(receipts: Record<string, GymRestReceipt>): Promise<void>
  send(id: string): Promise<'sent' | 'muted'>
  log(message: string): void
}

function restDeadline(raw: unknown): { id: string; end: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const state = raw as { startedAt?: unknown; isResting?: unknown; restTimerEnd?: unknown }
  if (state.isResting !== true || typeof state.startedAt !== 'string' || !Number.isFinite(Date.parse(state.startedAt)) ||
    typeof state.restTimerEnd !== 'number' || !Number.isFinite(state.restTimerEnd) || state.restTimerEnd <= 0) return null
  const id = `cortex-gym-rest-${createHash('sha256').update(`${state.startedAt}:${state.restTimerEnd}`).digest('hex').slice(0, 24)}`
  return { id, end: state.restTimerEnd }
}

function boundedReceipts(raw: Record<string, GymRestReceipt>): Record<string, GymRestReceipt> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw)
    .filter(([, entry]) => entry && Number.isFinite(entry.attempts) && Number.isFinite(entry.updatedAt))
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RECEIPTS))
}

export class GymRestAlerts {
  private pending: ReturnType<typeof restDeadline> = null
  private cancel: (() => void) | null = null
  private readonly attempts = new Map<string, number>()
  private readonly delivered = new Set<string>()
  private readonly receiptRetries = new Map<string, () => void>()
  private deliveryQueue: Promise<void> = Promise.resolve()
  private stopped = false

  constructor(private readonly deps: GymRestAlertDeps) {}

  async restore(): Promise<void> {
    this.update(await this.deps.readActive())
  }

  update(active: unknown): void {
    if (this.stopped) return
    const next = restDeadline(active)
    if (next?.id === this.pending?.id) return
    this.cancel?.()
    this.cancel = null
    this.pending = next
    if (next) this.schedule(next, Math.max(0, next.end - this.deps.now()))
  }

  private schedule(rest: NonNullable<ReturnType<typeof restDeadline>>, delay: number): void {
    this.cancel = this.deps.schedule(() => this.enqueue(() => this.deliver(rest)), Math.min(delay, 2_147_483_647))
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const delivery = this.deliveryQueue.then(work)
    this.deliveryQueue = delivery.catch(() => undefined)
    return delivery
  }

  private isCurrent(id: string): boolean {
    return !this.stopped && this.pending?.id === id
  }

  private async deliver(rest: NonNullable<ReturnType<typeof restDeadline>>): Promise<void> {
    if (!this.isCurrent(rest.id) || this.delivered.has(rest.id)) return
    this.cancel = null
    const localAttempt = (this.attempts.get(rest.id) ?? 0) + 1
    this.attempts.set(rest.id, localAttempt)
    if (this.attempts.size > MAX_RECEIPTS) this.attempts.delete(this.attempts.keys().next().value!)
    try {
      const active = await this.deps.readActive()
      if (!this.isCurrent(rest.id)) return
      if (restDeadline(active)?.id !== rest.id) { this.update(active); return }
      if (rest.end > this.deps.now()) { this.schedule(rest, rest.end - this.deps.now()); return }
      const receipts = boundedReceipts(await this.deps.readReceipts())
      if (!this.isCurrent(rest.id)) return
      const receipt = receipts[rest.id]
      if (Number.isFinite(receipt?.sentAt) || (receipt?.attempts ?? 0) >= MAX_ATTEMPTS) return
      const attempt = Math.max(localAttempt, (receipt?.attempts ?? 0) + 1)
      this.attempts.set(rest.id, attempt)
      receipts[rest.id] = { attempts: attempt, updatedAt: this.deps.now() }
      await this.deps.writeReceipts(boundedReceipts(receipts))
      if (!this.isCurrent(rest.id)) return
      if (await this.deps.send(rest.id) !== 'sent') throw new Error('Gym rest notification was muted')
      this.delivered.add(rest.id)
      if (this.delivered.size > MAX_RECEIPTS) this.delivered.delete(this.delivered.values().next().value!)
      await this.persistSentReceipt(rest.id, { attempts: attempt, updatedAt: this.deps.now(), sentAt: this.deps.now() })
    } catch (error) {
      this.deps.log(`Gym rest alert failed: ${error instanceof Error ? error.message : 'Unknown delivery error'}`)
      const attempt = this.attempts.get(rest.id) ?? localAttempt
      if (this.isCurrent(rest.id) && !this.delivered.has(rest.id) && attempt < MAX_ATTEMPTS) {
        this.schedule(rest, 5000 * attempt)
      }
    }
  }

  private async persistSentReceipt(id: string, receipt: GymRestReceipt & { sentAt: number }, persistenceAttempt = 1): Promise<void> {
    if (this.stopped) return
    try {
      const receipts = boundedReceipts(await this.deps.readReceipts())
      if (this.stopped) return
      receipts[id] = { ...receipt, attempts: Math.max(receipt.attempts, receipts[id]?.attempts ?? 0), updatedAt: this.deps.now() }
      await this.deps.writeReceipts(boundedReceipts(receipts))
    } catch (error) {
      this.deps.log(`Gym rest sent receipt save failed (${persistenceAttempt}/${MAX_ATTEMPTS}): ${error instanceof Error ? error.message : 'Unknown storage error'}`)
      if (this.stopped || persistenceAttempt >= MAX_ATTEMPTS) return
      const cancel = this.deps.schedule(() => {
        this.receiptRetries.delete(id)
        return this.enqueue(() => this.persistSentReceipt(id, receipt, persistenceAttempt + 1))
      }, 5000 * persistenceAttempt)
      this.receiptRetries.set(id, cancel)
      if (this.receiptRetries.size > MAX_RECEIPTS) {
        const oldest = this.receiptRetries.keys().next().value!
        this.receiptRetries.get(oldest)?.()
        this.receiptRetries.delete(oldest)
      }
    }
  }

  stop(): void {
    this.stopped = true
    this.pending = null
    this.cancel?.()
    this.cancel = null
    for (const cancel of this.receiptRetries.values()) cancel()
    this.receiptRetries.clear()
  }
}
