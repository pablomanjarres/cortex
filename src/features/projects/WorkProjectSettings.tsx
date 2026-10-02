import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { WorkHoursCommand, WorkHoursState, WorkProject } from '../../../electron/work-hours-model'
import { copAmount } from './work-hours-ui'

interface WorkProjectFormProps {
  busy: boolean
  onAdd: (name: string) => Promise<boolean>
}

export function WorkProjectForm({ busy, onAdd }: WorkProjectFormProps) {
  const [name, setName] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (name.trim() && await onAdd(name.trim())) setName('')
  }
  return (
    <form onSubmit={(event) => { void submit(event) }} className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 space-y-1.5 text-sm font-medium" htmlFor="work-project-name">
        New project
        <Input id="work-project-name" placeholder="Project name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
      </label>
      <Button type="submit" variant="secondary" disabled={busy || !name.trim()}>Add project</Button>
    </form>
  )
}

interface WorkProjectSettingsProps extends WorkProjectFormProps {
  project: WorkProject
  commandError: string
  onCommand: (command: WorkHoursCommand) => Promise<WorkHoursState | null>
}

export function WorkProjectSettings({ project, busy, onAdd, commandError, onCommand }: WorkProjectSettingsProps) {
  const [name, setName] = useState(project.name)
  const [rate, setRate] = useState(project.ratePerHour === null ? '' : String(project.ratePerHour))
  const [error, setError] = useState('')

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    await onCommand({ type: 'rename-project', projectId: project.id, name: name.trim() })
  }
  async function saveRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = rate.trim() === '' ? null : Number(rate)
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setError('Enter a valid hourly rate, or leave it blank.')
      return
    }
    setError('')
    await onCommand({ type: 'set-rate', projectId: project.id, ratePerHour: amount })
  }

  return (
    <div className="space-y-5">
      <form onSubmit={(event) => { void saveName(event) }} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 space-y-1.5 text-sm font-medium" htmlFor="work-project-edit-name">
          Project name
          <Input id="work-project-edit-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
        </label>
        <Button type="submit" variant="secondary" disabled={busy || !name.trim() || name.trim() === project.name}>Save name</Button>
      </form>
      <form onSubmit={(event) => { void saveRate(event) }} className="flex flex-wrap items-end gap-2">
        <label className="w-44 space-y-1.5 text-sm font-medium" htmlFor="work-hourly-rate">
          Rate (COP/hour)
          <Input id="work-hourly-rate" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Not set" value={rate} onChange={(event) => setRate(event.target.value)} />
        </label>
        <Button type="submit" variant="secondary" disabled={busy || (rate.trim() === '' ? project.ratePerHour === null : Number(rate) === project.ratePerHour)}>Save rate</Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {project.ratePerHour === null ? 'Hourly rate not set.' : `${copAmount(project.ratePerHour)} per hour.`}
        {project.billing && ` ${project.billing.includedHours} hours included. Cycle starts on day ${project.billing.cycleDay} (${project.billing.timeZone}).`}
      </p>
      <div className="border-t border-border/70 pt-5"><WorkProjectForm busy={busy} onAdd={onAdd} /></div>
      {(error || commandError) && <p role="alert" className="text-sm text-destructive">{error || commandError}</p>}
    </div>
  )
}
