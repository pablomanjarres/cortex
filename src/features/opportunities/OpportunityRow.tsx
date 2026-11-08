import { ExternalLink, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Chip } from '@/components/ui/chip'
import { Select } from '@/components/ui/select'
import { CountdownChip } from './CountdownChip'
import { OpportunityEditor } from './OpportunityEditor'
import { FUNDING_CHIP, factChips, placeLabel, travelChip, type Row } from './opportunity-radar'
import { FUNDING_LABEL } from './opportunity-score'
import { ALL_STATUSES, statusConfig, statusOf, type OppStatus, type Opportunity } from './opportunity-model'

/** One radar row: title + one line of why, a few chips, and the inline editor when open. */
export function OpportunityRow({ row, today, note, expanded, onToggle, setField, onDelete }: {
  row: Row
  today: string
  /** Replaces the why line (e.g. the reason a hidden row is hidden). */
  note?: string
  expanded: boolean
  onToggle: () => void
  setField: (id: string, f: Partial<Opportunity>) => void
  onDelete: () => void
}) {
  const { o, s } = row
  const fundingVariant = FUNDING_CHIP[s.funding]
  const travel = travelChip(row.travel)
  const sub = note ?? (o.leverageNote || o.host)
  const facts = expanded ? factChips(o) : []
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
          {sub && <span className="block max-w-full truncate text-xs font-normal text-muted-foreground">{sub}</span>}
        </Button>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          {o.premium && <Chip size="sm" variant="accent" title="On your 100% list">Premium</Chip>}
          {travel && <Chip size="sm" variant={travel.variant} title={travel.title}>{travel.text}</Chip>}
          {fundingVariant && <Chip size="sm" variant={fundingVariant}>{FUNDING_LABEL[s.funding]}</Chip>}
          <Chip size="sm">{placeLabel(o)}</Chip>
          <CountdownChip opportunity={o} today={today} />
          <span className="w-7 shrink-0 text-right font-mono text-xs tabular-nums text-foreground" title="Profile score (0–100)">
            {s.score}
          </span>
          <Select
            value={statusConfig[o.status] ? o.status : 'new'}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setField(o.id, { status: e.target.value as OppStatus, hiddenReason: null })}
            aria-label="Status"
            className={`h-7 w-24 shrink-0 cursor-pointer px-1.5 font-mono text-2xs ${statusOf(o.status).text}`}
          >
            {ALL_STATUSES.map((st) => <option key={st} value={st}>{statusConfig[st].label}</option>)}
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
      </div>
      {expanded && (
        <div id={`opportunity-details-${o.id}`} className="flex flex-col gap-4 border-t border-border/60 bg-secondary/10 px-4 py-4">
          {facts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {facts.map((f) => <Chip key={f} size="sm">{f}</Chip>)}
            </div>
          )}
          <OpportunityEditor o={o} setField={setField} onDelete={onDelete} />
        </div>
      )}
    </div>
  )
}
