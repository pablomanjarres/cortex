/**
 * Travel readiness: Pablo's visa situation as editable user data (store key
 * cortex-travel-readiness), and the one rule that turns it into a per-opportunity
 * travel flag. Nothing here is a permanent hard-coded block: change the stored
 * rule (MCP set_travel_readiness) and every flag follows.
 */

import { calendarDateOrNull as date, isCalendarDate } from './expiry.ts'
import type { Opportunity } from './opportunity-model.ts'
import { isInPerson, placeText } from './opportunity-score.ts'

export const TRAVEL_READINESS_KEY = 'cortex-travel-readiness'

export type VisaStatus = 'pending' | 'approved' | 'not-needed'

export interface CountryRule {
  /** ISO-like country code; only countries in COUNTRY_PLACES can be matched. */
  country: string
  visa: VisaStatus
  /** In-person events starting before this date are blocked while the visa is pending. */
  blockedBefore: string | null
  note?: string
}

export interface TravelReadiness {
  updatedAt: string | null
  rules: CountryRule[]
}

export const DEFAULT_TRAVEL_READINESS: TravelReadiness = {
  updatedAt: null,
  rules: [{ country: 'US', visa: 'pending', blockedBefore: '2027-05-01', note: 'US visa pending' }],
}

/** Place text (deburred, lower case) that puts an event in a country. */
export const COUNTRY_PLACES: Record<string, RegExp> = {
  US: new RegExp([
    'united states', '\\busa\\b', '\\bu\\.s\\.', '\\bus\\b',
    'san francisco', 'bay area', 'silicon valley', 'palo alto', 'stanford', 'berkeley', 'mountain view',
    'menlo park', 'san jose', 'new york', '\\bnyc\\b', 'boston', 'cambridge,? (ma|massachusetts)', '\\bmit\\b',
    'seattle', 'los angeles', 'san diego', 'austin', 'chicago', 'pittsburgh', 'atlanta', 'miami',
    'philadelphia', 'princeton', 'washington,? d\\.?c', 'new haven', 'ann arbor', 'denver',
    'california', 'massachusetts', 'texas', 'pennsylvania', 'new jersey', 'georgia tech',
  ].join('|')),
}

export type TravelFlag = `${string}_TRAVEL_BLOCKED` | 'VISA_PENDING'

export interface TravelCheck {
  flag: TravelFlag | null
  /** One plain sentence for alerts and Todoist. Empty when there is no flag. */
  reason: string
}

const NONE: TravelCheck = { flag: null, reason: '' }

/** Normalize stored readiness; anything malformed falls back to the default rule. */
export function readinessOf(raw: unknown): TravelReadiness {
  const r = raw as Partial<TravelReadiness> | null
  if (!r || !Array.isArray(r.rules)) return DEFAULT_TRAVEL_READINESS
  const rules = r.rules
    .filter((x): x is CountryRule => !!x && typeof x.country === 'string')
    .map((x) => ({
      country: x.country.toUpperCase(),
      visa: (['pending', 'approved', 'not-needed'] as const).includes(x.visa) ? x.visa : 'pending',
      blockedBefore: typeof x.blockedBefore === 'string' && isCalendarDate(x.blockedBefore) ? x.blockedBefore : null,
      ...(x.note ? { note: String(x.note).slice(0, 200) } : {}),
    }))
  return { updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null, rules }
}

/**
 * Remote and online programs never get a flag. In person in a country whose visa is
 * pending: a start (or, failing that, an end) before blockedBefore is blocked; an
 * unknown date is VISA_PENDING, never a guessed block; a date on or after it is
 * still VISA_PENDING until the visa is approved.
 */
export function travelCheckOf(o: Opportunity, readiness: TravelReadiness): TravelCheck {
  if (!isInPerson(o)) return NONE
  const where = placeText(o)
  for (const rule of readiness.rules) {
    if (rule.visa !== 'pending') continue
    const place = COUNTRY_PLACES[rule.country]
    if (!place || !place.test(where)) continue
    const start = date(o.programStart)
    const end = date(o.programEnd)
    const cutoff = rule.blockedBefore
    if (cutoff && ((start && start < cutoff) || (!start && end && end < cutoff))) {
      return {
        flag: `${rule.country}_TRAVEL_BLOCKED`,
        reason: `In person in the ${rule.country} from ${start ?? `before ${end}`}, before ${cutoff}, while the visa is pending.`,
      }
    }
    return {
      flag: 'VISA_PENDING',
      reason: start
        ? `In person in the ${rule.country} from ${start}; the ${rule.country} visa is still pending.`
        : `In person in the ${rule.country}; event dates are not confirmed and the visa is pending.`,
    }
  }
  return NONE
}
