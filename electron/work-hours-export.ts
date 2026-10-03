import type { WorkEvidence, WorkReport, WorkReportRow } from './work-hours-types.js'
import { billableSessions } from './work-hours-billing.js'

function formatDuration(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor(milliseconds % 3_600_000 / 60_000)
  const seconds = milliseconds % 60_000 / 1_000
  return `${hours}h ${minutes}m${seconds ? ` ${Number(seconds.toFixed(3))}s` : ''}`
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
}

function billingText(report: WorkReport, durationMs: number): string {
  if (report.ratePerHour === null) return 'Rate not set'
  return `${formatMoney(durationMs / 3_600_000 * report.ratePerHour, report.currency)} at ${formatMoney(report.ratePerHour, report.currency)}/h`
}

function safeUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function evidenceText(report: WorkReport, kind: keyof WorkEvidence, row: WorkReportRow): string {
  const evidence = report.evidence[kind]
  const details: string[] = [evidence.status === 'Unavailable' ? 'Not verified' : evidence.status]
  if (kind === 'pr') {
    const pr = report.evidence.pr
    if (pr.number !== null) details.push(`PR #${pr.number}`)
    if (pr.title) details.push(pr.title)
    const url = safeUrl(pr.url) ?? safeUrl(row.prUrl)
    if (url) details.push(url)
  }
  if (kind === 'ci') {
    const ci = report.evidence.ci
    const publicStatus = (status: string | undefined) => !status || status === 'Unavailable' ? 'Not verified' : status
    details.push(`Tests: ${publicStatus(ci.tests)}; Build: ${publicStatus(ci.build)}`)
  }
  if (evidence.commit) details.push(`commit ${evidence.commit}`)
  if (evidence.checkedAt) details.push(`checked ${evidence.checkedAt}`)
  const source = safeUrl(evidence.source)
  if (source && !(kind === 'pr' && source === safeUrl(report.evidence.pr.url))) details.push(`source ${source}`)
  return details.join(' — ')
}

function markdownCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')
}

function csvCell(value: string): string {
  const plain = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safe = /^[\s]*[=+\-@]/.test(plain) ? `'${plain}` : plain
  return `"${safe.replace(/"/g, '""')}"`
}

export function exportWorkHoursMarkdown(report: WorkReport): string {
  const lines = [
    `# ${markdownCell(report.task)}`,
    '',
    '| Task | Time | PR | CI | Deployment | Billing |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  const rows = billableSessions(report.rows)
  for (const row of rows) {
    const cells = [
      row.description || report.task,
      `Billable ${formatDuration(row.durationMs)}`,
      evidenceText(report, 'pr', row),
      evidenceText(report, 'ci', row),
      evidenceText(report, 'deployment', row),
      billingText(report, row.chargeableMs ?? (row.billable ? row.durationMs : 0)),
    ]
    lines.push(`| ${cells.map(markdownCell).join(' | ')} |`)
  }
  const billableMs = rows.reduce((sum, row) => sum + row.durationMs, 0)
  lines.push('', `Total billable: ${formatDuration(billableMs)}`, `Billing: ${report.amount === null ? 'Rate not set' : formatMoney(report.amount, report.currency)}`)
  return `${lines.join('\n')}\n`
}

export function exportWorkHoursCsv(report: WorkReport): string {
  const lines = ['Task,Time,PR,CI,Deployment,Billing']
  for (const row of billableSessions(report.rows)) {
    const cells = [
      row.description || report.task,
      `Billable ${formatDuration(row.durationMs)}`,
      evidenceText(report, 'pr', row),
      evidenceText(report, 'ci', row),
      evidenceText(report, 'deployment', row),
      billingText(report, row.chargeableMs ?? (row.billable ? row.durationMs : 0)),
    ]
    lines.push(cells.map(csvCell).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}
