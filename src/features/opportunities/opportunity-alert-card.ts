/**
 * The notification card for one opportunity: why it matters, money (grant vs
 * investment kept apart), deadline with its verification state, place and dates,
 * eligibility, visa/travel warnings, link and the recommended action. Built once when
 * an alert is created and stored with it, so a delivered alert never changes.
 */

import { fundingLines } from './opportunity-funding.ts'
import { deadlineTypeOf, type ApplicationStatus, type Opportunity } from './opportunity-model.ts'
import { eligibilityOf, isInPerson, type EligibilityCheck } from './opportunity-score.ts'
import { travelCheckOf, type TravelCheck, type TravelReadiness } from './travel-readiness.ts'
import {
  applicationStatusOf, daysLeft, deadlineConfidenceOf, type DeadlineConfidence,
} from './opportunity-window.ts'

export type AlertAction = 'Apply' | 'Prepare' | 'Verify' | 'Skip'

export interface AlertCard {
  name: string
  headline: string
  why: string
  funding: string[]
  deadline: { date: string | null; daysLeft: number | null; confidence: DeadlineConfidence; label: string }
  place: string
  dates: string
  eligibility: EligibilityCheck
  travel: TravelCheck
  link: string
  action: AlertAction
  applicationStatus: ApplicationStatus
  premium: boolean
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function deadlineLabel(o: Opportunity, status: ApplicationStatus, confidence: DeadlineConfidence, days: number | null): string {
  if (status === 'rolling') return 'Rolling, no fixed deadline'
  if (status === 'upcoming') {
    return `Opens ${o.opensAt}${o.deadline ? `; deadline ${o.deadline}` : '; deadline not announced'}`
  }
  if (!o.deadline || days === null) return 'No confirmed deadline'
  const left = days >= 0 ? `${plural(days, 'day')} left` : 'closed'
  if (confidence === 'verified') return `${o.deadline} (${left}, verified ${o.lastVerified})`
  const why = confidence === 'stale' ? `last checked ${o.lastVerified}` : 'no source evidence'
  return `${o.deadline} (${left}). Not verified: ${why}`
}

function placeOf(o: Opportunity): string {
  if (!isInPerson(o)) return 'Remote'
  const parts = [o.intel?.city, o.intel?.country].filter(Boolean)
  return (parts.length ? parts.join(', ') : o.location) || 'In person, place not stated'
}

function datesOf(o: Opportunity): string {
  if (o.programStart && o.programEnd) return `${o.programStart} to ${o.programEnd}`
  if (o.programStart) return `starts ${o.programStart}`
  if (o.programEnd) return `ends ${o.programEnd}`
  return 'program dates not confirmed'
}

/**
 * Skip what he cannot do, verify what is unproven, apply when open, prepare when early
 * or between cycles of a program that recurs.
 */
export function recommendedAction(
  status: ApplicationStatus, confidence: DeadlineConfidence, days: number | null,
  eligibility: EligibilityCheck, travel: TravelCheck, recurs = false,
): AlertAction {
  if (travel.flag?.endsWith('_TRAVEL_BLOCKED') || eligibility.level === 'ineligible') return 'Skip'
  if (status === 'closed') return recurs ? 'Prepare' : 'Skip'
  if (confidence === 'stale' || confidence === 'unsupported' || eligibility.level === 'unclear') return 'Verify'
  if (status === 'upcoming') return 'Prepare'
  if (status === 'rolling') return 'Apply'
  if (status === 'open') return days !== null && days > 30 ? 'Prepare' : 'Apply'
  return 'Verify'
}

export function buildCard(o: Opportunity, headline: string, readiness: TravelReadiness, today: string): AlertCard {
  const status = applicationStatusOf(o, today)
  const confidence = deadlineConfidenceOf(o, today)
  const days = daysLeft(o, today)
  const eligibility = eligibilityOf(o, today)
  const travel = travelCheckOf(o, readiness)
  const why = [o.premium ? 'Premium: on your 100% list.' : '', o.leverageNote || o.reward || o.host]
    .filter(Boolean).join(' ')
  return {
    name: o.title,
    headline,
    why: why || 'No summary recorded.',
    funding: fundingLines(o),
    deadline: { date: o.deadline ?? null, daysLeft: days, confidence, label: deadlineLabel(o, status, confidence, days) },
    place: placeOf(o),
    dates: datesOf(o),
    eligibility,
    travel,
    link: o.officialUrl || o.url || '',
    action: recommendedAction(status, confidence, days, eligibility, travel, deadlineTypeOf(o) === 'recurring' || !!o.nextWindowExpected),
    applicationStatus: status,
    premium: !!o.premium,
  }
}

/** Derived facts for one record, without an alert headline (MCP get_opportunities). */
export function opportunityFacts(o: Opportunity, readiness: TravelReadiness, today: string) {
  const card: Partial<AlertCard> = buildCard(o, '', readiness, today)
  delete card.headline
  delete card.name
  return card as Omit<AlertCard, 'headline' | 'name'>
}

/** The card as the plain text Kaiser posts. */
export function renderCard(card: AlertCard, also: string[] = []): string {
  const lines = [
    card.headline,
    `- Why it matters: ${card.why}`,
    `- Funding: ${card.funding.join('; ')}`,
    `- Deadline: ${card.deadline.label}`,
    `- Where and when: ${card.place}; ${card.dates}`,
    `- Eligibility: ${card.eligibility.level}. ${card.eligibility.note}`,
    `- Visa/travel: ${card.travel.flag ? `${card.travel.flag}. ${card.travel.reason}` : 'no warning'}`,
    `- Apply: ${card.link || 'no official link recorded'}`,
    `- Recommended action: ${card.action}`,
  ]
  if (also.length) lines.push(`- Also: ${also.join('; ')}`)
  return lines.join('\n')
}

