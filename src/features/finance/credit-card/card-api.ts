export async function cardRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/credit-card/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Credit card service could not be reached.')
  return result as T
}
