import type { BlackoutHost, BlackoutState, BlackoutCommand } from './screen-blackout-contract.js'
export type { BlackoutHost, BlackoutState, BlackoutCommand } from './screen-blackout-contract.js'
export interface BlackoutAdapter {
  read(host: BlackoutHost): Promise<boolean>
  set(host: BlackoutHost, enabled: boolean): Promise<boolean>
}

export class BlackoutValidationError extends Error {}
export class BlackoutBusyError extends Error {}

export function parseBlackoutCommand(input: unknown): BlackoutCommand {
  if (!input || typeof input !== 'object') throw new BlackoutValidationError('Invalid blackout command')
  const { host, enabled } = input as Record<string, unknown>
  if (host !== 'mac' && host !== 'laptop-w') throw new BlackoutValidationError('host must be mac or laptop-w')
  if (typeof enabled !== 'boolean') throw new BlackoutValidationError('enabled must be a boolean')
  return { host, enabled }
}

const HOSTS: BlackoutHost[] = ['mac', 'laptop-w']
const labels: Record<BlackoutHost, string> = { mac: 'Mac', 'laptop-w': 'laptop-w' }

export class ScreenBlackoutService {
  private busy = new Set<BlackoutHost>()
  private reading: Promise<{ hosts: BlackoutState[] }> | null = null
  constructor(private readonly adapter: BlackoutAdapter) {}

  read(): Promise<{ hosts: BlackoutState[] }> {
    // One in-flight native query per snapshot, shared by all open clients.
    if (this.reading) return this.reading
    const reading = Promise.all(HOSTS.map(async host => {
      try { return this.state(host, await this.adapter.read(host)) }
      catch (error) {
        return { host, label: labels[host], enabled: null, available: false,
          error: error instanceof Error ? error.message : 'Screen control unavailable' } satisfies BlackoutState
      }
    })).then(hosts => ({ hosts })).finally(() => { if (this.reading === reading) this.reading = null })
    this.reading = reading
    return reading
  }

  async set(input: unknown): Promise<BlackoutState> {
    const { host, enabled } = parseBlackoutCommand(input)
    if (this.busy.has(host)) throw new BlackoutBusyError('A screen change is already in progress')
    this.busy.add(host)
    try {
      const actual = await this.adapter.set(host, enabled)
      if (actual !== enabled) throw new Error('Could not verify the requested screen state')
      return this.state(host, actual)
    } finally {
      this.reading = null
      this.busy.delete(host)
    }
  }

  private state(host: BlackoutHost, enabled: boolean): BlackoutState {
    return { host, label: labels[host], enabled, available: true }
  }
}
