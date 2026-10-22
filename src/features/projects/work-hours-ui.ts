import {
  exportWorkHoursCsv,
  exportWorkHoursMarkdown,
  type WorkEvidence,
  type WorkHoursCommand,
  type WorkHoursState,
  type WorkReport,
  type WorkSession,
} from '../../../electron/work-hours-model'

export function duration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000)
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** Round the allowance once so displayed used and remaining time add up. */
export function includedTimeDisplay(qualifyingMs: number, includedHours: number) {
  const includedMinutes = Math.max(0, Math.round(includedHours * 60))
  const usedMinutes = Math.min(includedMinutes, Math.max(0, Math.round(qualifyingMs / 60_000)))
  return {
    used: duration(usedMinutes * 60_000),
    remaining: duration((includedMinutes - usedMinutes) * 60_000),
    included: includedMinutes % 60 === 0 ? `${includedMinutes / 60}h` : duration(includedMinutes * 60_000),
  }
}

export function elapsed(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1_000)
  return `${Math.floor(seconds / 3_600)}:${String(Math.floor(seconds % 3_600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function money(amount: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(amount)
}

export function copAmount(amount: number): string {
  return `COP ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(amount)}`
}

export function dateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sendCommand(command: WorkHoursCommand): Promise<WorkHoursState> {
  const result: { ok: boolean; state?: WorkHoursState; error?: string } = window.electronAPI?.workHours
    ? await window.electronAPI.workHours.command(command)
    : await fetch('/api/work-hours/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    }).then(async (response) => response.json() as Promise<{ ok: boolean; state?: WorkHoursState; error?: string }>)
  if (!result.ok || !result.state) throw new Error(result.error || 'Project time could not be saved.')
  return result.state
}

export async function fetchEvidence(prUrl: string): Promise<WorkEvidence> {
  if (window.electronAPI?.workHours) return window.electronAPI.workHours.evidence(prUrl)
  const response = await fetch('/api/work-hours/evidence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prUrl }),
  })
  const body = await response.json() as WorkEvidence & { error?: string }
  if (!response.ok) throw new Error(body.error || 'Could not check delivery evidence.')
  return body
}

export function toggleBillableCommand(session: WorkSession): WorkHoursCommand {
  return {
    type: 'correct-session', sessionId: session.id,
    startedAt: session.startedAt, endedAt: session.endedAt,
    description: session.description, billable: !session.billable, prUrl: session.prUrl,
  }
}

export function unverifiedEvidence(prUrl: string | null): WorkEvidence {
  return {
    pr: { status: 'Not verified', number: null, title: null, url: prUrl, source: null, commit: null, checkedAt: null },
    ci: { status: 'Not verified', source: null, commit: null, checkedAt: null },
    deployment: { status: 'Not verified', source: null, commit: null, checkedAt: null },
  }
}

export function prIdentity(url: string): string {
  try {
    const parsed = new URL(url)
    const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/i.exec(parsed.pathname)
    return match && parsed.hostname.toLowerCase() === 'github.com'
      ? `github.com/${match[1].toLowerCase()}/${match[2].toLowerCase()}/pull/${Number(match[3])}`
      : `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
  } catch {
    return url
  }
}

export function isHttpsUrl(value: string): boolean {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

export function downloadReport(report: WorkReport, format: 'md' | 'csv'): void {
  const content = format === 'md' ? exportWorkHoursMarkdown(report) : exportWorkHoursCsv(report)
  const blob = new Blob([content], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const project = report.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
  link.href = url
  link.download = `${project}-work-hours-${report.createdAt.slice(0, 10)}-${report.id.slice(0, 8)}.${format}`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function chipVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'Merged' || status === 'Passed' || status === 'Deployed') return 'success'
  if (status === 'Pending' || status === 'Open') return 'warning'
  if (status === 'Failed' || status === 'Closed') return 'danger'
  return 'neutral'
}
