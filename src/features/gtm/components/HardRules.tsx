import { WidgetCard } from '@/components/widgets/WidgetCard'
import { HARD_RULES } from '../phases'

export function HardRules() {
  return (
    <WidgetCard title="HARD RULES" variant="urgent" compact>
      <ol className="space-y-1.5">
        {HARD_RULES.map((rule, i) => (
          <li key={i} className="text-xs text-muted-foreground">
            <span className="mr-1.5 font-medium">{i + 1}.</span>
            {rule}
          </li>
        ))}
      </ol>
    </WidgetCard>
  )
}
