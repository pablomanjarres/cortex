// Client pipeline model shared by the CRM page and its record editor.

// ── Types ────────────────────────────────────────────────────────────────────

export type CrmStatus = 'lead' | 'prospect' | 'active' | 'churned' | 'paused'

export interface CrmContact {
  id: string
  name: string
  company: string
  role: string
  email: string
  phone: string
  website: string
  status: CrmStatus
  value: number
  notes: string
  lastContact: string
  tags: string[]
}

export interface CrmOrg {
  id: string
  name: string
  contacts: CrmContact[]
}

export interface CrmData {
  orgs: CrmOrg[]
  activeOrg: string
}

export const DEFAULT_DATA: CrmData = {
  orgs: [
    { id: 'freelancing', name: 'Freelancing', contacts: [] },
  ],
  activeOrg: 'freelancing',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Pipeline states map to the semantic Chip trio (see OpportunitiesPage):
// only truly semantic states carry a tone; new/incoming stays neutral.
export type ChipVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export const statusConfig: Record<CrmContact['status'], { label: string; chip: ChipVariant }> = {
  lead: { label: 'Lead', chip: 'neutral' },
  prospect: { label: 'Prospect', chip: 'accent' },
  active: { label: 'Active', chip: 'success' },
  churned: { label: 'Churned', chip: 'danger' },
  paused: { label: 'Paused', chip: 'warning' },
}

export const ALL_STATUSES: CrmContact['status'][] = ['lead', 'prospect', 'active', 'churned', 'paused']

export type SortKey = 'name' | 'company' | 'value' | 'status' | 'lastContact'

// Date-only values parse at local noon so they never shift to the previous day.
export function fmtDate(d: string) { return d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '' }
export function fmtMoney(n: number) { return n > 0 ? `$${n.toLocaleString('en-US')}` : '' }
