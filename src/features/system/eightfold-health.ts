import type { KnowledgeHealth } from '../../../electron/knowledge/health-contract'
import { readLocalJson } from './api-base'

export type { KnowledgeHealth }

export const HEALTH_POLL_MS = 60_000
export const HEALTH_TIMEOUT_MS = 10_000

/** The endpoint's own report shape; its fields are interpreted by eightfold-view. */
function isKnowledgeHealth(body: unknown): body is KnowledgeHealth {
  return typeof body === 'object' && body !== null && typeof (body as { status?: unknown }).status === 'string'
}

/**
 * One bounded read of the runtime's health report. Resolves to the endpoint's
 * own response, or null when Cortex could not be reached in time. Callers
 * decide when to try again; this never retries on its own.
 */
export function fetchKnowledgeHealth(signal?: AbortSignal): Promise<KnowledgeHealth | null> {
  return readLocalJson('/api/knowledge/health', isKnowledgeHealth, HEALTH_TIMEOUT_MS, signal)
}
