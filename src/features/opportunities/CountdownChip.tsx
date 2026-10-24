import { Chip } from '@/components/ui/chip'
import { countdownOf } from './opportunity-radar'
import type { Opportunity } from './opportunity-model'

/** The deadline countdown for one opportunity, toned by urgency. */
export function CountdownChip({ opportunity, today }: { opportunity: Opportunity; today: string }) {
  const cd = countdownOf(opportunity, today)
  return (
    <Chip size="sm" variant={cd.variant} className={cd.outline ? 'bg-transparent' : undefined} title={cd.title}>
      {cd.text}
    </Chip>
  )
}
