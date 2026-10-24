import { saveAccount, setAccountArchived, type AccountsData, type FinancialAccount } from './account-model.ts'

export type AccountChange = { type: 'save'; account: FinancialAccount } | { type: 'archive'; id: string; archived: boolean }

/** A rejected rebase leaves the server's value intact and never wedges the shared store queue. */
export function applyAccountChange(data: AccountsData, change: AccountChange): { data: AccountsData; error: string | null } {
  try {
    return { data: change.type === 'save' ? saveAccount(data, change.account) : setAccountArchived(data, change.id, change.archived), error: null }
  } catch (caught) {
    return { data, error: caught instanceof Error ? caught.message : 'Unable to update account.' }
  }
}
