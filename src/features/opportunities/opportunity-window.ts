/**
 * Application-window facts derived from one opportunity record: where its window
 * stands today and how far its deadline can be trusted. The one owner of
 * "is it open" and "is this date verified" for alerts, MCP output and Todoist sync.
 * Imports carry .ts extensions so Node scripts can load it.
 */

import { calendarDateOrNull as dateOf, daysUntilDeadline } from './expiry.ts'
import { deadlineTypeOf } from './opportunity-model.ts'
import type { ApplicationStatus, Opportunity } from './opportunity-model.ts'

/** A deadline counts as verified only if research confirmed it this recently. */
export const VERIFIED_MAX_AGE_DAYS = 14

type WindowFields = Pick<Opportunity, 'deadline' | 'rolling' | 'deadlineType' | 'opensAt'>

/**
 * upcoming: a stated opening date is still ahead.
 * rolling:  rolling or always-open intake.
 * open:     a dated deadline today or later, or a stated opening date that has passed
 *           with no deadline announced yet (its deadline stays unverified).
 * closed:   the dated deadline passed, or a recurring program between cycles.
 * unknown:  nothing dated or typed to go on.
 */
export function applicationStatusOf(o: WindowFields, today: string): ApplicationStatus {
  const opens = dateOf(o.opensAt)
  if (opens && opens > today) return 'upcoming'
  const type = deadlineTypeOf(o as Opportunity)
  if (type === 'rolling' || type === 'always-open') return 'rolling'
  const days = daysUntilDeadline(o.deadline, today)
  if (days !== null) return days >= 0 ? 'open' : 'closed'
  if (type === 'recurring') return 'closed'
  return opens ? 'open' : 'unknown'
}

export const isLiveStatus = (s: ApplicationStatus) => s === 'open' || s === 'rolling'

/**
 * The source wording behind the record. Records written before the evidence field
 * existed kept it in notes (the research run wrote "URL — quote" there); any record the
 * current ingest touched has the field, even when null, and never falls back to notes.
 */
export function evidenceOf(o: Pick<Opportunity, 'evidence' | 'notes'>): string {
  if (o.evidence !== undefined) return (o.evidence ?? '').trim()
  const notes = (o.notes ?? '').trim()
  return /^https?:\/\//.test(notes) ? notes : ''
}

export type DeadlineConfidence = 'verified' | 'stale' | 'unsupported' | 'none'

/**
 * none:        no calendar deadline.
 * unsupported: no verification date or no source evidence.
 * stale:       last verified more than VERIFIED_MAX_AGE_DAYS ago (or in the future).
 * verified:    checked recently against a cited source.
 */
export function deadlineConfidenceOf(
  o: Pick<Opportunity, 'deadline' | 'lastVerified' | 'evidence' | 'notes'>,
  today: string,
): DeadlineConfidence {
  if (!dateOf(o.deadline)) return 'none'
  const checked = dateOf(o.lastVerified ?? null)
  if (!checked || !evidenceOf(o)) return 'unsupported'
  const age = daysUntilDeadline(today, checked)
  return age === null || age < 0 || age > VERIFIED_MAX_AGE_DAYS ? 'stale' : 'verified'
}

/** Whole days from today to the deadline, or null without a calendar deadline. */
export const daysLeft = (o: Pick<Opportunity, 'deadline'>, today: string) => daysUntilDeadline(o.deadline, today)
