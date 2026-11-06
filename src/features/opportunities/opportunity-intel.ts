/**
 * The OppIntel field spec and its validator. The deep-research model's JSON is
 * untrusted: unknown keys drop, numbers clamp to sane ranges, and anything that is
 * not the right type becomes null ("not stated"). scripts/research-prompt.mjs builds
 * the Codex output schema from the same spec. Runtime-dependency-free so Node scripts
 * can import this file directly.
 */

import type { FieldTag, OppIntel, Selectivity } from './opportunity-model'

export const FIELD_TAGS: readonly FieldTag[] = [
  'humanoids', 'manipulation', 'robotics', 'hardware', 'iot',
  'ai', 'software', 'startups', 'founder', 'research', 'hackathon',
]
export const SELECTIVITY: readonly Selectivity[] = ['reach', 'competitive', 'realistic', 'easy']

export type IntelKind = 'bool' | 'text' | { min: number; max: number }
const USD = { min: 0, max: 10_000_000 }
const SIGNAL = { min: 0, max: 10 }

/** Every scalar OppIntel fact and how to validate it. `fields` and `selectivity` are enums. */
export const INTEL_SPEC: Record<Exclude<keyof OppIntel, 'fields' | 'selectivity'>, IntelKind> = {
  legit: 'bool',
  ageMin: { min: 0, max: 99 },
  ageMax: { min: 0, max: 99 },
  colombiaAllowed: 'bool',
  undergradAllowed: 'bool',
  country: 'text',
  city: 'text',
  inPerson: 'bool',
  visaSupport: 'bool',
  cashUsd: USD,
  investmentUsd: USD,
  equityPct: { min: 0, max: 100 },
  stipendUsd: USD,
  travelCovered: 'bool',
  travelCapUsd: USD,
  housingCovered: 'bool',
  feeUsd: USD,
  durationDays: { min: 0, max: 3650 },
  hoursPerWeek: { min: 0, max: 100 },
  fullTime: 'bool',
  relocation: 'bool',
  leaveUniversity: 'bool',
  dropout: 'bool',
  ideaStageOk: 'bool',
  mvpRequired: 'bool',
  tractionRequired: 'bool',
  companyRequired: 'bool',
  hardwareAccess: 'bool',
  prestige: SIGNAL,
  network: SIGNAL,
  founderDensity: SIGNAL,
  technicalDensity: SIGNAL,
  investorAccess: SIGNAL,
  careerUpside: SIGNAL,
  skillGain: SIGNAL,
  probability: { min: 0, max: 1 },
  effortHours: { min: 0, max: 500 },
}

function coerce(v: unknown, kind: IntelKind): boolean | string | number | null {
  if (kind === 'bool') return typeof v === 'boolean' ? v : null
  if (kind === 'text') {
    const s = typeof v === 'string' ? v.trim() : ''
    return s ? s.slice(0, 80) : null
  }
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(kind.max, Math.max(kind.min, n)) : null
}

export function normalizeIntel(raw: unknown): OppIntel {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const intel: Record<string, unknown> = {
    fields: Array.isArray(r.fields)
      ? [...new Set(r.fields.filter((f): f is FieldTag => FIELD_TAGS.includes(f as FieldTag)))]
      : [],
    selectivity: SELECTIVITY.includes(r.selectivity as Selectivity) ? r.selectivity : null,
  }
  for (const [key, kind] of Object.entries(INTEL_SPEC)) intel[key] = coerce(r[key], kind)
  return intel as unknown as OppIntel
}

/** An empty intel record: every fact unknown. */
export const emptyIntel = (): OppIntel => normalizeIntel({})
