export type BlackoutHost = 'mac' | 'laptop-w'
export interface BlackoutState {
  host: BlackoutHost
  label: string
  enabled: boolean | null
  available: boolean
  error?: string
}
export interface BlackoutCommand { host: BlackoutHost; enabled: boolean }

export function isBlackoutState(value: unknown): value is BlackoutState {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  return (state.host === 'mac' || state.host === 'laptop-w') && typeof state.label === 'string'
    && typeof state.available === 'boolean'
    && (state.available ? typeof state.enabled === 'boolean' : state.enabled === null)
    && (state.error === undefined || typeof state.error === 'string')
}

/** Accept same-origin web clients and the local desktop renderer. */
export function blackoutOriginAllowed(origin: string | undefined, requestHost: string | undefined, loopback: boolean): boolean {
  if (!origin) return true
  if (origin === 'null') return loopback
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return url.host === requestHost || (loopback && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'))
  } catch { return false }
}
