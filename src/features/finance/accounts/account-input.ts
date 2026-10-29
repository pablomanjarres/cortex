import { parseNumberDraft } from '../../../lib/number-draft.ts'
import { MAX_MONEY } from './account-model.ts'

/** Amount drafts use whole pesos for COP and at most two decimals for other currencies. */
export function parseAccountAmount(draft: string, currency: string): number | undefined {
  const text = draft.trim()
  if (!text) return undefined
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const whole = parseNumberDraft(unsigned, { min: 0, max: MAX_MONEY, integer: true })
  if (whole.ok && whole.value !== undefined) return negative ? -whole.value : whole.value
  if (currency === 'COP') return NaN
  let normalized = unsigned
  if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(unsigned)) normalized = unsigned.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(unsigned)) normalized = unsigned.replace(/,/g, '')
  else if (/^\d+[.,]\d{1,2}$/.test(unsigned)) normalized = unsigned.replace(',', '.')
  else return NaN
  const amount = Number(normalized)
  return amount <= MAX_MONEY ? (negative ? -amount : amount) : NaN
}
