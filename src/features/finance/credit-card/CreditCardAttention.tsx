import { useNavigate } from 'react-router-dom'
import { CreditCard } from 'lucide-react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import { creditCardCycles, creditCardDaysBetween, emptyCreditCardState } from '../../../../electron/credit-card-model'
import { CREDIT_CARD_KEY, type CreditCardState } from '../../../../electron/credit-card-types'
import { useCardToday } from './use-card-today'
import { cardDate, cardMoney } from './card-format'

export function CreditCardAttention() {
  const [state] = useStore<CreditCardState>(CREDIT_CARD_KEY, emptyCreditCardState())
  const today = useCardToday()
  const navigate = useNavigate()
  const cycle = creditCardCycles(state, today).find((entry) => entry.remaining > 0 && (
    entry.dueDate <= today || creditCardDaysBetween(today, entry.dueDate) <= 7 ||
    (!entry.statementConfirmed && entry.closingDate <= today)))
  if (!state.card || !cycle) return null
  const statement = !cycle.statementConfirmed && cycle.closingDate <= today
  return <WidgetCard title="Needs attention · Credit card" variant={cycle.status === 'overdue' ? 'urgent' : 'default'} compact>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><CreditCard className="size-5 shrink-0 text-accent" />
        <div className="min-w-0"><p className="text-sm">{cardMoney(cycle.remaining)} {cycle.status === 'overdue' ? 'overdue' : `due ${cardDate(cycle.dueDate)}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">{statement ? 'Confirm the bank statement.' : `${cardMoney(cycle.fundingGap)} still to prepare.`}</p>
        </div>
      </div>
      <Button variant="secondary" size="sm" onClick={() => navigate('/finance#credit-card')}>Open Credit card</Button>
    </div>
  </WidgetCard>
}
