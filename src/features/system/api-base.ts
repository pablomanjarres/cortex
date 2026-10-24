// In Electron prod, the renderer is loaded from file:// — relative /api URLs
// don't resolve to the local web server, so fall back to localhost:3456.
// In browser/PWA over Tailscale, same-origin relative paths work directly.
export const API_BASE = (typeof window !== 'undefined' && window.location.protocol === 'file:')
  ? 'http://127.0.0.1:3456'
  : ''

/**
 * One bounded GET of a local Cortex endpoint. Resolves to the body when it
 * passes `guard`, or null when Cortex could not be reached within `timeoutMs`,
 * answered with an error status, or sent something unreadable. Throws only
 * when the caller's own `signal` aborted. Never retries.
 */
export async function readLocalJson<T>(path: string, guard: (value: unknown) => value is T, timeoutMs: number, signal?: AbortSignal): Promise<T | null> {
  const timeout = AbortSignal.timeout(timeoutMs)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (!response.ok) return null
    const body: unknown = await response.json()
    return guard(body) ? body : null
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
}
