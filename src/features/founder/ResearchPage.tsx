import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { Notice } from '@/components/shared/Notice'
import { Skeleton } from '@/components/shared/Skeleton'
import { StatTile } from '@/components/shared/StatTile'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useStore } from '@/lib/store'
import { formatCrmTime } from '@/features/crm/noelle-crm-model'
import { researchApi, researchExportUrl } from './research-api'
import { ResearchBrief } from './research-brief'
import { ResearchOutreach } from './research-outreach'
import { ResearchEvidence } from './research-evidence'
import type { ResearchAction, ResearchState, ResearchView } from '../../../electron/founder-research-model'
import type { NoelleCrmSnapshot } from '../../../electron/noelle-crm'

export function ResearchPage() {
  const api = useMemo(() => researchApi(), [])
  const [stored] = useStore<ResearchState | null>('cortex-founder-research', null)
  const [crm] = useStore<NoelleCrmSnapshot | null>('cortex-noelle-crm', null)
  const [view, setView] = useState<ResearchView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState('')
  const [tab, setTab] = useState('brief')
  const [sourceId, setSourceId] = useState<string | undefined>(undefined)
  const requestVersion = useRef(0)
  const load = useCallback(async () => {
    const version = ++requestVersion.current
    try { const result = await api.read(); if (version === requestVersion.current) { setView(result); setError(null) } }
    catch (failure) { if (version === requestVersion.current) setError(failure instanceof Error ? failure.message : 'Research data is unavailable') }
  }, [api])
  useEffect(() => {
    const version = ++requestVersion.current
    api.read().then(result => {
      if (version === requestVersion.current) { setView(result); setError(null) }
    }).catch(failure => {
      if (version === requestVersion.current) setError(failure instanceof Error ? failure.message : 'Research data is unavailable')
    })
    return () => { requestVersion.current += 1 }
  }, [api, stored, crm])
  const act = async (action: ResearchAction) => {
    setBusy(true); setError(null); setReceipt(''); requestVersion.current += 1
    try { const result = await api.action(action); requestVersion.current += 1; setView(result); setReceipt(action.type === 'publish' ? `Published brief v${result.campaign.revisions.at(-1)?.version}. Unsent drafts use the current brief for review.` : 'Research changes saved.'); return result }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Research changes could not be saved'); return null }
    finally { setBusy(false) }
  }
  if (!view) return <PageShell>{error ? <div role="alert" className="flex flex-col gap-3"><EmptyState message={error} /><Button className="self-start" variant="secondary" onClick={load}>Retry research</Button></div> : <Skeleton className="h-64" />}</PageShell>
  const published = view.campaign.revisions.at(-1)
  const verifiedIds = new Set(view.events.filter(event => event.verifiedSent).map(event => event.id))
  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2"><div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl font-semibold tracking-tight">{view.campaign.draft.title}</h2><Chip variant={published ? 'success' : 'warning'}>{published ? `Brief v${published.version}` : 'Draft brief'}</Chip></div><p className="max-w-3xl text-sm text-muted-foreground">{view.campaign.draft.audience} Learn what happens when they deploy and share them.</p></div>
        <Button variant="secondary" disabled={busy} onClick={load}>Refresh research</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Staged requests" value={view.events.filter(event => !event.verifiedSent && !event.superseded).length} sub="Send has not been verified" />
        <StatTile label="Verified participants" value={view.crmContacts.length} sub="Research send matched to CRM" />
        <StatTile label="Interviews booked" value={Object.entries(view.meetings).filter(([id, meeting]) => verifiedIds.has(id) && meeting.status === 'booked').length} sub="Marked manually" />
        <StatTile label="Interviews completed" value={Object.entries(view.meetings).filter(([id, meeting]) => verifiedIds.has(id) && meeting.status === 'completed').length} sub="Marked manually" />
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {view.sync.error && <Notice tone="warning">{view.sync.error} Saved research is retained.</Notice>}
      <Tabs value={tab} onValueChange={value => setTab(String(value))}>
        <TabsList variant="line" aria-label="Research views"><TabsTrigger value="brief">Brief</TabsTrigger><TabsTrigger value="outreach">Outreach</TabsTrigger><TabsTrigger value="evidence">Evidence</TabsTrigger></TabsList>
        <TabsContent value="brief" className="pt-3"><ResearchBrief view={view} busy={busy} act={act} /></TabsContent>
        <TabsContent value="outreach" className="pt-3"><ResearchOutreach view={view} busy={busy} act={act} onUseSource={id => { setSourceId(id); setTab('evidence') }} /></TabsContent>
        <TabsContent value="evidence" className="pt-3"><ResearchEvidence key={sourceId} view={view} busy={busy} act={act} initialSourceId={sourceId} /></TabsContent>
      </Tabs>
      <div className="grid gap-3 sm:grid-cols-2" aria-label="Research draft generation">
        {(['x', 'linkedin'] as const).map(platform => {
          const generation = view.sync.generation?.find(item => item.platform === platform)
          const current = !!published && generation?.briefVersion === published.version && generation?.briefHash === published.hash
          return <div key={platform} className="rounded-md border border-border p-3 text-xs"><p className="mb-2 font-medium">{platform === 'x' ? 'X' : 'LinkedIn'} research draft pass</p>{!generation ? <span className="text-muted-foreground">Not run yet</span> : <div className="flex flex-col gap-2"><div className="flex flex-wrap gap-2"><Chip variant={generation.status === 'error' ? 'warning' : current ? 'success' : 'warning'}>{generation.status === 'error' ? 'Needs attention' : current ? 'Current brief checked' : 'Older or unpublished brief'}</Chip>{generation.briefVersion && <Chip>Brief v{generation.briefVersion}</Chip>}</div><span className="font-mono text-muted-foreground">{formatCrmTime(generation.observedAt)}</span><span className="text-muted-foreground">Eligible {generation.eligible ?? '—'} · staged {generation.staged ?? '—'} · pending {generation.pending ?? '—'} · sent 0</span>{generation.error && <span className="break-words text-warning">{generation.error.replaceAll('_', ' ')}</span>}</div>}</div>
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground"><span>Last successful sync: {formatCrmTime(view.sync.lastSuccessfulSyncAt)}</span><div className="flex flex-wrap gap-4"><a className="text-accent" href={researchExportUrl('notes.md')} target="_blank" rel="noreferrer">Download Markdown notes</a><a className="text-accent" href={researchExportUrl('contacts.csv')} target="_blank" rel="noreferrer">Download contacts index</a></div></div>
      <p role="status" aria-live="polite" className="min-h-5 text-xs text-success">{receipt}</p>
    </PageShell>
  )
}
