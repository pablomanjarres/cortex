import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/shared/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { WorkSession, WorkSessionValues } from '../../../electron/work-hours-model'

function localDateTime(iso: string): string {
  const date = new Date(iso)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 19)
}

interface WorkSessionEditorProps {
  session: WorkSession
  busy: boolean
  saveError: string
  onClose: () => void
  onSave: (session: WorkSession, values: WorkSessionValues) => Promise<boolean>
}

export function WorkSessionEditor({ session, busy, saveError, onClose, onSave }: WorkSessionEditorProps) {
  const [startedAt, setStartedAt] = useState(() => localDateTime(session.startedAt))
  const [endedAt, setEndedAt] = useState(() => localDateTime(session.endedAt))
  const [description, setDescription] = useState(session.description)
  const [billable, setBillable] = useState(session.billable)
  const [prUrl, setPrUrl] = useState(session.prUrl ?? '')
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const parsedStart = new Date(startedAt)
    const parsedEnd = new Date(endedAt)
    if (!Number.isFinite(parsedStart.getTime()) || !Number.isFinite(parsedEnd.getTime())) {
      setError('Enter valid start and end times.')
      return
    }
    const start = startedAt === localDateTime(session.startedAt) ? session.startedAt : parsedStart.toISOString()
    const end = endedAt === localDateTime(session.endedAt) ? session.endedAt : parsedEnd.toISOString()
    if (Date.parse(end) <= Date.parse(start)) {
      setError('End must be after start.')
      return
    }
    setError('')
    const saved = await onSave(session, {
      startedAt: start,
      endedAt: end,
      description,
      billable,
      prUrl: prUrl.trim() || null,
    })
    if (saved) onClose()
  }

  return (
    <Modal
      open
      onOpenChange={(open) => { if (!open && !busy) onClose() }}
      title={session.needsReview ? 'Review interrupted session' : 'Edit session'}
      description={session.needsReview
        ? 'Confirm the actual stop time before this session can enter a report.'
        : 'Corrections keep the original values in the private ledger.'}
      size="lg"
    >
        <form onSubmit={(event) => { void save(event) }} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium" htmlFor="work-session-start">
              Started
              <Input id="work-session-start" type="datetime-local" step="1" required value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm font-medium" htmlFor="work-session-end">
              Ended
              <Input id="work-session-end" type="datetime-local" step="1" required value={endedAt} onChange={(event) => setEndedAt(event.target.value)} />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium" htmlFor="work-session-description">
            Work description
            <textarea
              id="work-session-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="What was delivered?"
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium" htmlFor="work-session-pr">
            Pull request URL
            <Input id="work-session-pr" type="url" placeholder="https://github.com/owner/repo/pull/123" value={prUrl} onChange={(event) => setPrUrl(event.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={billable} onChange={(event) => setBillable(event.target.checked)} className="size-4 accent-accent" />
            Billable time
          </label>
          {(error || saveError) && <p role="alert" className="text-sm text-destructive">{error || saveError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{session.needsReview ? 'Save and mark reviewed' : 'Save correction'}</Button>
          </div>
        </form>
    </Modal>
  )
}
