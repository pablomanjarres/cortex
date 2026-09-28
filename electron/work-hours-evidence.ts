import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { WorkEvidence } from './work-hours-model.js'

const execFileAsync = promisify(execFile)
const GH_TIMEOUT_MS = 10_000

export interface GitHubEvidenceInput {
  pr: unknown
  deployments: unknown
  statusesByDeploymentId: Record<string, unknown>
}

export interface GitHubPrRef {
  owner: string
  repo: string
  number: number
  url: string
}

export function parseGitHubPrUrl(prUrl: string): GitHubPrRef {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]+)\/pull\/([1-9]\d*)\/?$/i.exec(prUrl)
  const number = Number(match?.[3])
  if (!match || !Number.isSafeInteger(number)) throw new TypeError('Expected a GitHub PR URL with a positive pull number')
  return { owner: match[1], repo: match[2], number, url: `https://github.com/${match[1]}/${match[2]}/pull/${number}` }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function checkState(check: unknown): 'Passed' | 'Failed' | 'Pending' | 'Not verified' {
  const value = record(check)
  if (value.__typename === 'CheckRun') {
    if (value.status === 'COMPLETED' && value.conclusion === 'SUCCESS') return 'Passed'
    if (value.status === 'COMPLETED' && ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(String(value.conclusion))) return 'Failed'
    if (['QUEUED', 'IN_PROGRESS', 'WAITING', 'PENDING', 'REQUESTED'].includes(String(value.status))) return 'Pending'
  }
  if (value.__typename === 'StatusContext') {
    if (value.state === 'SUCCESS') return 'Passed'
    if (['FAILURE', 'ERROR'].includes(String(value.state))) return 'Failed'
    if (value.state === 'PENDING') return 'Pending'
  }
  return 'Not verified'
}

function ciStatus(checks: unknown): 'Passed' | 'Failed' | 'Pending' | 'Not verified' {
  if (!Array.isArray(checks) || checks.length === 0) return 'Not verified'
  const statuses = checks.map(checkState)
  if (statuses.includes('Failed')) return 'Failed'
  if (statuses.includes('Pending')) return 'Pending'
  if (statuses.every(status => status === 'Passed')) return 'Passed'
  return 'Not verified'
}

function namedCheckStatus(checks: unknown, pattern: RegExp): 'Passed' | 'Failed' | 'Pending' | 'Not verified' {
  if (!Array.isArray(checks)) return 'Not verified'
  return ciStatus(checks.filter((check) => {
    const value = record(check)
    return pattern.test(text(value.name) ?? text(value.context) ?? '')
  }))
}

function latestProductionDeployment(deployments: unknown, commit: string | null): Record<string, unknown> | null {
  if (!commit || !Array.isArray(deployments)) return null
  return deployments
    .map(record)
    .filter(item => item.sha === commit && text(item.environment)?.toLowerCase() === 'production' && Number.isSafeInteger(item.id))
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) || Number(b.id) - Number(a.id))[0] ?? null
}

function latestStatus(statuses: unknown): Record<string, unknown> | null {
  if (!Array.isArray(statuses)) return null
  return statuses
    .map(record)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) || Number(b.id ?? 0) - Number(a.id ?? 0))[0] ?? null
}

export function parseWorkHoursEvidence(input: GitHubEvidenceInput, checkedAt: string): WorkEvidence {
  const pr = record(input.pr)
  const commit = text(pr.headRefOid)
  const url = text(pr.url)
  const number = Number.isSafeInteger(pr.number) && (pr.number as number) > 0 ? pr.number as number : null
  const status = pr.mergedAt || pr.state === 'MERGED' ? 'Merged' : pr.state === 'OPEN' ? 'Open' : pr.state === 'CLOSED' ? 'Closed' : 'Not verified'
  const deploymentCommit = status === 'Merged' ? text(record(pr.mergeCommit).oid) : commit
  const ci = ciStatus(pr.statusCheckRollup)
  const ciSource = ci !== 'Not verified' && commit && url && /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[1-9]\d*\/?$/.test(url)
    ? url.replace(/\/pull\/[1-9]\d*\/?$/, `/commit/${commit}/checks`)
    : null
  const deployment = latestProductionDeployment(input.deployments, deploymentCommit)
  const deploymentStatus = deployment ? latestStatus(input.statusesByDeploymentId[String(deployment.id)]) : null
  const deploymentSource = text(deploymentStatus?.url)

  return {
    pr: { status, number, title: text(pr.title), url, source: url, commit, checkedAt },
    ci: {
      status: ci,
      tests: namedCheckStatus(pr.statusCheckRollup, /test|prueba|coverage|cobertura|spec|e2e|integration/i),
      build: namedCheckStatus(pr.statusCheckRollup, /build|compil|bundl|package|webpack|vite/i),
      source: ciSource, commit, checkedAt,
    },
    deployment: { status: deploymentStatus?.state === 'success' && deploymentSource ? 'Deployed' : 'Not verified', source: deploymentSource, commit: deploymentCommit, checkedAt },
  }
}

async function ghJson(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync('gh', args, {
    timeout: GH_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || '/usr/bin:/bin'].join(':'),
      GH_PROMPT_DISABLED: '1',
      GIT_TERMINAL_PROMPT: '0',
    },
  })
  return JSON.parse(stdout)
}

function unavailableEvidence(ref: GitHubPrRef, checkedAt: string): WorkEvidence {
  return {
    pr: { status: 'Unavailable', number: ref.number, title: null, url: ref.url, source: ref.url, commit: null, checkedAt },
    ci: { status: 'Unavailable', tests: 'Unavailable', build: 'Unavailable', source: null, commit: null, checkedAt },
    deployment: { status: 'Unavailable', source: null, commit: null, checkedAt },
  }
}

/** Read PR, check, and exact-commit production status without changing the ledger. */
export async function fetchWorkHoursEvidence(prUrl: string): Promise<WorkEvidence> {
  const ref = parseGitHubPrUrl(prUrl)
  let pr: unknown
  try {
    pr = await ghJson([
      'pr', 'view', String(ref.number), '--repo', `${ref.owner}/${ref.repo}`,
      '--json', 'number,title,url,state,mergedAt,headRefOid,mergeCommit,statusCheckRollup',
    ])
    const actual = parseGitHubPrUrl(String(record(pr).url ?? ''))
    if (actual.owner.toLowerCase() !== ref.owner.toLowerCase() || actual.repo.toLowerCase() !== ref.repo.toLowerCase() || actual.number !== ref.number) {
      throw new Error('GitHub returned a different PR')
    }
  } catch {
    return unavailableEvidence(ref, new Date().toISOString())
  }

  const input: GitHubEvidenceInput = { pr, deployments: [], statusesByDeploymentId: {} }
  const initial = parseWorkHoursEvidence(input, new Date().toISOString())
  const sha = initial.deployment.commit
  if (!sha || !/^[0-9a-f]{40,64}$/i.test(sha)) return initial

  try {
    const deployments = await ghJson([
      'api', '--hostname', 'github.com',
      `repos/${ref.owner}/${ref.repo}/deployments?sha=${sha}&per_page=100`,
    ])
    if (!Array.isArray(deployments)) throw new Error('Invalid deployment response')
    input.deployments = deployments
    const latest = latestProductionDeployment(deployments, sha)
    if (latest) {
      const id = latest.id as number
      const statuses = await ghJson([
        'api', '--hostname', 'github.com',
        `repos/${ref.owner}/${ref.repo}/deployments/${id}/statuses?per_page=100`,
      ])
      if (!Array.isArray(statuses)) throw new Error('Invalid deployment status response')
      input.statusesByDeploymentId[String(id)] = statuses
    }
    return parseWorkHoursEvidence(input, new Date().toISOString())
  } catch {
    const checkedAt = new Date().toISOString()
    const evidence = parseWorkHoursEvidence({ pr, deployments: [], statusesByDeploymentId: {} }, checkedAt)
    evidence.deployment = { ...evidence.deployment, status: 'Unavailable' }
    return evidence
  }
}
