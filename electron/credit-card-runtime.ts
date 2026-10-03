import { CreditCardService } from './credit-card-service.js'
import { createCreditCardAlerts } from './credit-card-alerts.js'
import { createCreditCardAPI, type CreditCardLogin } from './credit-card-api.js'
import { CREDIT_CARD_KEY, CREDIT_CARD_ALERTS_KEY, type CreditCardState } from './credit-card-types.js'
import { emptyCreditCardState } from './credit-card-model.js'
import { cardReminderAllowed } from './credit-card-alerts-model.js'
import type { CreditCardAlertState } from './credit-card-alerts-types.js'
import type { createNotificationTransport } from './notification-transport.js'
import { validateCreditCardState } from './credit-card-validation.js'
import { validateCreditCardAllocations } from './credit-card-payment-validation.js'
import { creditCardToday } from './credit-card-dates.js'
import { readCreditCardAlertState } from './credit-card-alerts-state.js'

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
  let lastLedger = emptyCreditCardState()
  const service = new CreditCardService({
    read: deps.readLedger,
    write: async (state) => {
      const result = await deps.write(CREDIT_CARD_KEY, state)
      if (!result.ok) throw new Error(result.error || 'Credit card could not be saved')
    },
  }, (state) => {
    lastLedger = state
    void alerts.check().catch(() => { /* checker retains failure status */ })
  })
  const alerts = createCreditCardAlerts({
    readLedger: async () => { const state = await service.load(); lastLedger = state; return state },
    readAlertState: deps.readAlertState,
    writeAlertState: (state) => deps.write(CREDIT_CARD_ALERTS_KEY, state),
    send: transport.send,
    readiness: transport.readiness,
    url: deps.url,
    onFailure: async (failure) => {
      let state = lastLedger
      try {
        state = await service.load()
        lastLedger = state
        if (!state.card || !state.reminders.enabled) return false
      } catch { /* A corrupt ledger still needs an actionable failure notice. */ }
      const channels = state.reminders.channels.filter((channel) => cardReminderAllowed(state, channel, failure.now))
      if (channels.length === 0) return false
      for (const channel of channels) await transport.send({
        channel, id: `${failure.id}:${channel}`, title: 'Credit card reminders need attention',
        message: failure.message, category: 'action-required', url: deps.url,
      })
      return true
    },
  })
  const api = createCreditCardAPI({
    command: (command) => service.command(command),
    alerts,
    getLogin: deps.getLogin,
    setLogin: deps.setLogin,
  })
  const validateImport = (bundle: Record<string, unknown>): void => {
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new Error('Import bundle must be an object')
    if (Object.hasOwn(bundle, CREDIT_CARD_KEY)) {
      const state = bundle[CREDIT_CARD_KEY] as CreditCardState
      validateCreditCardState(state)
      validateCreditCardAllocations(state, creditCardToday())
    }
    if (Object.hasOwn(bundle, CREDIT_CARD_ALERTS_KEY)) readCreditCardAlertState(bundle[CREDIT_CARD_ALERTS_KEY])
  }
  const restore = async (bundle: Record<string, unknown>): Promise<number> => {
    validateImport(bundle)
    const hasLedger = Object.hasOwn(bundle, CREDIT_CARD_KEY), hasAlerts = Object.hasOwn(bundle, CREDIT_CARD_ALERTS_KEY)
    if (!hasLedger && !hasAlerts) return 0
    const ledger = hasLedger ? structuredClone(bundle[CREDIT_CARD_KEY]) as CreditCardState : undefined
    const state = hasAlerts ? readCreditCardAlertState(bundle[CREDIT_CARD_ALERTS_KEY]) : undefined
    return alerts.restore(state, commitAlerts => service.restore(ledger, commitAlerts))
  }
  return { api, alerts, transport, validateImport, restore }
}
