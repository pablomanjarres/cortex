import type { CreditCardCommand, CreditCardCommandResult, CreditCardState } from './credit-card-types.js'
import type { CreditCardAlertOutcome, CreditCardAlertStatus } from './credit-card-alerts-types.js'
import type { NotificationChannel } from './notification-transport.js'

export interface CreditCardLogin { available: boolean; enabled: boolean }
interface CreditCardAPIDeps {
  command(command: CreditCardCommand): Promise<CreditCardState>
  alerts: {
    status(): Promise<CreditCardAlertStatus>
    test(channel: NotificationChannel): Promise<CreditCardAlertOutcome>
    retry(): Promise<CreditCardAlertStatus>
  }
  getLogin(): CreditCardLogin
  setLogin(enabled: boolean): CreditCardLogin
}

/** One validation/error boundary shared by the HTTP and IPC callers. */
export function createCreditCardAPI(deps: CreditCardAPIDeps) {
  return {
    async command(command: unknown): Promise<CreditCardCommandResult> {
      if (!command || typeof command !== 'object' || Array.isArray(command)) {
        return { ok: false, error: 'Invalid credit card command' }
      }
      try { return { ok: true, state: await deps.command(command as CreditCardCommand) } }
      catch (error) { return { ok: false, error: String((error as Error)?.message ?? error) } }
    },
    alertStatus: () => deps.alerts.status(),
    test(channel: unknown) {
      if (channel !== 'native' && channel !== 'phone') throw new Error('Choose native or phone notifications')
      return deps.alerts.test(channel)
    },
    retry: () => deps.alerts.retry(),
    getLogin: () => deps.getLogin(),
    setLogin(enabled: unknown) {
      if (typeof enabled !== 'boolean') throw new Error('Launch at login must be on or off')
      return deps.setLogin(enabled)
    },
  }
}
export type CreditCardAPI = ReturnType<typeof createCreditCardAPI>

export async function handleCreditCardRequest(
  api: CreditCardAPI, method: string, pathname: string, body?: unknown,
): Promise<{ status: number; body: unknown } | null> {
  if (!pathname.startsWith('/api/credit-card/')) return null
  const record = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  try {
    switch (pathname) {
      case '/api/credit-card/command': {
        if (method !== 'POST') break
        const result = await api.command(body)
        return { status: result.ok ? 200 : 400, body: result }
      }
      case '/api/credit-card/alerts':
        if (method === 'GET') return { status: 200, body: await api.alertStatus() }
        break
      case '/api/credit-card/test':
        if (method === 'POST') return { status: 200, body: await api.test(record.channel) }
        break
      case '/api/credit-card/retry':
        if (method === 'POST') return { status: 200, body: await api.retry() }
        break
      case '/api/credit-card/login':
        if (method === 'GET') return { status: 200, body: api.getLogin() }
        if (method === 'POST') return { status: 200, body: api.setLogin(record.enabled) }
        break
      default: return { status: 404, body: { error: 'Unknown credit card action' } }
    }
    return { status: 405, body: { error: 'Method not allowed' } }
  } catch (error) {
    return { status: 400, body: { error: String((error as Error)?.message ?? error) } }
  }
}
