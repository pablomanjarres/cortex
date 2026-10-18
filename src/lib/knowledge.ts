import { refs, type KnowledgeLinkResult } from '../../electron/knowledge/refs'

export type { KnowledgeLinkResult } from '../../electron/knowledge/refs'

const orNull = <A extends unknown[]>(make: (...args: A) => string) => (...args: A): string | null => {
  try { return make(...args) } catch { return null }
}

/** Record references for UI links; null when an id cannot be referenced (the link is then hidden). */
export const recordRefs = {
  home: orNull(refs.home),
  project: orNull(refs.project),
  goal: orNull(refs.goal),
  crm: orNull(refs.crm),
  noelle: orNull(refs.noelle),
  contact: orNull(refs.contact),
  research: orNull(refs.research),
}

/**
 * Open the vault note linked to a Cortex record (or an Obsidian search for the
 * record when no note links it yet). The desktop app opens Obsidian from the
 * main process; the browser/phone build follows the obsidian:// URI itself.
 */
export async function openKnowledgeRecord(ref: string): Promise<KnowledgeLinkResult> {
  const desktop = window.electronAPI?.knowledge
  if (desktop) return desktop.open(ref)
  if (window.electronAPI) throw new Error('Restart Cortex to open vault notes')
  const response = await fetch(`/api/knowledge/links?ref=${encodeURIComponent(ref)}`, { signal: AbortSignal.timeout(10_000) })
  const value = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(value.error ?? 'The vault is unavailable')
  const link = value as KnowledgeLinkResult
  if (link.uri) window.location.href = link.uri
  return link
}
