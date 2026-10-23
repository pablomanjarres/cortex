/** Rules for a typed numeric draft: an inclusive range and what a blank draft means. */
export interface NumberRule {
  min: number
  max?: number
  integer?: boolean
  /** `clear` = a blank draft means "unknown" (e.g. an ungraded assignment); default rejects it. */
  blank?: 'clear' | 'reject'
}

export type NumberDraftResult = { ok: true; value: number | undefined } | { ok: false }

const DECIMAL = /^\d+(?:[.,]\d+)?$/

/** Parse a plain decimal (dot or comma), round to one place, and check it against the rule. */
export function parseNumberDraft(draft: string, rule: NumberRule): NumberDraftResult {
  const text = draft.trim()
  if (text === '') return rule.blank === 'clear' ? { ok: true, value: undefined } : { ok: false }
  if (!DECIMAL.test(text)) return { ok: false }
  const n = Number(text.replace(',', '.'))
  if (!Number.isFinite(n) || (rule.integer && !Number.isSafeInteger(n))) return { ok: false }
  if (n < rule.min || (rule.max !== undefined && n > rule.max)) return { ok: false }
  return { ok: true, value: Number(n.toFixed(1)) }
}

/** Display/draft text: integers without decimals, otherwise one decimal place. */
export const formatNumberDraft = (value: number | undefined) =>
  value === undefined ? '' : value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)
