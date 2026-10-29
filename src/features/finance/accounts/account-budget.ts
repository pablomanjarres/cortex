// Projects account fees into the COP budget as generated expense rows. Pure, browser-safe
// functions only: no React, no storage, no clock, no exchange rates.

import type { FinanceData, FinanceItem } from '../finance-model'
import type { AccountFee, FinancialAccount } from './account-model'
import { FEE_CADENCE_MONTHS, MAX_ACCOUNTS, MAX_FEES_PER_ACCOUNT, isAccountMoney, parseAccountDate } from './account-model.ts'

/** Row id => `YYYY-MM` => amount paid in whole COP. */
export type AccountFeePayments = NonNullable<FinanceData['accountFeePayments']>

export interface AccountFeeBudgetItem extends FinanceItem {
  sourceAccountId: string
  sourceFeeId: string
  originalCurrency: string
  /** Foreign fee with no user-entered COP charge amount; budgeted as zero COP. */
  missingRate: boolean
  /** Fee without a valid first charge date; budgeted as zero. */
  missingDate: boolean
  /** Charges in the fee's own currency, on the same schedule as `months`. */
  originalMonths: number[]
}

const ROW_PREFIX = 'account-fee:'
const BUDGET_CURRENCY = 'COP'

const pad = (n: number) => String(n).padStart(2, '0')
const isYear = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 9999
const isWholeAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const own = <T>(record: Record<string, T> | undefined, key: string): T | undefined =>
  record && typeof record === 'object' && Object.hasOwn(record, key) ? record[key] : undefined

export const accountFeeRowId = (accountId: string, feeId: string) =>
  `${ROW_PREFIX}${encodeURIComponent(accountId)}:${encodeURIComponent(feeId)}`

const yearMonth = (year: number, month: number) => `${String(year).padStart(4, '0')}-${pad(month + 1)}`

/** Month index (year * 12 + month) of a valid YYYY-MM-DD date, or null. */
function anchorIndex(value: unknown): number | null {
  const date = parseAccountDate(value)
  return date ? date.y * 12 + date.m - 1 : null
}

/** Which months of `year` the fee is charged in, never before its first charge date. */
function chargeMonths(fee: AccountFee, year: number): boolean[] | null {
  const anchor = anchorIndex(fee.nextChargeDate ?? (fee.budgetStartMonth ? `${fee.budgetStartMonth}-01` : undefined))
  if (anchor === null) return null
  const step = fee.cadence === 'once' ? 0 : FEE_CADENCE_MONTHS[fee.cadence]
  return Array.from({ length: 12 }, (_, month) => {
    const offset = year * 12 + month - anchor
    return offset >= 0 && (step === 0 ? offset === 0 : offset % step === 0)
  })
}

function budgetAmount(account: FinancialAccount, fee: AccountFee): number | null {
  if (account.currency === BUDGET_CURRENCY) return Math.round(fee.amount)
  const amount = fee.budgetAmountCOP
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null
  const rounded = Math.round(amount)
  return Number.isSafeInteger(rounded) ? rounded : null
}

export function projectAccountFees(
  accounts: FinancialAccount[],
  year: number,
  payments?: AccountFeePayments,
): AccountFeeBudgetItem[] {
  if (!isYear(year)) throw new RangeError('Budget year must be a whole year from 1 to 9999.')
  if (!Array.isArray(accounts)) throw new RangeError('Accounts must be a list.')
  if (accounts.length > MAX_ACCOUNTS) throw new RangeError(`At most ${MAX_ACCOUNTS} accounts can be budgeted.`)

  const rows: AccountFeeBudgetItem[] = []
  const seen = new Set<string>()
  for (const account of accounts) {
    if (account.archived) continue
    const fees = account.fees ?? []
    if (!Array.isArray(fees)) throw new RangeError(`Fees for "${account.name}" must be a list.`)
    if (fees.length > MAX_FEES_PER_ACCOUNT) {
      throw new RangeError(`"${account.name}" has more than ${MAX_FEES_PER_ACCOUNT} fees.`)
    }
    for (const fee of fees) {
      if (!isAccountMoney(fee.amount)) throw new RangeError(`Fee "${fee.name}" on "${account.name}" has an invalid amount.`)
      if (fee.cadence !== 'once' && !Object.hasOwn(FEE_CADENCE_MONTHS, fee.cadence)) {
        throw new RangeError(`Fee "${fee.name}" on "${account.name}" has an invalid frequency.`)
      }
      const id = accountFeeRowId(account.id, fee.id)
      if (seen.has(id)) throw new RangeError(`Fee "${fee.name}" on "${account.name}" is listed twice.`)
      seen.add(id)

      const charged = chargeMonths(fee, year)
      const cop = budgetAmount(account, fee)
      const months = Array.from({ length: 12 }, (_, i) => (charged?.[i] && cop ? cop : 0))
      const originalMonths = Array.from({ length: 12 }, (_, i) => (charged?.[i] ? fee.amount : 0))
      // Payments only count against months that are actually charged; the stored map is left as-is.
      const recorded = own(payments, id)
      const paidAmounts = months.map((expected, i) => {
        const amount = own(recorded, yearMonth(year, i))
        return expected > 0 && isWholeAmount(amount) ? amount : 0
      })
      rows.push({
        id,
        name: `${account.name} · ${fee.name}`,
        type: 'Expense',
        category: 'Other',
        months,
        paidAmounts,
        paid: months.map((expected, i) => expected > 0 && paidAmounts[i] >= expected),
        sourceAccountId: account.id,
        sourceFeeId: fee.id,
        originalCurrency: account.currency,
        missingRate: account.currency !== BUDGET_CURRENCY && cop === null,
        missingDate: charged === null,
        originalMonths,
      })
    }
  }
  return rows
}

/** Record what was paid toward a generated fee row in one month of `data.year`; `null` clears it to zero. */
export function withAccountFeePayment(
  data: FinanceData,
  id: string,
  month: number,
  amount: number | null,
): FinanceData {
  if (!isYear(data.year)) throw new RangeError('Budget year must be a whole year from 1 to 9999.')
  if (!Number.isInteger(month) || month < 0 || month > 11) throw new RangeError('Month must be a whole number from 0 to 11.')
  if (typeof id !== 'string' || !id.startsWith(ROW_PREFIX) || id.length === ROW_PREFIX.length) {
    throw new RangeError('Payments can only be recorded for account fee rows.')
  }
  const value = amount ?? 0
  if (!isWholeAmount(value)) throw new RangeError('Paid amounts must be null or non-negative whole COP amounts.')

  const store = data.accountFeePayments ?? {}
  const row = { ...own(store, id), [yearMonth(data.year, month)]: value }
  return { ...data, accountFeePayments: { ...store, [id]: row } }
}
