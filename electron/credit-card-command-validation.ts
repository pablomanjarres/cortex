import type { CreditCardCommand } from './credit-card-types.js'
import { creditCardMoney, creditCardObject, creditCardText, validateCard, validateCycle,
  validatePayment, validatePurchase, validateReminders, validateSnapshot } from './credit-card-validation.js'
import { creditCardMonthNumber } from './credit-card-dates.js'

/** Validate the incoming record and its size before cloning a transition payload. */
export function validateCreditCardCommand(command: CreditCardCommand): void {
  creditCardObject(command); creditCardText(command.requestId, 'request id')
  switch (command.type) {
    case 'initialize':
      validateCard(command.card)
      if (!Array.isArray(command.purchases) || command.purchases.length > 1000) throw new Error('Invalid purchase records')
      if (command.cycles !== undefined && (!Array.isArray(command.cycles) || command.cycles.length > 2400)) throw new Error('Invalid cycle records')
      command.purchases.forEach(validatePurchase); command.cycles?.forEach(validateCycle)
      if (command.snapshot !== undefined) validateSnapshot(command.snapshot)
      break
    case 'configure': validateCard(command.card); break
    case 'purchase.save': validatePurchase(command.purchase); if (command.cycle !== undefined) validateCycle(command.cycle); break
    case 'purchase.cancel': creditCardText(command.id, 'purchase id'); break
    case 'cycle.save': validateCycle(command.cycle); break
    case 'payment.save': validatePayment(command.payment); break
    case 'payment.void': creditCardText(command.id, 'payment id'); creditCardText(command.reason, 'void reason', 2000); break
    case 'snapshot.save': validateSnapshot(command.snapshot); break
    case 'reserve.set': creditCardMonthNumber(command.cycleId); creditCardMoney(command.amount, 'reserve amount'); break
    case 'reminders.save': validateReminders(command.reminders); break
    default: throw new Error('Unknown credit card command')
  }
}
