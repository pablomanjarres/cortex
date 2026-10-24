// Manual tracking of bank accounts and cards. Pure, browser-safe functions only:
// no React, no storage, no clock. The UI passes the Bogotá "today" string in.

export const ACCOUNTS_KEY = 'cortex-financial-accounts'

export type AccountKind = 'bank' | 'credit' | 'debit'
export type FeeCadence = 'monthly' | 'quarterly' | 'yearly' | 'once'

export interface AccountFee {
  id: string
  name: string
  amount: number
  cadence: FeeCadence
  nextChargeDate?: string
  budgetAmountCOP?: number
}

export interface FinancialAccount {
  id: string
  name: string
  institution: string
  kind: AccountKind
  currency: string
  last4?: string
  balance?: number
  creditLimit?: number
  minimumPayment?: number
  annualInterestRate?: number
  closingDay?: number
  dueDay?: number
  linkedAccountId?: string
  expiresOn?: string
  notes?: string
  archived: boolean
  fees: AccountFee[]
}

export interface AccountsData {
  version: 1
  accounts: FinancialAccount[]
}

export const EMPTY_ACCOUNTS: AccountsData = { version: 1, accounts: [] }

export const MAX_ACCOUNTS = 100
export const MAX_FEES_PER_ACCOUNT = 20
export const MAX_MONEY = Math.floor(Number.MAX_SAFE_INTEGER / 100)
export const MAX_INTEREST_RATE = 1000
const MAX_UPCOMING = 100
const LIMITS = { id: 100, name: 80, institution: 80, notes: 1000, feeName: 80 }

const KINDS: readonly AccountKind[] = ['bank', 'credit', 'debit']
const CADENCES: readonly FeeCadence[] = ['monthly', 'quarterly', 'yearly', 'once']
export const FEE_CADENCE_MONTHS: Record<Exclude<FeeCadence, 'once'>, number> = { monthly: 1, quarterly: 3, yearly: 12 }
const CADENCE_MONTHS = FEE_CADENCE_MONTHS
const FULL_NUMBER = /\d(?:[ -]?\d){11,}/

let supportedCurrencies: Set<string> | null = null

function isSupportedCurrency(code: unknown): boolean {
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) return false
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'currency') => string[] }
  if (typeof intl.supportedValuesOf === 'function') {
    supportedCurrencies ??= new Set(intl.supportedValuesOf('currency'))
    return supportedCurrencies.has(code)
  }
  try {
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: code })
    return true
  } catch {
    return false
  }
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const isMoney = (value: unknown, min = 0): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= MAX_MONEY
const isDay = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31

// ---- dates (YYYY-MM-DD strings, calendar arithmetic only) ----

interface Ymd { y: number; m: number; d: number }

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const pad = (n: number) => String(n).padStart(2, '0')
const formatYmd = ({ y, m, d }: Ymd) => `${y}-${pad(m)}-${pad(d)}`

function parseYmd(value: unknown): Ymd | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  return { y, m, d }
}

export { parseYmd as parseAccountDate, isMoney as isAccountMoney }

function parseYearMonth(value: unknown): { y: number; m: number } | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return null
  const [y, m] = [Number(match[1]), Number(match[2])]
  return m >= 1 && m <= 12 ? { y, m } : null
}

/** Month `offset` months after (y, m) with `day` clamped to that month's length. */
function monthDate(y: number, m: number, offset: number, day: number): string {
  const index = y * 12 + (m - 1) + offset
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return formatYmd({ y: year, m: month, d: Math.min(day, daysInMonth(year, month)) })
}

export function nextMonthlyDate(day: number, today: string): string {
  if (!isDay(day)) throw new Error('Day of month must be a whole number from 1 to 31.')
  const now = parseYmd(today)
  if (!now) throw new Error('Today must be a valid date (YYYY-MM-DD).')
  const thisMonth = monthDate(now.y, now.m, 0, day)
  return thisMonth >= today ? thisMonth : monthDate(now.y, now.m, 1, day)
}

/** Next occurrence on or after today, stepping from the original anchor so day 31 never drifts. */
function nextFeeDate(fee: AccountFee, today: string): string | null {
  const anchor = parseYmd(fee.nextChargeDate)
  if (!anchor) return null
  const anchorText = formatYmd(anchor)
  if (anchorText >= today) return anchorText
  if (fee.cadence === 'once' || !(fee.cadence in CADENCE_MONTHS)) return null
  const now = parseYmd(today)
  if (!now) return null
  const step = CADENCE_MONTHS[fee.cadence]
  const monthsBehind = (now.y - anchor.y) * 12 + (now.m - anchor.m)
  let k = Math.max(1, Math.floor(monthsBehind / step))
  let candidate = monthDate(anchor.y, anchor.m, k * step, anchor.d)
  while (candidate < today) candidate = monthDate(anchor.y, anchor.m, ++k * step, anchor.d)
  return candidate
}

// ---- validation ----

function validateFee(fee: AccountFee, index: number): string | null {
  const label = `Fee ${index + 1}`
  if (!fee || typeof fee !== 'object') return `${label} is not valid.`
  const id = text(fee.id)
  if (!id) return `${label} id is required.`
  if (id.length > LIMITS.id) return `${label} id must be ${LIMITS.id} characters or fewer.`
  const name = text(fee.name)
  if (!name) return `${label}: fee name is required.`
  if (name.length > LIMITS.feeName) return `${label}: fee name must be ${LIMITS.feeName} characters or fewer.`
  if (FULL_NUMBER.test(name)) return `${label}: do not store a full card or account number in the fee name.`
  if (!isMoney(fee.amount)) return `${label}: fee amount must be a number from 0 to ${MAX_MONEY}.`
  if (fee.budgetAmountCOP !== undefined && (!isMoney(fee.budgetAmountCOP) || !Number.isSafeInteger(fee.budgetAmountCOP))) {
    return `${label}: budget amount must be a non-negative whole COP amount within the supported range.`
  }
  if (!CADENCES.includes(fee.cadence)) return `${label}: frequency must be monthly, quarterly, yearly or once.`
  if (fee.nextChargeDate !== undefined && !parseYmd(fee.nextChargeDate)) {
    return `${label}: first charge date must be a valid date (YYYY-MM-DD).`
  }
  return null
}

function validateOwnFields(account: FinancialAccount): string | null {
  if (!account || typeof account !== 'object') return 'Account is not valid.'
  const id = text(account.id)
  if (!id) return 'Account id is required.'
  if (id.length > LIMITS.id) return `Account id must be ${LIMITS.id} characters or fewer.`

  const name = text(account.name)
  if (!name) return 'Account name is required.'
  if (name.length > LIMITS.name) return `Name must be ${LIMITS.name} characters or fewer.`
  const institution = text(account.institution)
  if (!institution) return 'Institution is required.'
  if (institution.length > LIMITS.institution) return `Institution must be ${LIMITS.institution} characters or fewer.`
  const notes = text(account.notes)
  if (notes.length > LIMITS.notes) return `Notes must be ${LIMITS.notes} characters or fewer.`
  if ([name, institution, notes].some((value) => FULL_NUMBER.test(value))) {
    return 'Do not store a full card or account number. Use the last 4 digits field instead.'
  }

  if (!KINDS.includes(account.kind)) return 'Account type must be bank, credit or debit.'
  if (!isSupportedCurrency(account.currency)) return 'Currency must be a supported three-letter uppercase code such as COP or USD.'
  if (typeof account.archived !== 'boolean') return 'Archived must be true or false.'
  if (account.last4 !== undefined && (typeof account.last4 !== 'string' || !/^\d{4}$/.test(account.last4))) {
    return 'Last 4 digits must be exactly four digits.'
  }

  const kind = account.kind
  if (account.balance !== undefined) {
    if (kind === 'debit') return 'Debit cards do not have a separate balance; track it on the linked bank account.'
    if (kind === 'bank' && !isMoney(account.balance, -MAX_MONEY)) return 'Bank balance must be a finite number within the supported range.'
    if (kind === 'credit' && !isMoney(account.balance)) return 'Credit card debt cannot be negative and must be within the supported range.'
  }

  const creditOnly: Array<[keyof FinancialAccount, string]> = [
    ['creditLimit', 'a credit limit'], ['minimumPayment', 'a minimum payment'],
    ['closingDay', 'a closing day'], ['dueDay', 'a payment due day'],
  ]
  if (kind !== 'credit') {
    for (const [field, label] of creditOnly) {
      if (account[field] !== undefined) return `Only credit cards can have ${label}.`
    }
  } else {
    if (account.creditLimit !== undefined && !isMoney(account.creditLimit)) return 'Credit limit must be a number from 0 to the supported maximum.'
    if (account.minimumPayment !== undefined && !isMoney(account.minimumPayment)) return 'Minimum payment must be a number from 0 to the supported maximum.'
    if (account.closingDay !== undefined && !isDay(account.closingDay)) return 'Closing day must be a whole number from 1 to 31.'
    if (account.dueDay !== undefined && !isDay(account.dueDay)) return 'Payment due day must be a whole number from 1 to 31.'
  }

  if (account.annualInterestRate !== undefined) {
    if (kind === 'debit') return 'Debit cards do not have an interest rate.'
    const rate = account.annualInterestRate
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > MAX_INTEREST_RATE) {
      return `Annual interest rate must be a percentage from 0 to ${MAX_INTEREST_RATE}.`
    }
  }

  if (account.expiresOn !== undefined) {
    if (kind === 'bank') return 'An expiration month is only allowed on cards.'
    if (!parseYearMonth(account.expiresOn)) return 'Expiration must be a valid month (YYYY-MM).'
  }

  if (account.linkedAccountId !== undefined && kind !== 'debit') return 'Only debit cards can be linked to another account.'

  if (!Array.isArray(account.fees)) return 'Fees must be a list.'
  if (account.fees.length > MAX_FEES_PER_ACCOUNT) return `An account can have at most ${MAX_FEES_PER_ACCOUNT} fees.`
  const feeIds = new Set<string>()
  for (const [index, fee] of account.fees.entries()) {
    const error = validateFee(fee, index)
    if (error) return error
    const feeId = text(fee.id)
    if (feeIds.has(feeId)) return `Duplicate fee id "${feeId}".`
    feeIds.add(feeId)
  }
  return null
}

export function validateAccount(account: FinancialAccount, accounts: FinancialAccount[]): string | null {
  const ownError = validateOwnFields(account)
  if (ownError) return ownError

  const id = text(account.id)
  const others = accounts.filter((candidate) => candidate.id !== id)
  if (others.length === accounts.length && accounts.length >= MAX_ACCOUNTS) {
    return `You can track at most ${MAX_ACCOUNTS} accounts.`
  }

  if (account.kind === 'debit' && account.linkedAccountId !== undefined) {
    const linkedId = text(account.linkedAccountId)
    if (!linkedId) return 'Linked account id cannot be empty.'
    if (linkedId === id) return 'A debit card cannot be linked to itself.'
    const linked = others.find((candidate) => candidate.id === linkedId)
    if (!linked) return 'The linked account does not exist.'
    if (linked.kind !== 'bank') return 'A debit card can only be linked to a bank account.'
    if (linked.currency !== account.currency) return 'A debit card must use the same currency as its linked bank account.'
    if (!account.archived && linked.archived) return 'The linked bank account is archived. Restore it or choose another bank account.'
  }

  // Changes to a bank must not strand debit cards that point at it.
  const dependents = others.filter((candidate) => candidate.kind === 'debit' && candidate.linkedAccountId === id)
  if (dependents.length > 0) {
    const names = (list: FinancialAccount[]) => list.map((card) => card.name).join(', ')
    if (account.kind !== 'bank') {
      return `This account has linked debit cards (${names(dependents)}). Unlink those debit cards before changing its type.`
    }
    const otherCurrency = dependents.filter((card) => card.currency !== account.currency)
    if (otherCurrency.length > 0) {
      return `This bank account has linked debit cards in ${otherCurrency[0].currency} (${names(otherCurrency)}). Unlink those debit cards before changing its currency.`
    }
    const active = dependents.filter((card) => !card.archived)
    if (account.archived && active.length > 0) {
      return `This bank account has active linked debit cards (${names(active)}). Archive or unlink those debit cards first.`
    }
  }
  return null
}

function normalizeAccount(account: FinancialAccount): FinancialAccount {
  const normalized: FinancialAccount = {
    ...account,
    id: text(account.id),
    name: text(account.name),
    institution: text(account.institution),
    fees: Array.isArray(account.fees)
      ? account.fees.map((fee) => ({ ...fee, id: text(fee?.id), name: text(fee?.name) }))
      : account.fees,
  }
  if (account.notes !== undefined) {
    const notes = text(account.notes)
    if (notes) normalized.notes = notes
    else delete normalized.notes
  }
  if (account.linkedAccountId !== undefined) normalized.linkedAccountId = text(account.linkedAccountId)
  return normalized
}

export function saveAccount(data: AccountsData, account: FinancialAccount): AccountsData {
  const normalized = normalizeAccount(account)
  const error = validateAccount(normalized, data.accounts)
  if (error) throw new Error(error)
  const index = data.accounts.findIndex((candidate) => candidate.id === normalized.id)
  const accounts = index === -1
    ? [...data.accounts, normalized]
    : data.accounts.map((candidate, i) => (i === index ? normalized : candidate))
  return { ...data, accounts }
}

export function setAccountArchived(data: AccountsData, id: string, archived: boolean): AccountsData {
  const index = data.accounts.findIndex((candidate) => candidate.id === id)
  if (index === -1) throw new Error('Account not found.')
  const updated = { ...data.accounts[index], archived }
  const error = validateAccount(updated, data.accounts)
  if (error) throw new Error(error)
  return { ...data, accounts: data.accounts.map((candidate, i) => (i === index ? updated : candidate)) }
}

// ---- upcoming dates ----

export interface AccountDate {
  id: string
  accountId: string
  accountName: string
  type: 'payment' | 'closing' | 'fee' | 'expiry'
  label: string
  date: string
  amount?: number
  currency: string
}

const TYPE_ORDER: Record<AccountDate['type'], number> = { payment: 0, closing: 1, fee: 2, expiry: 3 }

export function upcomingAccountDates(accounts: FinancialAccount[], today: string, limit = 12): AccountDate[] {
  if (!parseYmd(today)) throw new Error('Today must be a valid date (YYYY-MM-DD).')
  const max = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 0), MAX_UPCOMING) : 12
  const dates: AccountDate[] = []

  for (const account of accounts) {
    if (account.archived) continue
    const base = { accountId: account.id, accountName: account.name, currency: account.currency }
    if (account.kind === 'credit') {
      if (isDay(account.dueDay)) {
        dates.push({
          ...base, id: `${account.id}:payment`, type: 'payment', label: 'Payment due',
          date: nextMonthlyDate(account.dueDay, today),
          ...(isMoney(account.minimumPayment) ? { amount: account.minimumPayment } : {}),
        })
      }
      if (isDay(account.closingDay)) {
        dates.push({
          ...base, id: `${account.id}:closing`, type: 'closing', label: 'Statement closes',
          date: nextMonthlyDate(account.closingDay, today),
        })
      }
    }
    for (const fee of account.fees ?? []) {
      const date = nextFeeDate(fee, today)
      if (!date) continue
      dates.push({ ...base, id: `${account.id}:fee:${fee.id}`, type: 'fee', label: fee.name, date, amount: fee.amount })
    }
    const expiry = account.kind !== 'bank' ? parseYearMonth(account.expiresOn) : null
    if (expiry) {
      const date = formatYmd({ ...expiry, d: daysInMonth(expiry.y, expiry.m) })
      if (date >= today) dates.push({ ...base, id: `${account.id}:expiry`, type: 'expiry', label: 'Card expires', date })
    }
  }

  return dates
    .sort((a, b) => a.date.localeCompare(b.date)
      || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
      || a.accountName.localeCompare(b.accountName)
      || a.id.localeCompare(b.id))
    .slice(0, max)
}

// ---- totals ----

export interface CurrencySummary {
  currency: string
  bankBalance: number
  creditDebt: number
  creditLimit: number
  monthlyFees: number
}

const roundCents = (value: number) => Math.round(value * 100) / 100

export function monthlyFeeEquivalent(fee: AccountFee): number {
  if (fee.cadence === 'once' || !(fee.cadence in CADENCE_MONTHS) || !isMoney(fee.amount)) return 0
  return fee.amount / CADENCE_MONTHS[fee.cadence]
}

export function accountSummaries(accounts: FinancialAccount[]): CurrencySummary[] {
  const byCurrency = new Map<string, CurrencySummary>()
  for (const account of accounts) {
    if (account.archived) continue
    let summary = byCurrency.get(account.currency)
    if (!summary) {
      summary = { currency: account.currency, bankBalance: 0, creditDebt: 0, creditLimit: 0, monthlyFees: 0 }
      byCurrency.set(account.currency, summary)
    }
    // Debit cards spend from their linked bank account, so they add no balance of their own.
    if (account.kind === 'bank' && isMoney(account.balance, -MAX_MONEY)) summary.bankBalance += account.balance
    if (account.kind === 'credit') {
      if (isMoney(account.balance)) summary.creditDebt += account.balance
      if (isMoney(account.creditLimit)) summary.creditLimit += account.creditLimit
    }
    for (const fee of account.fees ?? []) summary.monthlyFees += monthlyFeeEquivalent(fee)
  }
  return [...byCurrency.values()]
    .map((summary) => ({
      ...summary,
      bankBalance: roundCents(summary.bankBalance),
      creditDebt: roundCents(summary.creditDebt),
      creditLimit: roundCents(summary.creditLimit),
      monthlyFees: roundCents(summary.monthlyFees),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

export function formatAccountMoney(amount: number, currency: string): string {
  const value = Number.isFinite(amount) ? amount : 0
  if (!isSupportedCurrency(currency)) return `${value.toFixed(2)} ${currency}`
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency, currencyDisplay: 'code' }).format(value)
}
