import { CreditCardService } from './credit-card-service.js'
import { createCreditCardAlerts } from './credit-card-alerts.js'
import { createCreditCardAPI, type CreditCardLogin } from './credit-card-api.js'
import { CREDIT_CARD_KEY, CREDIT_CARD_ALERTS_KEY, type CreditCardState } from './credit-card-types.js'
import type { CreditCardAlertState } from './credit-card-alerts-types.js'
import type { createNotificationTransport } from './notification-transport.js'

interface CreditCardRuntimeDeps {
  transport: ReturnType<typeof createNotificationTransport>
  readLedger(): Promise<CreditCardState | null>
  readAlertState(): Promise<CreditCardAlertState | null>
  write(key: string, data: unknown): Promise<{ ok: boolean; error?: string }>
  getLogin(): CreditCardLogin
  setLogin(enabled: boolean): CreditCardLogin
  url: string
}

/** Main-process composition. Domain, delivery, and persistence stay separate. */
export function createCreditCardRuntime(deps: CreditCardRuntimeDeps) {
  const transport = deps.transport
  const service = new CreditCardService({
    read: deps.readLedger,
    write: async (state) => {
      const result = await deps.write(CREDIT_CARD_KEY, state)
      if (!result.ok) throw new Error(result.error || 'Credit card could not be saved')
    },
  }, () => { void alerts.check().catch(() => { /* checker retains failure status */ }) })
  const alerts = createCreditCardAlerts({
    readLedger: () => service.load(),
    readAlertState: deps.readAlertState,
    writeAlertState: (state) => deps.write(CREDIT_CARD_ALERTS_KEY, state),
    send: transport.send,
    readiness: transport.readiness,
    url: deps.url,
  })
  const api = createCreditCardAPI({
    command: (command) => service.command(command),
    alerts,
    getLogin: deps.getLogin,
    setLogin: deps.setLogin,
  })
  return { api, alerts, transport }
}
