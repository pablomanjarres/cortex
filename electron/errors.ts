export function errorMessage(error: unknown, fallback = 'Request failed'): string {
  if (typeof error === 'string') return error
  if (error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return fallback
}
