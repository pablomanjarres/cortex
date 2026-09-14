import type { Opportunity } from './OpportunitiesPage'

type Deadline = Pick<Opportunity, 'deadline' | 'rolling' | 'deadlineType'>

/** Parse calendar dates strictly; normalized impossible dates must not hide records. */
function calendarTime(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null
}

/** Calendar-day distance, independent of UTC rollover and daylight-saving changes. */
export function daysUntilDeadline(deadline: string | null, today: string): number | null {
  const end = calendarTime(deadline)
  const start = calendarTime(today)
  return end === null || start === null ? null : (end - start) / 86_400_000
}

export function isOpportunityExpired(opportunity: Deadline, today: string): boolean {
  switch (opportunity.deadlineType) {
    case 'rolling':
    case 'always-open':
      return false
    case 'fixed':
    case 'recurring':
    case 'unknown':
      break // Explicit types take precedence over the legacy rolling flag.
    default:
      if (opportunity.rolling) return false
  }
  const days = daysUntilDeadline(opportunity.deadline, today)
  return days !== null && days < 0
}

export function isOpportunityActive(opportunity: Deadline & Pick<Opportunity, 'status'>, today: string): boolean {
  return opportunity.status !== 'archived' && !isOpportunityExpired(opportunity, today)
}
