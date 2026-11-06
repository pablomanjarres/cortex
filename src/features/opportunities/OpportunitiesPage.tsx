import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { PageShell } from '@/components/shared/PageShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { MultiFilterChips } from '@/components/shared/FilterChips'
import { Notice } from '@/components/shared/Notice'
import { RefreshButton } from '@/components/shared/RefreshButton'
import { SectionDisclosure } from '@/components/shared/SectionDisclosure'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useStore } from '@/lib/store'
import { useToday } from '@/lib/use-today'
import { OpportunityRow } from './OpportunityRow'
import { DEFAULT_DATA, type OppData, type Opportunity } from './opportunity-model'
import { RADAR_FILTERS, hiddenLabel, radarView, type RadarFilter, type Row } from './opportunity-radar'
import { ALL_MODES, MODES, type Mode } from './opportunity-score'

const FILTER_OPTIONS = RADAR_FILTERS.map((f) => ({ value: f.key, label: f.label }))
/** Hidden rows are reference only; the best-scoring few are enough to spot a wrong call. */
const HIDDEN_SHOWN = 50

interface RowHandlers {
  today: string
  expanded: string | null
  onToggle: (id: string) => void
  setField: (id: string, f: Partial<Opportunity>) => void
  onDelete: (id: string) => void
}

function RadarList({ rows, dim, label, today, expanded, onToggle, setField, onDelete }: RowHandlers & {
  rows: Row[]
  dim?: boolean
  label?: (r: Row) => string
}) {
  return (
    <div className={`surface rounded-xl ${dim ? 'opacity-70' : ''}`}>
      <div className="flex flex-col divide-y divide-border/60">
        {rows.map((r) => (
          <OpportunityRow
            key={r.o.id}
            row={r}
            today={today}
            note={label?.(r)}
            expanded={expanded === r.o.id}
            onToggle={() => onToggle(r.o.id)}
            setField={setField}
            onDelete={() => onDelete(r.o.id)}
          />
        ))}
      </div>
    </div>
  )
}

function RadarSection({ title, rows, ...handlers }: RowHandlers & { title: string; rows: Row[] }) {
  if (rows.length === 0) return null
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">{title}</h3>
        <span className="font-mono text-2xs tabular-nums text-foreground-faint">{rows.length}</span>
      </div>
      <RadarList rows={rows} {...handlers} />
    </section>
  )
}

export function OpportunitiesPage() {
  const [data, updateData] = useStore<OppData>('cortex-opportunities', DEFAULT_DATA)
  const today = useToday()
  const items = useMemo(() => data.items || [], [data.items])

  const [mode, setMode] = useState<Mode>('balanced')
  const [filters, setFilters] = useState<RadarFilter[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  const view = useMemo(() => radarView(items, today, mode, filters), [items, today, mode, filters])

  const setItems = (fn: (prev: Opportunity[]) => Opportunity[]) =>
    updateData((p) => ({ ...p, items: fn(p.items || []) }))
  const setField = (id: string, f: Partial<Opportunity>) =>
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, ...f } : o)))
  const deleteOpp = (id: string) => {
    setItems((prev) => prev.filter((o) => o.id !== id))
    if (expanded === id) setExpanded(null)
  }

  const running = data.runStatus === 'requested' || data.runStatus === 'running'
  const requestRun = () => {
    if (running) return
    updateData((p) => ({ ...p, runRequestedAt: new Date().toISOString(), runStatus: 'requested', runError: undefined }))
  }

  const addOpp = () => {
    const o: Opportunity = {
      id: `opp-${Date.now()}`, title: 'New opportunity', host: '',
      category: 'other', goals: [], priority: 'medium', leverageScore: 3,
      leverageNote: '', status: 'pursuing', deadline: null, rolling: false,
      deadlineType: 'unknown', recurrence: null, nextWindowExpected: null,
      amountUsd: null, requires18Plus: null, effort: null, officialUrl: '',
      location: '', modality: 'unknown', eligibility: 'unknown', reward: '', url: '',
      source: 'manual', sourceRef: '', discoveredAt: new Date().toISOString(), notes: '', tags: [],
    }
    setItems((prev) => [o, ...prev])
    setExpanded(o.id)
  }

  const lastRun = data.lastRun
    ? new Date(data.lastRun).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null
  // Older runs wrote a long digest here; only the one-line research summary belongs.
  const summary = data.report && !data.report.includes('\n') && data.report.length <= 80 ? data.report : null
  const shown = view.apply.length + view.applied.length + view.watchlist.length
  const handlers: RowHandlers = {
    today, expanded, setField, onDelete: deleteOpp,
    onToggle: (id) => setExpanded((cur) => (cur === id ? null : id)),
  }

  return (
    <PageShell>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <MultiFilterChips label="Filters" size="md" options={FILTER_OPTIONS} value={filters} onChange={setFilters} />
          <div className="ml-auto flex items-center gap-2">
            <Select aria-label="Rank by" value={mode} onChange={(e) => setMode(e.target.value as Mode)}
              className="h-8 w-28 cursor-pointer px-2 text-xs">
              {ALL_MODES.map((m) => <option key={m} value={m}>{MODES[m].label}</option>)}
            </Select>
            <RefreshButton onClick={requestRun} busy={running} label="Run research" busyLabel="Researching…" />
            <Button size="sm" onClick={addOpp}><Plus /> Add</Button>
          </div>
        </div>

        {data.runStatus === 'error' && data.runError
          ? <Notice tone="danger">Last research run failed: {data.runError}</Notice>
          : (
            <p className="-mt-2 truncate font-mono text-2xs text-foreground-faint">
              {lastRun ? `Researched ${lastRun}${summary ? ` · ${summary}` : ''}` : 'Not researched yet'}
            </p>
          )}

        {shown === 0 && (
          <EmptyState
            message={filters.length ? 'Nothing matches.' : 'Nothing worth your time yet.'}
            hint={filters.length ? 'Drop a filter.' : 'Run research — it checks every source against your profile.'}
          />
        )}

        <RadarSection title="Apply" rows={view.apply} {...handlers} />
        <RadarSection title="Applied" rows={view.applied} {...handlers} />
        <RadarSection title="Watchlist · next cycle" rows={view.watchlist} {...handlers} />

        {view.hidden.length > 0 && (
          <SectionDisclosure variant="inline" title={`${view.hidden.length} hidden`}>
            <RadarList rows={view.hidden.slice(0, HIDDEN_SHOWN)} dim label={hiddenLabel} {...handlers} />
          </SectionDisclosure>
        )}
      </div>
    </PageShell>
  )
}
