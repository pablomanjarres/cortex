import { applyCreditCardCommand, emptyCreditCardState,
  type CreditCardCommand, type CreditCardState } from './credit-card-model.js'
import { validateCreditCardState } from './credit-card-validation.js'
import { validateCreditCardAllocations } from './credit-card-payment-validation.js'
import { creditCardToday } from './credit-card-dates.js'

export interface CreditCardStore {
  read: () => Promise<CreditCardState | null>
  write: (state: CreditCardState) => Promise<void>
}

/** Owns serialized read-transition-write; observers only see a persisted command. */
export class CreditCardService {
  private sequence: Promise<unknown> = Promise.resolve()
  constructor(private readonly store: CreditCardStore,
    private readonly onCommitted: (state: CreditCardState) => void = () => {}) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.sequence.then(operation, operation)
    this.sequence = result.then(() => undefined, () => undefined)
    return result
  }
  command(command: CreditCardCommand, now = new Date().toISOString()): Promise<CreditCardState> {
    return this.enqueue(async () => {
      const current = await this.store.read() ?? emptyCreditCardState()
      const next = applyCreditCardCommand(current, command, now)
      if (next === current) return current
      await this.store.write(next)
      this.onCommitted(next)
      return next
    })
  }
  load(): Promise<CreditCardState> {
    return this.enqueue(async () => {
      const state = await this.store.read() ?? emptyCreditCardState()
      validateCreditCardState(state)
      validateCreditCardAllocations(state, creditCardToday())
      return state
    })
  }
}
