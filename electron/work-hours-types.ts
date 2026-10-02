export interface WorkProject {
  id: string
  name: string
  ratePerHour: number | null
  currency: 'COP'
}

export interface ActiveWork {
  id: string
  projectId: string
  startedAt: string
  interrupted: boolean
}

export interface WorkSessionValues {
  startedAt: string
  endedAt: string
  description: string
  billable: boolean
  prUrl: string | null
}

export interface WorkSessionCorrection {
  correctedAt: string
  before: WorkSessionValues
  after: WorkSessionValues
}

export interface WorkSession extends WorkSessionValues {
  id: string
  projectId: string
  durationMs: number
  needsReview: boolean
  corrections: WorkSessionCorrection[]
}

export interface WorkEvidenceFact<Status extends string> {
  status: Status
  source: string | null
  commit: string | null
  checkedAt: string | null
}

export type WorkCiStatus = 'Passed' | 'Failed' | 'Pending' | 'Not verified' | 'Unavailable'

export interface WorkEvidence {
  pr: WorkEvidenceFact<'Open' | 'Merged' | 'Closed' | 'Not verified' | 'Unavailable'> & {
    number: number | null
    title: string | null
    url: string | null
  }
  ci: WorkEvidenceFact<WorkCiStatus> & { tests?: WorkCiStatus; build?: WorkCiStatus }
  deployment: WorkEvidenceFact<'Deployed' | 'Failed' | 'Pending' | 'Not verified' | 'Unavailable'>
}

export interface ReportSelection {
  id: string
  projectId: string
  sessionIds: string[]
  task: string
}

export interface WorkReportRow extends WorkSessionValues {
  id: string
  durationMs: number
}

export interface WorkReport {
  id: string
  projectId: string
  projectName: string
  createdAt: string
  task: string
  rows: WorkReportRow[]
  totalMs: number
  billableMs: number
  ratePerHour: number | null
  currency: 'COP'
  amount: number | null
  evidence: WorkEvidence
}

export interface WorkHoursState {
  projects: WorkProject[]
  active: ActiveWork | null
  sessions: WorkSession[]
  reports: WorkReport[]
}

export type WorkHoursCommand =
  | { type: 'add-project'; id: string; name: string }
  | { type: 'rename-project'; projectId: string; name: string }
  | { type: 'set-rate'; projectId: string; ratePerHour: number | null }
  | { type: 'start'; id: string; projectId: string }
  | { type: 'start-owned-at'; id: string; projectId: string; startedAt: string }
  | { type: 'switch'; id: string; projectId: string }
  | { type: 'stop' }
  | { type: 'stop-owned'; id: string }
  | { type: 'stop-owned-at'; id: string; endedAt: string }
  | { type: 'attach-deliverable'; id: string; prUrl: string; description: string }
  | { type: 'correct-session'; sessionId: string; startedAt: string; endedAt: string; description: string; billable: boolean; prUrl: string | null }
  | { type: 'review-session'; sessionId: string }
  | { type: 'mark-interrupted' }
  | { type: 'finalize-report'; id: string; projectId: string; sessionIds: string[]; task: string; evidence: WorkEvidence }

export function emptyWorkHoursState(): WorkHoursState {
  return { projects: [], active: null, sessions: [], reports: [] }
}

export function iso(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('Invalid timestamp')
  }
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) throw new Error('Invalid timestamp')
  return new Date(milliseconds).toISOString()
}

export function id(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) throw new Error('Invalid ID')
  return value
}

export function project(state: WorkHoursState, projectId: string): WorkProject {
  const found = state.projects.find((entry) => entry.id === projectId)
  if (!found) throw new Error('Project not found')
  return found
}

export function currentValues(row: WorkSession): WorkSessionValues {
  return {
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    description: row.description,
    billable: row.billable,
    prUrl: row.prUrl,
  }
}
