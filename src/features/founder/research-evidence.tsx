import { useState, type ReactNode } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Field } from '@/components/shared/Field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { ResearchView } from '../../../electron/founder-research-model'
import type { ResearchActions } from './research-notes'
import { ReviewStatusChip } from './research-review'

interface ReviewedRecord<Status extends string> {
  id: string
  text: string
  reviewStatus: Status
  refs: string[]
}

/** Recorded findings or decisions, each with its references and review actions. */
function ReviewedRecordList<Status extends string>({ records, emptyMessage, refsLabel, actions, busy, onReview }: {
  records: ReviewedRecord<Status>[]
  emptyMessage: string
  refsLabel: string
  actions: { status: Status; label: string }[]
  busy: boolean
  onReview(id: string, status: Status): void
}) {
  if (records.length === 0) return <EmptyState message={emptyMessage} />
  return (
    <ol className="mb-5 flex max-h-96 flex-col gap-4 overflow-y-auto">
      {records.map(record => <li key={record.id} className="flex flex-col gap-2 border-b border-border pb-4">
        <p className="whitespace-pre-wrap break-words text-sm">{record.text}</p><ReviewStatusChip status={record.reviewStatus} />
        <p className="break-all font-mono text-2xs text-muted-foreground">{refsLabel}: {record.refs.join(', ')}</p>
        <div className="flex flex-wrap gap-2">
          {actions.map(action => <Button key={action.status} variant="ghost" size="sm" disabled={busy || record.reviewStatus === action.status} onClick={() => onReview(record.id, action.status)}>{action.label}</Button>)}
        </div>
      </li>)}
    </ol>
  )
}

/** The references a new record cites, chosen from a scrollable checklist. */
function ReferenceChecklist({ legend, emptyMessage, options, selected, onToggle }: {
  legend: string
  emptyMessage: string
  options: { id: string; label: ReactNode }[]
  selected: string[]
  onToggle(id: string): void
}) {
  return (
    <fieldset className="flex max-h-48 flex-col gap-2 overflow-y-auto"><legend className="mb-2 text-xs font-medium text-muted-foreground">{legend}</legend>
      {options.length === 0 ? <p className="text-xs text-muted-foreground">{emptyMessage}</p> : options.map(option => <label key={option.id} className="flex cursor-pointer items-start gap-2 text-xs">
        <Checkbox checked={selected.includes(option.id)} onChange={() => onToggle(option.id)} className="mt-0.5" />
        <span className="break-words">{option.label}</span>
      </label>)}
    </fieldset>
  )
}

const SOURCE_KIND_LABELS: Record<ResearchView['sources'][number]['kind'], string> = {
  reply: 'Incoming CRM reply',
  draft: 'Draft context · not respondent evidence',
  context: 'Source context',
}

export function ResearchEvidence({ view, busy, act, initialSourceId }: ResearchActions & { view: ResearchView; initialSourceId?: string }) {
  const [findingDraft, setFindingDraft] = useState({ text: '', sourceIds: initialSourceId ? [initialSourceId] : [] as string[] })
  const [decisionDraft, setDecisionDraft] = useState({ text: '', findingIds: [] as string[] })
  const [sourceSearch, setSourceSearch] = useState('')
  const [visibleSources, setVisibleSources] = useState(50)
  const query = sourceSearch.trim().toLowerCase()
  const sourceOptions = view.sources.filter(source => !query || `${source.id} ${source.label} ${source.preview}`.toLowerCase().includes(query))
  const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <WidgetCard title="Source-backed findings" description="Record what the evidence supports. A prepared invitation alone does not prove a customer problem.">
        <ReviewedRecordList
          records={view.findings.map(finding => ({ ...finding, refs: finding.sourceIds }))}
          emptyMessage="No research findings recorded yet."
          refsLabel="Sources"
          actions={[{ status: 'confirmed', label: 'Confirm finding' }, { status: 'rejected', label: 'Reject finding' }]}
          busy={busy}
          onReview={(id, reviewStatus) => act({ type: 'review_finding', id, reviewStatus })}
        />
        <form className="mt-4 flex flex-col gap-3" onSubmit={event => event.preventDefault()}>
          <Field label="New finding">{id => <Input id={id} value={findingDraft.text} onChange={event => setFindingDraft({ ...findingDraft, text: event.target.value })} placeholder="What did the source show?" maxLength={10000} />}</Field>
          {view.sources.length > 0 && <Input aria-label="Search evidence sources" placeholder="Search replies and sources…" value={sourceSearch} onChange={event => { setSourceSearch(event.target.value); setVisibleSources(50) }} />}
          <ReferenceChecklist
            legend="Source references"
            emptyMessage="No sources match. Sources appear after research requests are imported."
            options={sourceOptions.slice(0, visibleSources).map(source => ({
              id: source.id,
              label: <><span className="font-medium">{SOURCE_KIND_LABELS[source.kind]} · {source.label}</span>{source.preview && <span className="mt-1 block whitespace-pre-wrap [overflow-wrap:anywhere]">{source.preview}</span>}<span className="mt-1 block break-all font-mono text-2xs text-muted-foreground">{source.id}</span></>,
            }))}
            selected={findingDraft.sourceIds}
            onToggle={id => setFindingDraft({ ...findingDraft, sourceIds: toggle(findingDraft.sourceIds, id) })}
          />
          {sourceOptions.length > visibleSources && <Button variant="secondary" className="self-start" onClick={() => setVisibleSources(visibleSources + 50)}>Show more sources</Button>}
          <Button className="self-start" disabled={busy || !findingDraft.text.trim() || findingDraft.sourceIds.length === 0} onClick={async () => {
            if (await act({ type: 'add_finding', text: findingDraft.text, sourceIds: findingDraft.sourceIds, reviewStatus: 'unreviewed' })) {
              setFindingDraft(current => current === findingDraft ? { text: '', sourceIds: [] } : current)
            }
          }}>Save finding for review</Button>
        </form>
      </WidgetCard>
      <WidgetCard title="Research decisions" description="Keep each decision tied to findings and an explicit review state.">
        <ReviewedRecordList
          records={view.decisions.map(decision => ({ ...decision, refs: decision.evidenceIds }))}
          emptyMessage="No research decisions recorded yet."
          refsLabel="Finding IDs"
          actions={[{ status: 'accepted', label: 'Accept decision' }, { status: 'rejected', label: 'Reject decision' }]}
          busy={busy}
          onReview={(id, reviewStatus) => act({ type: 'review_decision', id, reviewStatus })}
        />
        <form className="mt-4 flex flex-col gap-3" onSubmit={event => event.preventDefault()}>
          <Field label="New decision">{id => <Input id={id} value={decisionDraft.text} onChange={event => setDecisionDraft({ ...decisionDraft, text: event.target.value })} placeholder="What should change based on the findings?" maxLength={10000} />}</Field>
          <ReferenceChecklist
            legend="Supporting findings"
            emptyMessage="Record a source-backed finding first."
            options={view.findings.map(finding => ({ id: finding.id, label: `${finding.text} · ${finding.reviewStatus}` }))}
            selected={decisionDraft.findingIds}
            onToggle={id => setDecisionDraft({ ...decisionDraft, findingIds: toggle(decisionDraft.findingIds, id) })}
          />
          <Button className="self-start" disabled={busy || !decisionDraft.text.trim() || decisionDraft.findingIds.length === 0} onClick={async () => {
            if (await act({ type: 'add_decision', text: decisionDraft.text, evidenceIds: decisionDraft.findingIds, reviewStatus: 'proposed' })) {
              setDecisionDraft(current => current === decisionDraft ? { text: '', findingIds: [] } : current)
            }
          }}>Save proposed decision</Button>
        </form>
      </WidgetCard>
    </div>
  )
}
