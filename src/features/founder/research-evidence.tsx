import { useState } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import type { ResearchView } from '../../../electron/founder-research-model'
import type { ResearchActions } from './research-notes'

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
        {view.findings.length === 0 ? <EmptyState message="No research findings recorded yet." /> : <ol className="mb-5 flex max-h-96 flex-col gap-4 overflow-y-auto">{view.findings.map(finding => <li key={finding.id} className="flex flex-col gap-2 border-b border-border pb-4">
          <p className="whitespace-pre-wrap break-words text-sm">{finding.text}</p><Chip variant={finding.reviewStatus === 'confirmed' ? 'success' : finding.reviewStatus === 'rejected' ? 'danger' : 'warning'}>{finding.reviewStatus}</Chip>
          <p className="break-all font-mono text-2xs text-muted-foreground">Sources: {finding.sourceIds.join(', ')}</p>
          <div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" disabled={busy || finding.reviewStatus === 'confirmed'} onClick={() => act({ type: 'review_finding', id: finding.id, reviewStatus: 'confirmed' })}>Confirm finding</Button><Button variant="ghost" size="sm" disabled={busy || finding.reviewStatus === 'rejected'} onClick={() => act({ type: 'review_finding', id: finding.id, reviewStatus: 'rejected' })}>Reject finding</Button></div>
        </li>)}</ol>}
        <form className="mt-4 flex flex-col gap-3" onSubmit={event => event.preventDefault()}>
          <label className="flex flex-col gap-2 text-sm font-medium">New finding<Input value={findingDraft.text} onChange={event => setFindingDraft({ ...findingDraft, text: event.target.value })} placeholder="What did the source show?" maxLength={10000} /></label>
          {view.sources.length > 0 && <Input aria-label="Search evidence sources" placeholder="Search replies and sources…" value={sourceSearch} onChange={event => { setSourceSearch(event.target.value); setVisibleSources(50) }} />}
          <fieldset className="flex max-h-48 flex-col gap-2 overflow-y-auto"><legend className="mb-2 text-xs font-medium text-muted-foreground">Source references</legend>
            {sourceOptions.length === 0 ? <p className="text-xs text-muted-foreground">No sources match. Sources appear after research requests are imported.</p> : sourceOptions.slice(0, visibleSources).map(source => <label key={source.id} className="flex cursor-pointer items-start gap-2 text-xs"><input type="checkbox" checked={findingDraft.sourceIds.includes(source.id)} onChange={() => setFindingDraft({ ...findingDraft, sourceIds: toggle(findingDraft.sourceIds, source.id) })} className="mt-0.5 accent-accent" /><span className="break-words"><span className="font-medium">{source.kind === 'reply' ? 'Incoming CRM reply' : source.kind === 'draft' ? 'Draft context · not respondent evidence' : 'Source context'} · {source.label}</span>{source.preview && <span className="mt-1 block whitespace-pre-wrap [overflow-wrap:anywhere]">{source.preview}</span>}<span className="mt-1 block break-all font-mono text-2xs text-muted-foreground">{source.id}</span></span></label>)}
          </fieldset>
          {sourceOptions.length > visibleSources && <Button variant="secondary" className="self-start" onClick={() => setVisibleSources(visibleSources + 50)}>Show more sources</Button>}
          <Button className="self-start" disabled={busy || !findingDraft.text.trim() || findingDraft.sourceIds.length === 0} onClick={async () => {
            if (await act({ type: 'add_finding', text: findingDraft.text, sourceIds: findingDraft.sourceIds, reviewStatus: 'unreviewed' })) {
              setFindingDraft(current => current === findingDraft ? { text: '', sourceIds: [] } : current)
            }
          }}>Save finding for review</Button>
        </form>
      </WidgetCard>
      <WidgetCard title="Research decisions" description="Keep each decision tied to findings and an explicit review state.">
        {view.decisions.length === 0 ? <EmptyState message="No research decisions recorded yet." /> : <ol className="mb-5 flex max-h-96 flex-col gap-4 overflow-y-auto">{view.decisions.map(decision => <li key={decision.id} className="flex flex-col gap-2 border-b border-border pb-4">
          <p className="whitespace-pre-wrap break-words text-sm">{decision.text}</p><Chip variant={decision.reviewStatus === 'accepted' ? 'success' : decision.reviewStatus === 'rejected' ? 'danger' : 'warning'}>{decision.reviewStatus}</Chip>
          <p className="break-all font-mono text-2xs text-muted-foreground">Finding IDs: {decision.evidenceIds.join(', ')}</p>
          <div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" disabled={busy || decision.reviewStatus === 'accepted'} onClick={() => act({ type: 'review_decision', id: decision.id, reviewStatus: 'accepted' })}>Accept decision</Button><Button variant="ghost" size="sm" disabled={busy || decision.reviewStatus === 'rejected'} onClick={() => act({ type: 'review_decision', id: decision.id, reviewStatus: 'rejected' })}>Reject decision</Button></div>
        </li>)}</ol>}
        <form className="mt-4 flex flex-col gap-3" onSubmit={event => event.preventDefault()}>
          <label className="flex flex-col gap-2 text-sm font-medium">New decision<Input value={decisionDraft.text} onChange={event => setDecisionDraft({ ...decisionDraft, text: event.target.value })} placeholder="What should change based on the findings?" maxLength={10000} /></label>
          <fieldset className="flex max-h-48 flex-col gap-2 overflow-y-auto"><legend className="mb-2 text-xs font-medium text-muted-foreground">Supporting findings</legend>
            {view.findings.length === 0 ? <p className="text-xs text-muted-foreground">Record a source-backed finding first.</p> : view.findings.map(finding => <label key={finding.id} className="flex cursor-pointer items-start gap-2 text-xs"><input type="checkbox" checked={decisionDraft.findingIds.includes(finding.id)} onChange={() => setDecisionDraft({ ...decisionDraft, findingIds: toggle(decisionDraft.findingIds, finding.id) })} className="mt-0.5 accent-accent" /><span className="break-words">{finding.text} · {finding.reviewStatus}</span></label>)}
          </fieldset>
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
