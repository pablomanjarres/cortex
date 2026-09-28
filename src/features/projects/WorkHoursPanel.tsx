import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Clock3, CalendarDays, CalendarRange, Play, Square } from 'lucide-react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import {
  emptyWorkHoursState,
  workHoursTotals,
  type WorkHoursCommand,
  type WorkHoursState,
  type WorkSession,
  type WorkSessionValues,
} from '../../../electron/work-hours-model'
import { WorkSessionEditor } from './WorkSessionEditor'
import { WorkSessionHistory } from './WorkSessionHistory'
import { WorkHoursReportPanel } from './WorkHoursReportPanel'
import { duration, elapsed, fetchEvidence, money, newId, sendCommand, toggleBillableCommand } from './work-hours-ui'

export function WorkHoursPanel() {
  const [storedState] = useStore<WorkHoursState | null>('cortex-project-time', null)
  const [committedState, setCommittedState] = useState<WorkHoursState | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [projectName, setProjectName] = useState('')
  const [rateEdit, setRateEdit] = useState<{ projectId: string; value: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const busyRef = useRef(false)

  useEffect(() => {
    // The store subscription also receives edits made from the native menu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (storedState) setCommittedState(storedState)
  }, [storedState])

  const state = committedState ?? storedState ?? emptyWorkHoursState()
  const projectId = state.projects.some((entry) => entry.id === selectedId)
    ? selectedId
    : state.active?.projectId ?? state.projects[0]?.id ?? ''
  const project = state.projects.find((entry) => entry.id === projectId) ?? null
  const rateDraft = rateEdit?.projectId === projectId ? rateEdit.value : project?.ratePerHour == null ? '' : String(project.ratePerHour)
  const editing = state.sessions.find((entry) => entry.id === editingId) ?? null
  const sessions = state.sessions.filter((entry) => entry.projectId === projectId).slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const active = state.active
  const isTracking = Boolean(active)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), isTracking ? 1_000 : 60_000)
    return () => window.clearInterval(timer)
  }, [isTracking])
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const totals = project ? workHoursTotals(state, project.id, new Date(now).toISOString(), timeZone) : null
  const activeElapsed = active ? Math.max(0, now - Date.parse(active.startedAt)) : 0

  async function command(value: WorkHoursCommand): Promise<WorkHoursState | null> {
    if (busyRef.current) return null
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const next = await sendCommand(value)
      setCommittedState(next)
      return next
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project time could not be saved.')
      return null
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectName.trim()) return
    const id = newId()
    if (await command({ type: 'add-project', id, name: projectName.trim() })) {
      setProjectName('')
      setSelectedId(id)
    }
  }

  async function saveRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!project) return
    const rate = rateDraft.trim() === '' ? null : Number(rateDraft)
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
      setError('Enter a valid hourly rate, or leave it blank.')
      return
    }
    if (await command({ type: 'set-rate', projectId: project.id, ratePerHour: rate })) setRateEdit(null)
  }

  async function saveSession(session: WorkSession, values: WorkSessionValues): Promise<boolean> {
    const corrected = await command({ type: 'correct-session', sessionId: session.id, ...values })
    if (!corrected) return false
    if (session.needsReview) return Boolean(await command({ type: 'review-session', sessionId: session.id }))
    return true
  }

  return (
    <section aria-label="Project time" className="space-y-4">
      <WidgetCard title="Project time" description="Track each interval yourself. Review saved work before including it in a client report.">
        <form onSubmit={(event) => { void addProject(event) }} className="flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1 space-y-1.5 text-sm font-medium" htmlFor="work-project-name">
            New project
            <Input id="work-project-name" placeholder="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={120} />
          </label>
          <Button type="submit" variant="secondary" disabled={busy || !projectName.trim()}>Add project</Button>
        </form>

        {project ? (
          <div className="mt-5 space-y-5 border-t border-border/70 pt-5">
            <h4 className="text-base font-semibold">{project.name}</h4>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="min-w-48 flex-1 space-y-1.5 text-sm font-medium" htmlFor="work-project-select">
                Project
                <select
                  id="work-project-select"
                  value={projectId}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {state.projects.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {active ? (
                  <>
                    {active.projectId !== project.id && (
                      <Button type="button" onClick={() => { void command({ type: 'switch', id: newId(), projectId: project.id }) }} disabled={busy}>
                        <Play /> Switch to {project.name}
                      </Button>
                    )}
                    <Button type="button" variant="secondary" onClick={() => { void command({ type: 'stop' }) }} disabled={busy}><Square /> Stop</Button>
                  </>
                ) : (
                  <Button type="button" onClick={() => { void command({ type: 'start', id: newId(), projectId: project.id }) }} disabled={busy}><Play /> Start</Button>
                )}
              </div>
            </div>

            <div aria-live="polite" className="flex flex-wrap items-center gap-2 text-sm">
              <Chip variant={active ? 'success' : 'neutral'}>{active ? 'Tracking' : 'Stopped'}</Chip>
              {active && <span>Working on <strong>{state.projects.find((entry) => entry.id === active.projectId)?.name ?? 'Unknown project'}</strong> for <span className="font-mono tabular-nums">{elapsed(activeElapsed)}</span></span>}
              {active?.interrupted && <Chip variant="warning">Needs review</Chip>}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile label="Today" value={duration(totals?.todayMs ?? 0)} icon={<Clock3 />} className="p-4" />
              <StatTile label="This month" value={duration(totals?.monthMs ?? 0)} icon={<CalendarDays />} className="p-4" />
              <StatTile label="All time" value={duration(totals?.totalMs ?? 0)} icon={<CalendarRange />} className="p-4" />
            </div>

            <form onSubmit={(event) => { void saveRate(event) }} className="flex flex-wrap items-end gap-2">
              <label className="w-44 space-y-1.5 text-sm font-medium" htmlFor="work-hourly-rate">
                Rate (COP/hour)
                <Input id="work-hourly-rate" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Not set" value={rateDraft} onChange={(event) => setRateEdit({ projectId: project.id, value: event.target.value })} />
              </label>
              <Button type="submit" variant="secondary" disabled={busy || (rateDraft.trim() === '' ? project.ratePerHour === null : Number(rateDraft) === project.ratePerHour)}>Save rate</Button>
              <p className="pb-2 text-xs text-muted-foreground">{project.ratePerHour === null ? 'Tracking works without a rate.' : `${money(project.ratePerHour)} per hour`}</p>
            </form>
          </div>
        ) : (
          <EmptyState message="No time projects yet." hint="Add a project to start recording work." className="py-5" />
        )}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </WidgetCard>

      {project && (
        <>
          <WorkSessionHistory sessions={sessions} busy={busy} onToggleBillable={(session) => { void command(toggleBillableCommand(session)) }} onEdit={setEditingId} />
          <WorkHoursReportPanel
            key={project.id}
            project={project}
            sessions={sessions}
            reports={state.reports}
            busy={busy}
            commandError={error}
            onEvidence={fetchEvidence}
            onFinalize={async (sessionIds, task, evidence) => Boolean(await command({
              type: 'finalize-report', id: newId(), projectId: project.id, sessionIds, task, evidence,
            }))}
          />
        </>
      )}

      {editing && <WorkSessionEditor key={editing.id} session={editing} busy={busy} saveError={error} onClose={() => setEditingId(null)} onSave={saveSession} />}
    </section>
  )
}
