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

/** Unknown statuses written by a newer task runner read as success, as before. */
export function runStatusOf(run: Pick<AutomationRun, 'status'>): RunStatusMeta {
  return STATUS_META[run.status] ?? STATUS_META.success
}

export function timeAgo(ts: string, now = Date.now()): string {
  const diff = Math.floor((now - new Date(ts).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function fmtRunDate(ts: string): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
