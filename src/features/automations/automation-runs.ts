import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

export interface AutomationRun {
  id: string
  taskName: string
  timestamp: string
  status: 'success' | 'error' | 'pending-approval'
  summary: string
  fullOutput: string
  approved?: boolean
}

export interface ScheduledTask {
  name: string
  description: string
}

export interface RunStatusMeta {
  icon: typeof CheckCircle2
  chip: 'success' | 'danger' | 'warning'
  text: string
  label: string
}

// Run status is a STATUS — semantic tokens only.
const STATUS_META: Record<AutomationRun['status'], RunStatusMeta> = {
  success: { icon: CheckCircle2, chip: 'success', text: 'text-success', label: 'Success' },
  error: { icon: XCircle, chip: 'danger', text: 'text-destructive', label: 'Error' },
  'pending-approval': { icon: AlertTriangle, chip: 'warning', text: 'text-warning', label: 'Pending approval' },
}

function isRunStatus(value: unknown): value is AutomationRun['status'] {
  return typeof value === 'string' && Object.hasOwn(STATUS_META, value)
}

/** Unknown statuses written by a newer task runner read as success, as before. */
export function runStatusOf(run: Pick<AutomationRun, 'status'>): RunStatusMeta {
  return STATUS_META[run.status] ?? STATUS_META.success
}

export { timeAgo } from '@/lib/date-utils'

export function fmtRunDate(ts: string): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const field = (entry: object, key: string): unknown => Reflect.get(entry, key)
const textOf = (value: unknown) => (typeof value === 'string' ? value : '')

function toRun(entry: unknown): AutomationRun | null {
  if (!entry || typeof entry !== 'object') return null
  const id = field(entry, 'id')
  const taskName = field(entry, 'taskName')
  const timestamp = field(entry, 'timestamp')
  if (typeof id !== 'string' || typeof taskName !== 'string' || typeof timestamp !== 'string') return null
  const status = field(entry, 'status')
  const approved = field(entry, 'approved')
  return {
    id,
    taskName,
    timestamp,
    // Unknown statuses already display as success; store them that way.
    status: isRunStatus(status) ? status : 'success',
    summary: textOf(field(entry, 'summary')),
    fullOutput: textOf(field(entry, 'fullOutput')),
    ...(typeof approved === 'boolean' ? { approved } : {}),
  }
}

/** Reads the stored `{ runs }` log, dropping entries that cannot be displayed. */
export function parseRunLog(value: unknown): AutomationRun[] {
  if (!value || typeof value !== 'object') return []
  const runs = field(value, 'runs')
  if (!Array.isArray(runs)) return []
  return runs.map(toRun).filter((run): run is AutomationRun => run !== null)
}

export function parseScheduledTasks(value: unknown): ScheduledTask[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return []
    const name = field(entry, 'name')
    return typeof name === 'string' ? [{ name, description: textOf(field(entry, 'description')) }] : []
  })
}
