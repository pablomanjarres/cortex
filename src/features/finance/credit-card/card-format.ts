export const cardMoney = (amount: number) => `$${amount.toLocaleString('es-CO')}`
export const cardDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Bogota',
})
export const cardMonthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', {
  month: 'long', year: 'numeric', timeZone: 'America/Bogota',
})
export function shiftCardMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, number - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
