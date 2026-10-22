import { type WorkEvidence, type WorkEvidenceFact, type WorkHoursState, type WorkReport, type WorkReportRow, type ReportSelection, iso, id, project, currentValues } from './work-hours-types.js'
import { chargeableWork } from './work-hours-billing.js'

function copyEvidence(evidence: WorkEvidence): WorkEvidence {
  const fact = <Status extends string>(value: WorkEvidenceFact<Status>): WorkEvidenceFact<Status> => ({
    status: value.status,
    source: value.source,
    commit: value.commit,
    checkedAt: value.checkedAt,
  })
  return {
    pr: {
      ...fact(evidence.pr),
      number: evidence.pr.number,
      title: evidence.pr.title,
      url: evidence.pr.url,
    },
    ci: { ...fact(evidence.ci), tests: evidence.ci.tests ?? 'Not verified', build: evidence.ci.build ?? 'Not verified' },
    deployment: fact(evidence.deployment),
  }
}

function prIdentity(value: string): string {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:') throw new Error('Invalid PR URL')
  const path = parsed.pathname.replace(/\/+$/, '')
  const githubPr = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/i.exec(path)
  if (githubPr) return `${parsed.origin}/${githubPr[1].toLowerCase()}/${githubPr[2].toLowerCase()}/pull/${Number(githubPr[3])}`
  return `${parsed.origin}${path}`
}

export function createWorkHoursReport(state: WorkHoursState, selection: ReportSelection, evidence: WorkEvidence, now: string): WorkReport {
  const selectedProject = project(state, selection.projectId)
  const charges = chargeableWork(state, selectedProject)
  const reportId = id(selection.id)
  const task = selection.task.trim()
  if (!task) throw new Error('Report task is required')
  if (selection.sessionIds.length === 0) throw new Error('Select at least one session')
  if (new Set(selection.sessionIds).size !== selection.sessionIds.length) throw new Error('Duplicate session selection')
  const rows = selection.sessionIds.map((sessionId): WorkReportRow => {
    const row = state.sessions.find((entry) => entry.id === sessionId)
    if (!row || row.projectId !== selectedProject.id) throw new Error('Selected session not found for project')
    if (row.needsReview) throw new Error('Interrupted session requires review')
    return { ...currentValues(row), id: row.id, durationMs: row.durationMs, ...(selectedProject.billing ? { chargeableMs: charges.get(row.id) ?? 0 } : {}) }
  })
  const attachedPrs = new Set(rows.flatMap((row) => row.prUrl === null ? [] : [prIdentity(row.prUrl)]))
  if (attachedPrs.size > 1) throw new Error('Selected sessions have conflicting PR URLs')
  const attachedPr = attachedPrs.values().next().value as string | undefined
  if (attachedPr && evidence.pr.url && prIdentity(evidence.pr.url) !== attachedPr) {
    throw new Error('Evidence belongs to a different PR')
  }
  const totalMs = rows.reduce((sum, row) => sum + row.durationMs, 0)
  const billableMs = rows.reduce((sum, row) => sum + (row.billable ? row.durationMs : 0), 0)
  const chargeableMs = rows.reduce((sum, row) => sum + (row.chargeableMs ?? (row.billable ? row.durationMs : 0)), 0)
  return {
    id: reportId,
    projectId: selectedProject.id,
    projectName: selectedProject.name,
    createdAt: iso(now),
    task,
    rows,
    totalMs,
    billableMs,
    ...(selectedProject.billing ? { chargeableMs } : {}),
    ratePerHour: selectedProject.ratePerHour,
    currency: selectedProject.currency,
    amount: selectedProject.ratePerHour === null ? null : chargeableMs / 3_600_000 * selectedProject.ratePerHour,
    evidence: copyEvidence(evidence),
  }
}
