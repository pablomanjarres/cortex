import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNTS_KEY,
  EMPTY_ACCOUNTS,
  accountSummaries,
  formatAccountMoney,
  nextMonthlyDate,
  saveAccount,
  setAccountArchived,
  upcomingAccountDates,
  validateAccount,
  type AccountsData,
  type FinancialAccount,
} from '../src/features/finance/accounts/account-model.ts'

const bank = (overrides: Partial<FinancialAccount> = {}): FinancialAccount => ({
  id: 'bank-1', name: 'Nómina', institution: 'Bancolombia', kind: 'bank', currency: 'COP',
  balance: 1_500_000, archived: false, fees: [], ...overrides,
})
const credit = (overrides: Partial<FinancialAccount> = {}): FinancialAccount => ({
  id: 'credit-1', name: 'Visa Gold', institution: 'Davivienda', kind: 'credit', currency: 'COP',
  last4: '4242', balance: 800_000, creditLimit: 5_000_000, minimumPayment: 120_000,
  annualInterestRate: 28.5, closingDay: 15, dueDay: 31, archived: false, fees: [], ...overrides,
})
const debit = (overrides: Partial<FinancialAccount> = {}): FinancialAccount => ({
  id: 'debit-1', name: 'Débito nómina', institution: 'Bancolombia', kind: 'debit', currency: 'COP',
  last4: '1234', linkedAccountId: 'bank-1', expiresOn: '2028-02', archived: false, fees: [], ...overrides,
})
const withAccounts = (...accounts: FinancialAccount[]): AccountsData => ({ version: 1, accounts })

test('exposes the storage key and an empty envelope', () => {
  assert.equal(ACCOUNTS_KEY, 'cortex-financial-accounts')
  assert.deepEqual(EMPTY_ACCOUNTS, { version: 1, accounts: [] })
})

test('foreign fee COP budget values must be whole nonnegative amounts', () => {
  const fee = { id: 'annual', name: 'Annual fee', amount: 20, cadence: 'yearly' as const, budgetAmountCOP: 80000 }
  assert.equal(validateAccount(credit({ currency: 'USD', fees: [fee] }), []), null)
  for (const invalid of [-1, NaN, Infinity, 1.5]) {
    assert.match(validateAccount(credit({ currency: 'USD', fees: [{ ...fee, budgetAmountCOP: invalid }] }), [])!, /budget amount/)
  }
})

test('saveAccount inserts and edits immutably without losing unrelated rows or envelope fields', () => {
  const start = { ...withAccounts(bank(), credit()), extra: 'keep-me' } as AccountsData & { extra: string }
  const snapshot = structuredClone(start)

  const inserted = saveAccount(start, debit())
  assert.deepEqual(start, snapshot, 'input must not be mutated')
  assert.deepEqual(inserted.accounts.map((a) => a.id), ['bank-1', 'credit-1', 'debit-1'])
  assert.equal((inserted as typeof start).extra, 'keep-me')

  const edited = saveAccount(inserted, credit({ name: '  Visa Platinum  ', balance: 0 }))
  assert.deepEqual(edited.accounts.map((a) => a.id), ['bank-1', 'credit-1', 'debit-1'])
  assert.equal(edited.accounts[1].name, 'Visa Platinum')
  assert.equal(edited.accounts[1].balance, 0)
  assert.equal(edited.accounts[0], inserted.accounts[0], 'unrelated rows are untouched')
  assert.equal(edited.accounts[2], inserted.accounts[2])
  assert.equal(inserted.accounts[1].name, 'Visa Gold')
})

test('saveAccount throws plain-English errors for invalid input at the boundary', () => {
  const data = withAccounts(bank())
  const cases: Array<[Partial<FinancialAccount>, RegExp]> = [
    [{ name: '   ' }, /name is required/i],
    [{ institution: '' }, /institution is required/i],
    [{ id: ' ' }, /id is required/i],
    [{ kind: 'savings' as never }, /type/i],
    [{ currency: 'cop' }, /currency/i],
    [{ currency: 'ZZZ' }, /currency/i],
    [{ last4: '12345' }, /last 4 digits/i],
    [{ last4: '12a4' }, /last 4 digits/i],
    [{ notes: 'card 4111 1111 1111 1111' }, /full card or account number/i],
    [{ name: '0123456789012' }, /full card or account number/i],
    [{ name: 'x'.repeat(81) }, /name.*80/i],
    [{ notes: 'x'.repeat(1001) }, /notes.*1000/i],
    [{ balance: Number.NaN }, /balance/i],
    [{ balance: 1e16 }, /balance/i],
    [{ creditLimit: 10 }, /only credit cards/i],
    [{ closingDay: 3 }, /only credit cards/i],
    [{ expiresOn: '2028-01' }, /expiration.*cards/i],
    [{ linkedAccountId: 'bank-1' }, /only debit cards can be linked/i],
  ]
  for (const [overrides, pattern] of cases) {
    const account = bank({ id: 'bank-2', ...overrides })
    assert.match(validateAccount(account, data.accounts) ?? '', pattern, JSON.stringify(overrides))
    assert.throws(() => saveAccount(data, account), pattern)
  }
  assert.equal(validateAccount(bank({ id: 'bank-2' }), data.accounts), null)
})

test('credit and debit field rules', () => {
  const accounts = [bank()]
  assert.match(validateAccount(credit({ balance: -1 }), accounts) ?? '', /debt.*negative/i)
  assert.match(validateAccount(credit({ creditLimit: -5 }), accounts) ?? '', /credit limit/i)
  assert.match(validateAccount(credit({ minimumPayment: Infinity }), accounts) ?? '', /minimum payment/i)
  assert.match(validateAccount(credit({ dueDay: 32 }), accounts) ?? '', /due day/i)
  assert.match(validateAccount(credit({ closingDay: 1.5 }), accounts) ?? '', /closing day/i)
  assert.match(validateAccount(credit({ annualInterestRate: 1001 }), accounts) ?? '', /interest/i)
  assert.match(validateAccount(credit({ expiresOn: '2028-13' }), accounts) ?? '', /expiration/i)
  assert.match(validateAccount(debit({ balance: 10 }), accounts) ?? '', /debit cards do not have a separate balance/i)
  assert.match(validateAccount(debit({ minimumPayment: 10 }), accounts) ?? '', /only credit cards/i)
  assert.equal(validateAccount(credit(), accounts), null)
  assert.equal(validateAccount(debit(), accounts), null)
  assert.equal(validateAccount(debit({ linkedAccountId: undefined }), accounts), null)
})

test('fee validation', () => {
  const fee = { id: 'f1', name: 'Cuota de manejo', amount: 10_000, cadence: 'monthly' as const }
  assert.equal(validateAccount(bank({ fees: [fee] }), []), null)
  assert.match(validateAccount(bank({ fees: [{ ...fee, amount: -1 }] }), []) ?? '', /fee amount/i)
  assert.match(validateAccount(bank({ fees: [{ ...fee, name: ' ' }] }), []) ?? '', /fee name/i)
  assert.match(validateAccount(bank({ fees: [{ ...fee, cadence: 'weekly' as never }] }), []) ?? '', /frequency/i)
  assert.match(validateAccount(bank({ fees: [{ ...fee, nextChargeDate: '2026-02-30' }] }), []) ?? '', /charge date/i)
  assert.match(validateAccount(bank({ fees: [fee, fee] }), []) ?? '', /duplicate fee/i)
  const many = Array.from({ length: 21 }, (_, i) => ({ ...fee, id: `f${i}` }))
  assert.match(validateAccount(bank({ fees: many }), []) ?? '', /20 fees/i)
})

test('enforces the 100 account limit for new accounts only', () => {
  const accounts = Array.from({ length: 100 }, (_, i) => bank({ id: `b${i}` }))
  assert.match(validateAccount(bank({ id: 'new' }), accounts) ?? '', /100 accounts/i)
  assert.equal(validateAccount(bank({ id: 'b5', name: 'Edited' }), accounts), null)
})

test('debit links only to an active bank account in the same currency', () => {
  const usdBank = bank({ id: 'bank-usd', currency: 'USD' })
  const oldBank = bank({ id: 'bank-old', archived: true })
  const other = debit({ id: 'debit-2', linkedAccountId: undefined })
  const accounts = [bank(), credit(), usdBank, oldBank, other]
  assert.match(validateAccount(debit({ linkedAccountId: 'missing' }), accounts) ?? '', /linked account does not exist/i)
  assert.match(validateAccount(debit({ linkedAccountId: 'credit-1' }), accounts) ?? '', /bank account/i)
  assert.match(validateAccount(debit({ linkedAccountId: 'debit-2' }), accounts) ?? '', /bank account/i)
  assert.match(validateAccount(debit({ linkedAccountId: 'debit-1' }), accounts) ?? '', /itself/i)
  assert.match(validateAccount(debit({ linkedAccountId: 'bank-usd' }), accounts) ?? '', /same currency/i)
  assert.match(validateAccount(debit({ linkedAccountId: 'bank-old' }), accounts) ?? '', /archived/i)
  assert.equal(validateAccount(debit({ linkedAccountId: 'bank-old', archived: true }), accounts), null)
  assert.match(validateAccount(credit({ linkedAccountId: 'bank-1' }), accounts) ?? '', /only debit cards can be linked/i)
})

test('editing a bank cannot break its linked debit cards', () => {
  const data = withAccounts(bank(), debit())
  assert.throws(() => saveAccount(data, bank({ currency: 'USD' })), /linked debit card/i)
  assert.throws(() => saveAccount(data, bank({ archived: true })), /linked debit card/i)
  assert.throws(() => saveAccount(data, { ...bank(), kind: 'credit' }), /linked debit card/i)
  assert.doesNotThrow(() => saveAccount(data, bank({ balance: 20 })))
})

test('setAccountArchived protects linked debit cards and dangling references', () => {
  const data = withAccounts(bank(), debit(), credit())
  assert.throws(() => setAccountArchived(data, 'bank-1', true), /archive or unlink.*debit/i)
  assert.throws(() => setAccountArchived(data, 'nope', true), /not found/i)

  const debitArchived = setAccountArchived(data, 'debit-1', true)
  assert.equal(data.accounts[1].archived, false, 'immutable')
  const bankArchived = setAccountArchived(debitArchived, 'bank-1', true)
  assert.equal(bankArchived.accounts[0].archived, true)
  assert.equal(bankArchived.accounts[2], data.accounts[2])

  assert.throws(() => setAccountArchived(bankArchived, 'debit-1', false), /archived/i)
  const restored = setAccountArchived(setAccountArchived(bankArchived, 'bank-1', false), 'debit-1', false)
  assert.deepEqual(restored.accounts.map((a) => a.archived), [false, false, false])

  const dangling = withAccounts(debit({ archived: true }))
  assert.throws(() => setAccountArchived(dangling, 'debit-1', false), /linked account does not exist/i)
})

test('nextMonthlyDate includes today, clamps short months and rolls over December', () => {
  assert.equal(nextMonthlyDate(24, '2026-10-24'), '2026-10-24')
  assert.equal(nextMonthlyDate(23, '2026-10-24'), '2026-11-23')
  assert.equal(nextMonthlyDate(31, '2026-11-05'), '2026-11-30')
  assert.equal(nextMonthlyDate(31, '2027-02-01'), '2027-02-28')
  assert.equal(nextMonthlyDate(31, '2028-02-01'), '2028-02-29')
  assert.equal(nextMonthlyDate(30, '2028-01-31'), '2028-02-29')
  assert.equal(nextMonthlyDate(5, '2026-12-20'), '2027-01-05')
  assert.equal(nextMonthlyDate(31, '2026-12-31'), '2026-12-31')
  assert.throws(() => nextMonthlyDate(0, '2026-10-24'))
  assert.throws(() => nextMonthlyDate(5, '2026-13-01'))
})

test('upcomingAccountDates lists payment, closing, fee and expiry dates for active accounts', () => {
  const accounts = [
    credit({
      fees: [{ id: 'cm', name: 'Cuota de manejo', amount: 45_000, cadence: 'monthly', nextChargeDate: '2026-01-31' }],
      expiresOn: '2026-11',
    }),
    bank({ id: 'old', archived: true, fees: [{ id: 'x', name: 'Old', amount: 1, cadence: 'monthly', nextChargeDate: '2026-10-25' }] }),
  ]
  const dates = upcomingAccountDates(accounts, '2026-10-24')
  assert.deepEqual(dates.map((d) => [d.type, d.date]), [
    ['payment', '2026-10-31'],
    ['fee', '2026-10-31'],
    ['closing', '2026-11-15'],
    ['expiry', '2026-11-30'],
  ])
  const payment = dates[0]
  assert.equal(payment.accountId, 'credit-1')
  assert.equal(payment.accountName, 'Visa Gold')
  assert.equal(payment.amount, 120_000)
  assert.equal(payment.currency, 'COP')
  assert.equal(dates[1].amount, 45_000)
  assert.equal(new Set(dates.map((d) => d.id)).size, dates.length)
})

test('stale fee dates advance from their original anchor; once fees and past expiry do not recur', () => {
  const account = bank({
    fees: [
      { id: 'm31', name: 'Monthly 31', amount: 1, cadence: 'monthly', nextChargeDate: '2027-01-31' },
      { id: 'q', name: 'Quarterly', amount: 3, cadence: 'quarterly', nextChargeDate: '2026-11-30' },
      { id: 'y', name: 'Yearly leap', amount: 12, cadence: 'yearly', nextChargeDate: '2024-02-29' },
      { id: 'once-past', name: 'Setup', amount: 9, cadence: 'once', nextChargeDate: '2027-01-01' },
      { id: 'once-future', name: 'Replacement', amount: 9, cadence: 'once', nextChargeDate: '2027-06-01' },
      { id: 'no-date', name: 'Undated', amount: 9, cadence: 'monthly' },
    ],
  })
  const card = debit({ expiresOn: '2027-01' })
  const dates = upcomingAccountDates([account, card], '2027-03-15', 50)
  const byId = Object.fromEntries(dates.map((d) => [d.id, d.date]))
  assert.equal(byId['bank-1:fee:m31'], '2027-03-31', 'monthly day 31 does not drift to the 28th')
  assert.equal(byId['bank-1:fee:q'], '2027-05-30')
  assert.equal(byId['bank-1:fee:y'], '2028-02-29')
  assert.equal(byId['bank-1:fee:once-future'], '2027-06-01')
  assert.ok(!('bank-1:fee:once-past' in byId))
  assert.ok(!dates.some((d) => d.type === 'expiry'))
  assert.equal(dates.length, 4)
})

test('upcomingAccountDates is sorted and bounded by limit', () => {
  const accounts = Array.from({ length: 30 }, (_, i) => credit({ id: `c${i}`, name: `Card ${i}`, dueDay: (i % 28) + 1 }))
  const dates = upcomingAccountDates(accounts, '2026-10-24')
  assert.equal(dates.length, 12)
  const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date))
  assert.deepEqual(dates.map((d) => d.date), sorted.map((d) => d.date))
  assert.equal(dates[0].date, '2026-10-24')
  assert.equal(upcomingAccountDates(accounts, '2026-10-24', 3).length, 3)
  assert.equal(upcomingAccountDates(accounts, '2026-10-24', 0).length, 0)
  assert.ok(upcomingAccountDates(accounts, '2026-10-24', 10_000).length <= 100)
})

test('accountSummaries separates signed bank balance from credit debt per currency', () => {
  const fees = [
    { id: 'm', name: 'Monthly', amount: 10_000, cadence: 'monthly' as const },
    { id: 'q', name: 'Quarterly', amount: 30_000, cadence: 'quarterly' as const },
    { id: 'y', name: 'Yearly', amount: 120_000, cadence: 'yearly' as const },
    { id: 'o', name: 'Once', amount: 999_999, cadence: 'once' as const },
  ]
  const summaries = accountSummaries([
    bank({ balance: 1_000_000, fees }),
    bank({ id: 'overdraft', balance: -200_000 }),
    credit({ balance: 300_000, creditLimit: 2_000_000 }),
    debit({ fees: [{ id: 'd', name: 'Card fee', amount: 5_000, cadence: 'monthly' }] }),
    bank({ id: 'usd', currency: 'USD', balance: 50.25 }),
    credit({ id: 'usd-card', currency: 'USD', balance: 10.1, creditLimit: 1000 }),
    bank({ id: 'archived', balance: 9_999_999, archived: true }),
  ])
  assert.deepEqual(summaries, [
    { currency: 'COP', bankBalance: 800_000, creditDebt: 300_000, creditLimit: 2_000_000, monthlyFees: 35_000 },
    { currency: 'USD', bankBalance: 50.25, creditDebt: 10.1, creditLimit: 1000, monthlyFees: 0 },
  ])
  assert.deepEqual(accountSummaries([]), [])
})

test('formatAccountMoney uses es-CO with an explicit currency code', () => {
  const clean = (s: string) => s.replace(/\s/g, ' ')
  assert.equal(clean(formatAccountMoney(1_234_567, 'COP')), 'COP 1.234.567')
  assert.equal(clean(formatAccountMoney(12.3, 'USD')), 'USD 12,30')
  assert.match(clean(formatAccountMoney(-200_000, 'COP')), /^-COP 200\.000$/)
  assert.ok(!formatAccountMoney(5, 'USD').includes('$'))
})
