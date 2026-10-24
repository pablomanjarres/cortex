import { useState } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Field } from '@/components/shared/Field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { formatCrmTime } from '@/features/crm/noelle-crm-model'
import { ResearchNotes, type ResearchActions } from './research-notes'
import { researchExportUrl } from './research-api'
import { RESEARCH_BRIEF_LIMITS, type ResearchBriefDraft, type ResearchView } from '../../../electron/founder-research-model'

type BriefTextField = 'title' | 'audience' | 'objective' | 'invitationGuidance'

const BRIEF_LABELS: Record<BriefTextField, string> = {
  title: 'Title',
  audience: 'Audience',
  objective: 'Objective',
  invitationGuidance: 'Invitation guidance',
}

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
  const textField = (field: BriefTextField) => (
    <Field label={BRIEF_LABELS[field]}>{id => <Input id={id} value={draft[field]} maxLength={RESEARCH_BRIEF_LIMITS[field]} onChange={event => change(field, event.target.value)} />}</Field>
  )
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
            {textField('title')}
            {textField('audience')}
            {textField('objective')}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Interview questions</legend>
              {draft.questions.map((question, index) => <div key={index} className="flex items-center gap-2">
                <Input aria-label={`Interview question ${index + 1}`} value={question} maxLength={RESEARCH_BRIEF_LIMITS.question} onChange={event => change('questions', draft.questions.map((item, i) => i === index ? event.target.value : item))} />
                <Button variant="ghost" size="sm" aria-label={`Remove question ${index + 1}`} disabled={draft.questions.length === 1} onClick={() => change('questions', draft.questions.filter((_, i) => i !== index))}>Remove</Button>
              </div>)}
              <Button variant="secondary" className="self-start" disabled={draft.questions.length >= RESEARCH_BRIEF_LIMITS.questions} onClick={() => change('questions', [...draft.questions, ''])}>Add question</Button>
            </fieldset>
            {textField('invitationGuidance')}
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
            <BriefValue label={BRIEF_LABELS.audience}>{draft.audience}</BriefValue>
            <BriefValue label={BRIEF_LABELS.objective}>{draft.objective}</BriefValue>
            <ol className="list-decimal space-y-3 pl-5" aria-label="Interview questions">{draft.questions.map((question, index) => <li key={index}>{question}</li>)}</ol>
            <BriefValue label={BRIEF_LABELS.invitationGuidance}>{draft.invitationGuidance}</BriefValue>
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

function BriefValue({ label, children }: { label: string; children: string }) {
  return <div><p className="mb-1 font-medium">{label}</p><p className="text-muted-foreground">{children}</p></div>
}
