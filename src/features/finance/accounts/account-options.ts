import type { AccountKind, FeeCadence } from './account-model'

export const ACCOUNT_KINDS: { value: AccountKind; label: string }[] = [
  { value: 'bank', label: 'Bank account' }, { value: 'credit', label: 'Credit card' }, { value: 'debit', label: 'Debit card' },
]
export const FEE_CADENCES: { value: FeeCadence; label: string }[] = [
  { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' }, { value: 'once', label: 'One-time' },
]
