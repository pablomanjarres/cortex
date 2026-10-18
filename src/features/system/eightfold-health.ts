import type { KnowledgeHealth } from '../../../electron/knowledge/health-contract'
import { API_BASE } from './api-base'

export type { KnowledgeHealth }

export const HEALTH_POLL_MS = 60_000
export const HEALTH_TIMEOUT_MS = 10_000

/**
 * One bounded read of the runtime's health report. Resolves to the endpoint's
 * own response, or null when Cortex could not be reached in time. Callers
 * decide when to try again; this never retries on its own.
 */
export async function fetchKnowledgeHealth(signal?: AbortSignal): Promise<KnowledgeHealth | null> {
  const timeout = AbortSignal.timeout(HEALTH_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_BASE}/api/knowledge/health`, {
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (!response.ok) return null
    const body = await response.json() as Partial<KnowledgeHealth> | null
    return body && typeof body === 'object' && typeof body.status === 'string' ? body as KnowledgeHealth : null
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
}
