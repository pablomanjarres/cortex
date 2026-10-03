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
  /** The main-process import owner holds the alert queue before entering this queue. */
  restore(state: CreditCardState | undefined, commitRelated: () => Promise<void>): Promise<number> {
    return this.enqueue(async () => {
      if (state !== undefined) {
        validateCreditCardState(state)
        validateCreditCardAllocations(state, creditCardToday())
      }
      const previous = await this.store.read() ?? emptyCreditCardState()
      const next = state === undefined ? undefined : structuredClone(state)
      try {
        if (next) await this.store.write(next)
        await commitRelated()
      } catch (cause) {
        if (next) try { await this.store.write(previous) }
        catch (rollback) { throw new AggregateError([cause, rollback], 'Credit card restore failed and ledger rollback failed') }
        throw cause
      }
      if (next) this.onCommitted(next)
      return next ? 1 : 0
    })
  }
}
