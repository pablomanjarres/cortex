/**
 * Funding and support, kept in separate buckets: equity-free money (grant, stipend),
 * investment (equity, never a grant), travel reimbursement and in-kind support. The
 * one owner of how money is described in alerts and Todoist tasks. Amounts are USD
 * as research recorded them; nothing here estimates a missing amount.
 */

import type { Opportunity } from './opportunity-model.ts'

export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

export interface FundingBreakdown {
  /** Guaranteed, equity-free award (not a prize pool). */
  grantUsd: number | null
  stipendUsd: number | null
  /** Investment for equity. Never counted as a grant. */
  investmentUsd: number | null
  equityPct: number | null
  travel: 'covered' | 'capped' | 'not-covered' | 'unknown'
  travelCapUsd: number | null
  housing: boolean | null
  meals: boolean | null
  visaSupport: boolean | null
  feeUsd: number | null
}

const positive = (n: number | null | undefined) => (typeof n === 'number' && n > 0 ? n : null)

export function fundingOf(o: Opportunity): FundingBreakdown {
  const i = o.intel
  const cap = positive(i?.travelCapUsd)
  return {
    grantUsd: positive(i?.cashUsd),
    stipendUsd: positive(i?.stipendUsd),
    investmentUsd: positive(i?.investmentUsd),
    equityPct: positive(i?.equityPct),
    travel: i?.travelCovered === true ? 'covered' : cap ? 'capped' : i?.travelCovered === false ? 'not-covered' : 'unknown',
    travelCapUsd: cap,
    housing: i?.housingCovered ?? null,
    meals: i?.mealsCovered ?? null,
    visaSupport: i?.visaSupport ?? null,
    feeUsd: positive(i?.feeUsd),
  }
}

/** Material support a program gives beyond equity: what an alert calls "newly available". */
export type SupportKey = 'grant' | 'stipend' | 'travel' | 'housing' | 'meals' | 'visa'

export function supportKeysOf(o: Opportunity): SupportKey[] {
  const f = fundingOf(o)
  const keys: SupportKey[] = []
  if (f.grantUsd) keys.push('grant')
  if (f.stipendUsd) keys.push('stipend')
  if (f.travel === 'covered' || f.travel === 'capped') keys.push('travel')
  if (f.housing) keys.push('housing')
  if (f.meals) keys.push('meals')
  if (f.visaSupport) keys.push('visa')
  return keys
}

export const SUPPORT_LABEL: Record<SupportKey, string> = {
  grant: 'equity-free grant', stipend: 'stipend', travel: 'travel funding',
  housing: 'housing', meals: 'meals', visa: 'visa support',
}

/**
 * Plain lines, one per bucket that is known. Investment is always labelled as equity
 * and never folded into "grant". A legacy amountUsd with no intel stays "type unverified".
 */
export function fundingLines(o: Opportunity): string[] {
  const f = fundingOf(o)
  const lines: string[] = []
  if (f.grantUsd) lines.push(`Grant: ${usd(f.grantUsd)} (equity-free)`)
  if (f.stipendUsd) lines.push(`Stipend: ${usd(f.stipendUsd)} (equity-free)`)
  if (f.investmentUsd) {
    const equity = f.equityPct ? ` for ${f.equityPct}% equity` : ' for equity'
    lines.push(`Investment: ${usd(f.investmentUsd)}${equity} (not a grant)`)
  }
  if (f.travel === 'covered') lines.push('Travel: covered')
  else if (f.travel === 'capped') lines.push(`Travel: reimbursed up to ${usd(f.travelCapUsd ?? 0)}`)
  else if (f.travel === 'not-covered') lines.push('Travel: not covered')
  const kind = [f.housing && 'housing', f.meals && 'meals', f.visaSupport && 'visa support'].filter(Boolean)
  if (kind.length) lines.push(`Also covered: ${kind.join(', ')}`)
  if (f.feeUsd) lines.push(`Fee you pay: ${usd(f.feeUsd)}`)
  if (!lines.length && positive(o.amountUsd)) {
    lines.push(`Amount: ${usd(o.amountUsd as number)} (type unverified, not counted as a grant)`)
  }
  return lines.length ? lines : ['Funding: not stated']
}
