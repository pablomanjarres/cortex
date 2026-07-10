const GITHUB_GRAPHQL = 'https://api.github.com/graphql'

function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Monday (local) of the week containing `d`, as YYYY-MM-DD. */
function mondayOfWeek(d: Date = new Date()): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  return localDate(monday)
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
  /** Real per-day commit counts for the last 30 days, from the contribution calendar. */
  commitTimeline: { date: string; commits: number }[]
}

interface GraphQLError { message?: string }

interface ContributionDay { date: string; contributionCount: number }

interface StatsQueryData {
  viewer: {
    login: string
    repositories: { totalCount: number }
    followers: { totalCount: number }
    contributionsCollection: {
      totalCommitContributions: number
      contributionCalendar: { weeks: { contributionDays: ContributionDay[] }[] }
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
      totalCommitContributions
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
  open: search(type: ISSUE, query: $openQ) { issueCount }
  merged: search(type: ISSUE, query: $mergedQ) { issueCount }
}`

/**
 * ONE GraphQL POST (two on the very first call, to resolve the login) replaces
 * the old serial REST scan of ~87 repos. The contribution calendar is the
 * authoritative per-day commit source; PR counts come from aliased searches.
 */
export async function getGitHubStats(token: string): Promise<GitHubStats> {
  const login = await getLogin(token)

  const now = new Date()
  // 30 buckets ending today (local): today - 29 days .. today
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
  const weekStartStr = mondayOfWeek(now)

  const data = await ghGraphQL<StatsQueryData>(token, STATS_QUERY, {
    from: windowStart.toISOString(),
    to: now.toISOString(),
    openQ: `is:pr author:${login} is:open`,
    mergedQ: `is:pr author:${login} is:merged merged:>=${weekStartStr}`,
  })

  // Calendar days → dense 30-day timeline (zero-filled)
  const dayCounts = new Map<string, number>()
  for (const week of data.viewer.contributionsCollection.contributionCalendar.weeks) {
    for (const day of week.contributionDays) dayCounts.set(day.date, day.contributionCount)
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
