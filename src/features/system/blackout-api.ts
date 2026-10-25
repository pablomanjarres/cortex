import { systemApiUrl } from './system-api'
import { isBlackoutState, type BlackoutHost as BlackoutHostKey, type BlackoutState as BlackoutHostState } from '../../../electron/screen-blackout-contract'
export type { BlackoutHost as BlackoutHostKey, BlackoutState as BlackoutHostState } from '../../../electron/screen-blackout-contract'

const BLACKOUT_PATH = '/api/system/blackout'
const REQUEST_TIMEOUT_MS = 50_000

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T
  let message = `HTTP ${response.status}`
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body?.error === 'string' && body.error) message = body.error
  } catch {
    // Non-JSON error body: keep the status line.
  }
  throw new Error(message)
}

export function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'Request timed out'
  return error instanceof Error ? error.message : 'Request failed'
}

export async function fetchBlackoutHosts(signal?: AbortSignal): Promise<BlackoutHostState[]> {
  const response = await fetch(systemApiUrl(BLACKOUT_PATH), { cache: 'no-store', signal: requestSignal(signal) })
  const body = await readJson<{ hosts: BlackoutHostState[] }>(response)
  if (!Array.isArray(body?.hosts) || body.hosts.length !== 2 || !body.hosts.every(isBlackoutState)
    || new Set(body.hosts.map(entry => entry.host)).size !== 2) throw new Error('Unexpected blackout status response')
  return body.hosts
}

/** Asks the server to set one host's overlay; resolves with the state it verified afterwards. */
export async function setBlackout(host: BlackoutHostKey, enabled: boolean, signal?: AbortSignal): Promise<BlackoutHostState> {
  const response = await fetch(systemApiUrl(BLACKOUT_PATH), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host, enabled }),
    signal: requestSignal(signal),
  })
  const verified = await readJson<unknown>(response)
  if (!isBlackoutState(verified) || verified.host !== host || !verified.available || verified.enabled !== enabled) {
    throw new Error('Screen change could not be verified')
  }
  return verified
}
