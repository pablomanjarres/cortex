import { useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import {
  type WorkEvidence,
  type WorkProject,
  type WorkReport,
  type WorkSession,
} from '../../../electron/work-hours-model'
import { chipVariant, dateTime, downloadReport, duration, isHttpsUrl, money, prIdentity, unverifiedEvidence } from './work-hours-ui'

interface WorkHoursReportPanelProps {
  project: WorkProject
  sessions: WorkSession[]
  reports: WorkReport[]
  busy: boolean
  commandError: string
  onEvidence: (prUrl: string) => Promise<WorkEvidence>
  onFinalize: (sessionIds: string[], task: string, evidence: WorkEvidence) => Promise<boolean>
}

export function WorkHoursReportPanel({ project, sessions, reports, busy, commandError, onEvidence, onFinalize }: WorkHoursReportPanelProps) {
  const [from, setFrom] = useState('')
  const [through, setThrough] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [task, setTask] = useState('')
  const [prUrl, setPrUrl] = useState('')
  const [evidence, setEvidence] = useState<WorkEvidence | null>(null)
  const [evidenceFor, setEvidenceFor] = useState('')
  const [loadingEvidence, setLoadingEvidence] = useState(false)
  const [error, setError] = useState('')

  const invalidRange = Boolean(from && through && from > through)
  const eligible = useMemo(() => {
    const start = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity
    const endDate = through ? new Date(`${through}T00:00:00`) : null
    endDate?.setDate(endDate.getDate() + 1)
    const end = endDate?.getTime() ?? Infinity
    return sessions.filter((row) => !row.needsReview && Date.parse(row.endedAt) > start && Date.parse(row.startedAt) < end)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }, [sessions, from, through])
  const selectedRows = eligible.filter((row) => selected.includes(row.id))
  const attachedUrls = [...new Map(selectedRows.flatMap((row) => row.prUrl ? [[prIdentity(row.prUrl), row.prUrl] as const] : [])).values()]
  const prConflict = attachedUrls.length > 1 || Boolean(prUrl.trim() && attachedUrls.length === 1 && prIdentity(prUrl.trim()) !== prIdentity(attachedUrls[0]))
  const chosenPr = prUrl.trim() || attachedUrls[0] || ''
  const invalidPr = Boolean(chosenPr) && !isHttpsUrl(chosenPr)
  const currentEvidence = evidence && evidenceFor === chosenPr ? evidence : unverifiedEvidence(chosenPr || null)
  const billableMs = selectedRows.reduce((sum, row) => sum + (row.billable ? row.durationMs : 0), 0)
  const workedMs = selectedRows.reduce((sum, row) => sum + row.durationMs, 0)
  const projectReports = reports.filter((report) => report.projectId === project.id).slice().reverse()

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])
  }

  async function refreshEvidence() {
    if (!chosenPr || invalidPr || prConflict || loadingEvidence) return
    setLoadingEvidence(true)
    setError('')
    try {
      const result = await onEvidence(chosenPr)
      setEvidence(result)
      setEvidenceFor(chosenPr)
    } catch (cause) {
      setEvidence(null)
      setEvidenceFor('')
      setError(cause instanceof Error ? cause.message : 'Could not check this PR.')
    } finally {
      setLoadingEvidence(false)
    }
  }

  async function finalize() {
    if (busy || loadingEvidence || invalidRange || invalidPr || prConflict || selectedRows.length === 0 || !task.trim()) return
    setError('')
    if (await onFinalize(selectedRows.map((row) => row.id), task.trim(), currentEvidence)) {
      setSelected([])
      setTask('')
      setPrUrl('')
      setEvidence(null)
      setEvidenceFor('')
    }
  }

  return (
    <WidgetCard title="Client reports" description="Choose reviewed sessions, check delivery evidence, then save a fixed report snapshot.">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium" htmlFor="report-from">
          From
          <Input id="report-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm font-medium" htmlFor="report-through">
          Through
          <Input id="report-through" type="date" value={through} onChange={(event) => setThrough(event.target.value)} />
        </label>
      </div>
      {invalidRange && <p role="alert" className="mt-2 text-sm text-destructive">The end date must be on or after the start date.</p>}
      <p className="mt-2 text-xs text-muted-foreground">Sessions overlapping the dates are included at their full duration. Review any interrupted session in the history first.</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Select sessions</h4>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(eligible.map((row) => row.id))} disabled={eligible.length === 0}>Select all shown</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])} disabled={selected.length === 0}>Clear</Button>
        </div>
      </div>
      {eligible.length === 0 ? (
        <EmptyState message="No reviewed sessions in this range." hint="Stop a timer or review an interrupted session to make it available." className="py-5" />
      ) : (
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-md border border-border/70 p-1">
          {eligible.map((row) => (
            <label key={row.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary/50">
              <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={`Include session from ${dateTime(row.startedAt)}`} className="size-4 shrink-0 accent-accent" />
              <span className="min-w-0 flex-1 truncate text-sm">{row.description || 'Untitled work session'}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{duration(row.durationMs)}</span>
              {!row.billable && <Chip size="sm">Nonbillable</Chip>}
            </label>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium" htmlFor="report-task">
          Delivered task
          <Input id="report-task" value={task} onChange={(event) => setTask(event.target.value)} placeholder="What was delivered?" />
        </label>
        <label className="space-y-1.5 text-sm font-medium" htmlFor="report-pr">
          PR URL for evidence
          <Input id="report-pr" type="url" value={prUrl} onChange={(event) => setPrUrl(event.target.value)} placeholder={attachedUrls[0] || 'https://github.com/owner/repo/pull/123'} />
        </label>
      </div>
      {prConflict && <p role="alert" className="mt-2 text-sm text-destructive">Selected sessions reference different PRs. Correct the links or choose one deliverable.</p>}
      {invalidPr && <p role="alert" className="mt-2 text-sm text-destructive">Enter an HTTPS pull request URL.</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="secondary" onClick={() => { void refreshEvidence() }} disabled={!chosenPr || invalidPr || prConflict || loadingEvidence}>
          <RefreshCw className={loadingEvidence ? 'animate-spin' : ''} /> {loadingEvidence ? 'Checking…' : 'Refresh evidence'}
        </Button>
        {currentEvidence.pr.checkedAt && <span className="text-xs text-muted-foreground">Checked {dateTime(currentEvidence.pr.checkedAt)}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Delivery evidence">
        {([['PR', currentEvidence.pr], ['CI checks', currentEvidence.ci], ['Production', currentEvidence.deployment]] as const).map(([label, fact]) => (
          <Chip key={label} variant={chipVariant(fact.status)}>{label}: {fact.status}</Chip>
        ))}
      </div>
      {currentEvidence.pr.title && <p className="mt-2 text-xs text-muted-foreground">PR #{currentEvidence.pr.number}: {currentEvidence.pr.title}</p>}
      {currentEvidence.ci.commit && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Checked commit {currentEvidence.ci.commit}</p>}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-border/70 pt-4">
        <div className="text-sm text-muted-foreground">
          <p>Selected: <span className="font-mono text-foreground">{selectedRows.length}</span> · Worked <span className="font-mono text-foreground">{duration(workedMs)}</span> · Billable <span className="font-mono text-foreground">{duration(billableMs)}</span></p>
          <p className="mt-1">Billing: <span className="font-mono text-foreground">{project.ratePerHour === null ? 'Rate not set' : money(billableMs / 3_600_000 * project.ratePerHour)}</span></p>
        </div>
        <Button type="button" onClick={() => { void finalize() }} disabled={busy || loadingEvidence || invalidRange || invalidPr || prConflict || selectedRows.length === 0 || !task.trim()}>
          Finalize report
        </Button>
      </div>
      {(error || commandError) && <p role="alert" className="mt-2 text-sm text-destructive">{error || commandError}</p>}

      <div className="mt-6 border-t border-border/70 pt-4">
        <h4 className="text-sm font-semibold">Finalized reports</h4>
        {projectReports.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No reports saved for this project.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {projectReports.map((report) => (
              <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{report.task}</p>
                  <p className="text-xs text-muted-foreground">{dateTime(report.createdAt)} · {duration(report.billableMs)} billable · {report.amount === null ? 'Rate not set' : money(report.amount)}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button type="button" variant="secondary" size="sm" onClick={() => downloadReport(report, 'md')}><Download /> Markdown</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => downloadReport(report, 'csv')}><Download /> CSV</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </WidgetCard>
  )
}
