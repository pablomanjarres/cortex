export interface GitHubStats {
  commitsToday: number
  commitsWeek: number
  prsOpen: number
  /** PRs authored by the viewer merged since Monday (local) — matches the "(week)" label. */
  prsMergedWeek: number
  repoCount: number
  followers: number
  streak: number
  /** Real per-day commit counts for the last 30 days, from the contribution calendar. */
  commitTimeline?: { date: string; commits: number }[]
}

export interface LemonStats {
  mrr: number
  totalCustomers: number
  newThisMonth: number
  churnedThisMonth: number
  revenueThisMonth: number
}

export interface VercelStats {
  deploymentsToday: number
  deploymentsWeek: number
  latestDeployment: { state: string; url: string; createdAt: string } | null
  pageviews: number | null
  visitors: number | null
}

export interface SupabaseStats {
  totalUsers: number
  signupsToday: number
  signupsWeek: number
  /** Cumulative total users by actual signup date (real cohort curve, 180d). */
  signupTimeline?: { date: string; users: number }[]
}
