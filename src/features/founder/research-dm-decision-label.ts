import type { ResearchDmDecision } from '../../../electron/founder-research-model'

/** Short state for the prospect list; null while nothing has been decided. */
export function dmDecisionLabel(decision: ResearchDmDecision | undefined): string | null {
  if (!decision) return null
  const verb = decision.decision === 'approve' ? 'approved' : 'skipped'
  if (decision.outcome?.status === 'applied') return `${verb} in Noelle`
  if (decision.outcome?.status === 'failed') return `${verb} · not applied`
  return `${verb} by you`
}
