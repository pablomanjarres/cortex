import type { CreditCardMonthSummary } from '../../../../electron/credit-card-types'

export interface CreditCardBudgetDetail {
  dueDate: string
  installmentNumber?: number
  installmentCount?: number
}

export interface CreditCardBudgetRow {
  id: string
  name: string
  kind: 'purchase' | 'interest' | 'fees' | 'statement'
  months: number[]
  details: CreditCardBudgetDetail[][]
}

/** Budget obligations follow the ledger's planned amounts, independent of payments. */
export function creditCardBudgetRows(months: CreditCardMonthSummary[]): CreditCardBudgetRow[] {
  const rows = new Map<string, CreditCardBudgetRow>()
  const add = (id: string, name: string, kind: CreditCardBudgetRow['kind'], month: number,
    amount: number, detail: CreditCardBudgetDetail) => {
    if (amount <= 0) return
    let row = rows.get(id)
    if (!row) {
      row = { id, name, kind, months: Array(months.length).fill(0),
        details: Array.from({ length: months.length }, () => []) }
      rows.set(id, row)
    }
    row.months[month] += amount
    row.details[month].push(detail)
  }
  months.forEach((month, monthIndex) => {
    for (const cycle of month.cycles) {
      for (const installment of cycle.installments) {
        add(`purchase:${installment.purchaseId}`, installment.name, 'purchase', monthIndex, installment.amount,
          { dueDate: installment.dueDate, installmentNumber: installment.number, installmentCount: installment.count })
      }
      const detail = { dueDate: cycle.dueDate }
      add('interest', 'Interest', 'interest', monthIndex, cycle.interest, detail)
      add('fees', 'Fees', 'fees', monthIndex, cycle.fees, detail)
      add('statement', 'Additional statement amount', 'statement', monthIndex,
        cycle.target - cycle.principal - cycle.interest - cycle.fees, detail)
    }
  })
  const order = { purchase: 0, interest: 1, fees: 2, statement: 3 }
  return [...rows.values()].sort((a, b) => order[a.kind] - order[b.kind])
}
