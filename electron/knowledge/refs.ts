// Single owner of Cortex record references (`kind:id`) and the Cortex screen
// each one opens. Vault notes point at Cortex records through their
// `cortex_refs` property using these strings; Cortex resolves a record to its
// note through the vault service. No record data is copied either way.
//
// Pure module: imported by the Electron main process and the renderer.

export const CORTEX_REF_KINDS = ['home', 'venture', 'project', 'goal', 'crm', 'noelle', 'contact', 'research'] as const
export type CortexRefKind = typeof CORTEX_REF_KINDS[number]
export interface CortexRef { kind: CortexRefKind; id: string }

const ID = /^[A-Za-z0-9._:@-]{1,200}$/

/** Projects have no stored id; their folder name, lower-cased and dashed, is the stable key. */
export function projectRefId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

export function formatCortexRef(kind: CortexRefKind, id: string): string {
  if (!CORTEX_REF_KINDS.includes(kind) || !ID.test(id)) throw new Error('Invalid Cortex record reference')
  return `${kind}:${id}`
}

export function parseCortexRef(raw: unknown): CortexRef | null {
  if (typeof raw !== 'string' || raw.length > 220) return null
  const split = raw.indexOf(':')
  if (split < 1) return null
  const kind = raw.slice(0, split) as CortexRefKind, id = raw.slice(split + 1)
  return CORTEX_REF_KINDS.includes(kind) && ID.test(id) ? { kind, id } : null
}

export const refs = {
  home: () => formatCortexRef('home', 'eightfold'),
  project: (name: string) => formatCortexRef('project', projectRefId(name)),
  goal: (id: string) => formatCortexRef('goal', id),
  /** Manually kept CRM contact (cortex-crm). */
  crm: (contactId: string) => formatCortexRef('crm', contactId),
  /** Noelle-synced DM contact; kept distinct from the manual CRM. */
  noelle: (platform: string, contactId: string) => formatCortexRef('noelle', `${platform}:${contactId}`),
  contact: (id: string) => formatCortexRef('contact', id),
  research: (campaignId: string) => formatCortexRef('research', campaignId),
}

/** Hash-router location (path + query) of the Cortex screen showing this record. */
export function cortexRecordLocation(raw: string): string | null {
  const ref = parseCortexRef(raw)
  if (!ref) return null
  const record = encodeURIComponent(raw)
  switch (ref.kind) {
    case 'home': return '/daily'
    case 'venture': return '/founder'
    case 'project': return `/projects?project=${encodeURIComponent(ref.id)}`
    case 'goal': return `/goals?record=${record}`
    case 'crm': return `/social?tab=crm&record=${record}`
    case 'noelle': return `/social?tab=crm&record=${record}`
    case 'contact': return `/social?tab=contacts&record=${record}`
    case 'research': return '/founder?tab=research'
  }
}

/** Absolute Cortex URL for a record, given the app's web origin (e.g. http://localhost:3456). */
export function cortexRecordUrl(origin: string, raw: string): string | null {
  const location = cortexRecordLocation(raw)
  return location ? `${origin.replace(/\/$/, '')}/#${location}` : null
}
