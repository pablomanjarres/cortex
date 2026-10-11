import { useState } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { formatCrmTime } from '@/features/crm/noelle-crm-model'
import { ResearchNotes, type ResearchActions } from './research-notes'
import { researchExportUrl } from './research-api'
import { RESEARCH_BRIEF_LIMITS, type ResearchBriefDraft, type ResearchView } from '../../../electron/founder-research-model'

export function ResearchBrief({ view, busy, act }: ResearchActions & { view: ResearchView }) {
  const [editing, setEditing] = useState(false)
  const [edited, setEdited] = useState<ResearchBriefDraft | null>(null)
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null)
  const draft = edited ?? view.campaign.draft
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(view.campaign.draft)
  const latest = view.campaign.revisions.at(-1)
  const publishedDraft = latest && { title: latest.title, audience: latest.audience, objective: latest.objective, questions: latest.questions, invitationGuidance: latest.invitationGuidance }
  const unpublished = !publishedDraft || JSON.stringify(view.campaign.draft) !== JSON.stringify(publishedDraft)
  const change = (field: keyof ResearchBriefDraft, value: string | string[]) => {
    setEdited({ ...draft, [field]: value })
    setBaseUpdatedAt(edited === null ? view.campaign.draftUpdatedAt : baseUpdatedAt ?? view.campaign.draftUpdatedAt)
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
      <WidgetCard title="Research brief" description="The working draft can change. Published versions stay fixed for every invitation.">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Chip variant={latest ? 'success' : 'warning'}>{latest ? `Published v${latest.version}` : 'Not published'}</Chip>
          {unpublished && latest && <Chip variant="warning">Unpublished changes</Chip>}
          <Button variant="secondary" onClick={() => setEditing(!editing)}>{editing ? 'Close editor' : 'Edit brief'}</Button>
        </div>
        {editing ? (
          <form className="flex flex-col gap-4" onSubmit={event => event.preventDefault()} aria-label="Working research brief">
            <label className="flex flex-col gap-2 text-sm font-medium">Title<Input value={draft.title} maxLength={RESEARCH_BRIEF_LIMITS.title} onChange={event => change('title', event.target.value)} /></label>
            <label className="flex flex-col gap-2 text-sm font-medium">Audience<Input value={draft.audience} maxLength={RESEARCH_BRIEF_LIMITS.audience} onChange={event => change('audience', event.target.value)} /></label>
            <label className="flex flex-col gap-2 text-sm font-medium">Objective<Input value={draft.objective} maxLength={RESEARCH_BRIEF_LIMITS.objective} onChange={event => change('objective', event.target.value)} /></label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Interview questions</legend>
              {draft.questions.map((question, index) => <div key={index} className="flex items-center gap-2">
                <Input aria-label={`Interview question ${index + 1}`} value={question} maxLength={RESEARCH_BRIEF_LIMITS.question} onChange={event => change('questions', draft.questions.map((item, i) => i === index ? event.target.value : item))} />
                <Button variant="ghost" size="sm" aria-label={`Remove question ${index + 1}`} disabled={draft.questions.length === 1} onClick={() => change('questions', draft.questions.filter((_, i) => i !== index))}>Remove</Button>
              </div>)}
              <Button variant="secondary" className="self-start" disabled={draft.questions.length >= RESEARCH_BRIEF_LIMITS.questions} onClick={() => change('questions', [...draft.questions, ''])}>Add question</Button>
            </fieldset>
            <label className="flex flex-col gap-2 text-sm font-medium">Invitation guidance<Input value={draft.invitationGuidance} maxLength={RESEARCH_BRIEF_LIMITS.invitationGuidance} onChange={event => change('invitationGuidance', event.target.value)} /></label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!dirty || busy} onClick={async () => {
                const saved = await act({ type: 'save_draft', draft, expectedUpdatedAt: baseUpdatedAt ?? view.campaign.draftUpdatedAt })
                if (saved) {
                  setEdited(current => current === draft ? null : current)
                  setBaseUpdatedAt(saved.campaign.draftUpdatedAt)
                }
              }}>Save draft</Button>
              <Button variant="ghost" disabled={busy} onClick={() => { setEdited(null); setBaseUpdatedAt(null); setEditing(false) }}>Discard brief edits</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <div><p className="mb-1 font-medium">Audience</p><p className="text-muted-foreground">{draft.audience}</p></div>
            <div><p className="mb-1 font-medium">Objective</p><p className="text-muted-foreground">{draft.objective}</p></div>
            <ol className="list-decimal space-y-3 pl-5" aria-label="Interview questions">{draft.questions.map((question, index) => <li key={index}>{question}</li>)}</ol>
            <div><p className="mb-1 font-medium">Invitation guidance</p><p className="text-muted-foreground">{draft.invitationGuidance}</p></div>
          </div>
        )}
        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Publishing a changed brief sends unsent invitations back to review. Save your edits before publishing.</p>
          <Button className="self-start" disabled={busy || dirty || !unpublished} onClick={() => act({ type: 'publish', expectedUpdatedAt: view.campaign.draftUpdatedAt })}>{latest ? 'Publish next version' : 'Publish brief'}</Button>
        </div>
      </WidgetCard>
      <div className="flex flex-col gap-5">
        <WidgetCard title="Published versions" description="Every source draft keeps its brief version and hash.">
          {view.campaign.revisions.length === 0 ? <p className="text-sm text-muted-foreground">Publish the brief before preparing research invitations.</p> : <ol className="flex max-h-64 flex-col gap-3 overflow-y-auto">
            {[...view.campaign.revisions].reverse().map(revision => <li key={revision.version} className="flex flex-col gap-1 border-b border-border/60 pb-3">
              <span className="text-sm font-medium">v{revision.version} · {revision.title}</span>
              <span className="text-xs text-muted-foreground">{formatCrmTime(revision.publishedAt)}</span>
              <span className="break-all font-mono text-2xs text-muted-foreground">{revision.hash}</span>
              <a className="text-xs text-accent" href={researchExportUrl(`brief-v${revision.version}.json`)} target="_blank" rel="noreferrer">Download brief snapshot</a>
            </li>)}
          </ol>}
        </WidgetCard>
        <WidgetCard title="Campaign notes"><ResearchNotes value={view.notes.campaign?.text ?? ''} scope="campaign" busy={busy} act={act} /></WidgetCard>
      </div>
    </div>
  )
}
