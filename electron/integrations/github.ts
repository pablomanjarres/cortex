const GITHUB_GRAPHQL = 'https://api.github.com/graphql'

function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Monday (local) of the week containing `d`, at local midnight. */
function mondayOfWeek(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
}

/**
 * Local midnight of `d` as an ISO timestamp WITH the machine's UTC offset
 * (e.g. 2026-07-06T00:00:00-05:00). GitHub search parses bare dates as UTC,
 * which would shift the week boundary — the explicit offset keeps "since
 * Monday" meaning the local Monday.
 */
function localMidnightISO(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T00:00:00${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
}

// Mirrors src/types/metrics.ts GitHubStats — keep the two in sync.
interface GitHubStats {
  commitsToday: number
  commitsWeek: number
  prsOpen: number
  /** PRs authored by the viewer merged since Monday (local) — matches the "(week)" label. */
  prsMergedWeek: number
  repoCount: number
  followers: number
  streak: number
  /** Real per-day commit counts for the last 30 days. */
  commitTimeline: { date: string; commits: number }[]
}

interface GraphQLError { message?: string }

interface CommitContributionNode { occurredAt: string; commitCount: number }

interface StatsQueryData {
  viewer: {
    login: string
    repositories: { totalCount: number }
    followers: { totalCount: number }
    contributionsCollection: {
      // Commit-ONLY per-day counts. The contribution calendar's
      // contributionCount is the profile-graph number (commits + issues +
      // PR opens + reviews) and must NOT be used as a commit metric.
      commitContributionsByRepository: {
        contributions: { nodes: CommitContributionNode[] }
      }[]
    }
  }
  open: { issueCount: number }
  merged: { issueCount: number }
}

/**
 * Single GraphQL POST. Throws on HTTP errors (401/403/rate-limit) and on
 * GraphQL-level errors — the refresher keeps the last snapshot in that case.
 */
async function ghGraphQL<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Cortex-Dashboard',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}: ${res.statusText}`)
  const body = await res.json() as { data?: T; errors?: GraphQLError[] }
  if (body.errors?.length) throw new Error(`GitHub GraphQL: ${body.errors[0]?.message ?? 'unknown error'}`)
  if (!body.data) throw new Error('GitHub GraphQL: empty response')
  return body.data
}

// The viewer's login is stable for a given token — fetch once per process,
// re-fetch only if the token changes (e.g. re-configured in Settings).
let cachedLogin: string | null = null
let cachedLoginToken: string | null = null

async function getLogin(token: string): Promise<string> {
  if (cachedLogin && cachedLoginToken === token) return cachedLogin
  const data = await ghGraphQL<{ viewer: { login: string } }>(token, 'query { viewer { login } }', {})
  cachedLogin = data.viewer.login
  cachedLoginToken = token
  return cachedLogin
}

const STATS_QUERY = `
query FounderStats($from: DateTime!, $to: DateTime!, $openQ: String!, $mergedQ: String!) {
  viewer {
    login
    repositories(first: 1, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) { totalCount }
    followers { totalCount }
    contributionsCollection(from: $from, to: $to) {
      commitContributionsByRepository(maxRepositories: 100) {
        contributions(first: 100) { nodes { occurredAt commitCount } }
      }
    }
  }
  open: search(type: ISSUE, query: $openQ) { issueCount }
  merged: search(type: ISSUE, query: $mergedQ) { issueCount }
}`

/**
 * ONE GraphQL POST (two on the very first call, to resolve the login) replaces
 * the old serial REST scan of ~87 repos. commitContributionsByRepository is
 * the commit-ONLY per-day source (one day-bucketed node per repo per day);
 * PR counts come from aliased searches.
 */
export async function getGitHubStats(token: string): Promise<GitHubStats> {
  const login = await getLogin(token)

  const now = new Date()
  // 30 buckets ending today (local): today - 29 days .. today
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)

  const data = await ghGraphQL<StatsQueryData>(token, STATS_QUERY, {
    from: windowStart.toISOString(),
    to: now.toISOString(),
    openQ: `is:pr author:${login} is:open`,
    mergedQ: `is:pr author:${login} is:merged merged:>=${localMidnightISO(mondayOfWeek(now))}`,
  })

  // Per-repo day-bucketed commit nodes → per-day totals (commit-only),
  // then a dense zero-filled 30-day timeline.
  const dayCounts = new Map<string, number>()
  for (const repo of data.viewer.contributionsCollection.commitContributionsByRepository) {
    for (const node of repo.contributions.nodes) {
      const key = node.occurredAt.slice(0, 10) // the day GitHub credited the commits
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + node.commitCount)
    }
  }
  const commitTimeline: { date: string; commits: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const key = localDate(d)
    commitTimeline.push({ date: key, commits: dayCounts.get(key) ?? 0 })
  }

  const commitsToday = commitTimeline[commitTimeline.length - 1]?.commits ?? 0
  const commitsWeek = commitTimeline.slice(-7).reduce((sum, d) => sum + d.commits, 0)

  // Streak — consecutive days with contributions, ending today
  let streak = 0
  for (let i = commitTimeline.length - 1; i >= 0; i--) {
    if (commitTimeline[i].commits > 0) streak++
    else break
  }

  return {
    commitsToday,
    commitsWeek,
    prsOpen: data.open.issueCount,
    prsMergedWeek: data.merged.issueCount,
    repoCount: data.viewer.repositories.totalCount,
    followers: data.viewer.followers.totalCount,
    streak,
    commitTimeline,
  }
}
