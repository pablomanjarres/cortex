const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH = /^(\d{4})-(\d{2})$/
const DAY_MS = 86400000

export function creditCardMonthNumber(value: string): number {
  const match = typeof value === 'string' && MONTH.exec(value)
  if (!match) throw new Error('Cycle month must be YYYY-MM')
  const year = Number(match[1]), month = Number(match[2])
  if (year < 1900 || year > 2199 || month < 1 || month > 12) throw new Error('Invalid cycle month')
  return year * 12 + month - 1
}

export function validCreditCardDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = DATE.exec(value)
  if (!match) return false
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1) return false
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function assertCreditCardDate(value: unknown): asserts value is string {
  if (!validCreditCardDate(value)) throw new Error('Invalid date: use a real YYYY-MM-DD date')
}

export function creditCardAddMonths(yearMonth: string, offset: number): string {
  const index = creditCardMonthNumber(yearMonth)
  if (!Number.isInteger(offset) || Math.abs(offset) > 3600) throw new Error('Invalid month offset')
  const result = index + offset
  const value = `${Math.floor(result / 12)}-${String(result % 12 + 1).padStart(2, '0')}`
  creditCardMonthNumber(value)
  return value
}

export function creditCardMonthDate(yearMonth: string, day: number): string {
  creditCardMonthNumber(yearMonth)
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('Invalid day of month')
  const [year, month] = yearMonth.split('-').map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${yearMonth}-${String(Math.min(day, last)).padStart(2, '0')}`
}

export function creditCardDaysBetween(fromDate: string, toDate: string): number {
  assertCreditCardDate(fromDate)
  assertCreditCardDate(toDate)
  return (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / DAY_MS
}

export function creditCardToday(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid current date')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find(item => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
