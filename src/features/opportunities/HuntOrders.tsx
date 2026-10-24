import { useState } from 'react'
import { Crosshair, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { objectiveMatches, objectiveSummary } from './opportunity-radar'
import type { Objective, ObjectiveParsed, Opportunity } from './opportunity-model'

/** One hunt order: what radar read, how many live items match, and its pause/remove controls. */
function HuntOrderCard({ objective: obj, live, onPatch, onDelete, onView }: {
  objective: Objective
  live: Opportunity[]
  onPatch: (patch: Partial<Objective>) => void
  onDelete: () => void
  onView: (parsed?: ObjectiveParsed) => void
}) {
  const found = obj.parsed ? live.filter((o) => objectiveMatches(o, obj.parsed)).length : 0
  const target = obj.parsed?.targetCount ?? null
  const pct = target ? Math.min(100, Math.round((found / target) * 100)) : 0
  const chips = objectiveSummary(obj.parsed)
  return (
    <div className={`rounded-xl border p-3 transition-opacity ${obj.active ? 'border-border' : 'border-border/60 opacity-60'}`}>
      <div className="flex items-start gap-2.5">
        <Crosshair className={`mt-0.5 size-3.5 shrink-0 ${obj.active ? 'text-accent' : 'text-foreground-faint'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-foreground">{obj.text}</p>
          {obj.status === 'thinking' && (
            <p className="mt-1 text-xs text-foreground-faint">Radar is reading this order…</p>
          )}
          {obj.status === 'error' && (
            <p className="mt-1 text-xs text-destructive">Couldn't read this: {obj.error || 'agent error'} — it still steers the next run as written.</p>
          )}
          {obj.status === 'ready' && obj.reply && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{obj.reply}</p>
          )}
          {chips.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {chips.map((c, i) => <Chip key={i} size="sm">{c}</Chip>)}
            </div>
          )}
          {obj.status === 'ready' && (
            <div className="mt-2 flex max-w-sm items-center gap-2">
              {target ? (
                <>
                  <Progress value={pct} className="flex-1" />
                  <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">{found} / {target} found</span>
                </>
              ) : (
                <span className="font-mono text-2xs tabular-nums text-muted-foreground">{found} match{found === 1 ? '' : 'es'} so far</span>
              )}
              <Button variant="ghost" size="xs" onClick={() => onView(obj.parsed)}>View</Button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Chip
            selectable
            selected={obj.active}
            size="sm"
            onClick={() => onPatch({ active: !obj.active })}
            title={obj.active ? 'Pause (stop steering radar)' : 'Resume'}
          >
            {obj.active ? 'Active' : 'Paused'}
          </Chip>
          <Button variant="ghost" size="icon-xs" aria-label="Remove hunt order" onClick={onDelete}>
            <X />
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Hunt orders and the composer that sends a new one; ⌘/Ctrl+Enter submits. */
export function HuntOrders({ objectives, live, onAdd, onPatch, onDelete, onView }: {
  objectives: Objective[]
  live: Opportunity[]
  onAdd: (text: string) => void
  onPatch: (id: string, patch: Partial<Objective>) => void
  onDelete: (id: string) => void
  onView: (parsed?: ObjectiveParsed) => void
}) {
  const [draft, setDraft] = useState('')
  const send = () => {
    const text = draft.trim()
    if (!text) return
    onAdd(text)
    setDraft('')
  }
  return (
    <div className="flex flex-col gap-3">
      {objectives.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {objectives.map((obj) => (
            <HuntOrderCard
              key={obj.id}
              objective={obj}
              live={live}
              onPatch={(patch) => onPatch(obj.id, patch)}
              onDelete={() => onDelete(obj.id)}
              onView={onView}
            />
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() } }}
          rows={2}
          placeholder="e.g. Find me 20 remote software internships paying $2k+/mo with deadlines before September…"
          className="flex-1 resize-none px-2.5 py-2 text-xs"
        />
        <Button size="sm" onClick={send} disabled={!draft.trim()}>
          <Send /> Send
        </Button>
      </div>
      <p className="-mt-1 font-mono text-2xs text-foreground-faint">⌘↵ to send · active orders steer the next “Run radar”.</p>
    </div>
  )
}
