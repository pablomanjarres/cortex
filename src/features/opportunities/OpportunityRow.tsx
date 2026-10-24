import { ExternalLink, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Chip } from '@/components/ui/chip'
import { Select } from '@/components/ui/select'
import { CountdownChip } from './CountdownChip'
import { OpportunityEditor } from './OpportunityEditor'
import { fmtAmount } from './opportunity-radar'
import {
  ALL_STATUSES, categoryOf, eligibilityOf, statusConfig, statusOf,
  type Goal, type OppStatus, type Opportunity,
} from './opportunity-model'

/** Leverage as five dots — filled dots are the accent, empty ones sit on the hairline. */
function LeverageDots({ score }: { score: number }) {
  const n = Math.max(0, Math.min(5, Math.round(score)))
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5"
      role="img"
      aria-label={`Leverage ${n} of 5`}
      title={`Leverage ${n}/5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} aria-hidden className={`h-1.5 w-1.5 rounded-full ${i < n ? 'bg-accent' : 'bg-border'}`} />
      ))}
    </span>
  )
}

/** One radar row: the summary line toggles the inline editor below it. */
export function OpportunityRow({ o, today, expanded, onToggle, setField, toggleGoal, onDelete }: {
  o: Opportunity
  today: string
  expanded: boolean
  onToggle: () => void
  setField: (id: string, f: Partial<Opportunity>) => void
  toggleGoal: (id: string, g: Goal) => void
  onDelete: () => void
}) {
  return (
    <div>
      <div
        onClick={onToggle}
        className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-secondary/30 ${expanded ? 'bg-secondary/20' : ''}`}
      >
        <Button
          type="button"
          variant="ghost"
          aria-label={`Details for ${o.title}`}
          aria-expanded={expanded}
          aria-controls={expanded ? `opportunity-details-${o.id}` : undefined}
          onClick={event => { event.stopPropagation(); onToggle() }}
          className="h-auto min-w-0 flex-1 basis-52 flex-col items-start gap-0 p-0 text-left text-foreground"
        >
          <span className="block max-w-full truncate text-sm font-medium">{o.title}</span>
          <span className="block max-w-full truncate text-xs text-muted-foreground">
            {o.host || eligibilityOf(o.eligibility)}
            {o.location ? ` · ${o.location}` : ''}
          </span>
        </Button>
        <Chip size="sm">{categoryOf(o.category).label}</Chip>
        <CountdownChip opportunity={o} today={today} />
        {o.amountUsd != null && (
          <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">{fmtAmount(o.amountUsd)}</span>
        )}
        {o.requires18Plus === true && (
          <Chip size="sm" variant="danger" className="bg-transparent" title="Requires 18+ — check eligibility">18+</Chip>
        )}
        <LeverageDots score={o.leverageScore} />
        <Select
          value={statusConfig[o.status] ? o.status : 'new'}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setField(o.id, { status: e.target.value as OppStatus })}
          aria-label="Status"
          className={`h-7 w-24 shrink-0 cursor-pointer px-1.5 font-mono text-2xs ${statusOf(o.status).text}`}
        >
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}
        </Select>
        <div className="flex shrink-0 items-center gap-0.5">
          {o.url && (
            <a
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Open link"
              aria-label={`Open link for ${o.title}`}
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            >
              <ExternalLink />
            </a>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Delete opportunity" onClick={(e) => { e.stopPropagation(); onDelete() }}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {expanded && (
        <div id={`opportunity-details-${o.id}`} className="border-t border-border/60 bg-secondary/10 px-4 py-4">
          <OpportunityEditor o={o} setField={setField} toggleGoal={toggleGoal} onDelete={onDelete} />
        </div>
      )}
    </div>
  )
}
