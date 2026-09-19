import { cn } from '@/lib/utils'
import type { FactItem } from './homePanelUtils'

export function FactGrid({ facts }: { facts: FactItem[] }) {
  const toneClass = {
    focus: 'text-accent bg-accent/10',
    habit: 'text-success bg-success/10',
    deadline: 'text-warning bg-warning/10',
    calendar: 'text-info bg-info/10',
  }

  return (
    <section className="grid h-full grid-cols-2 gap-3 auto-rows-fr">
      {facts.map((fact) => (
        <article key={fact.label} className="surface flex min-h-36 flex-col justify-between rounded-2xl p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">{fact.label}</p>
            <span className={cn('rounded-xl p-1.5 [&>svg]:size-3.5', toneClass[fact.tone])}>{fact.icon}</span>
          </div>
          <div>
            <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">{fact.value}</p>
            <p className="mt-1 text-[0.7rem] leading-tight text-muted-foreground">{fact.detail}</p>
          </div>
        </article>
      ))}
    </section>
  )
}
