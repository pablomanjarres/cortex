/** Shared main-process delivery boundary. Provider acceptance is not display proof. */
export type NotificationChannel = 'native' | 'phone'
export interface NotificationDelivery { status: 'Sent' | 'Muted' | 'Failed'; error?: string }
export interface NotificationMessage {
  channel: NotificationChannel
  id: string
  title: string
  message: string
  url?: string
  urlTitle?: string
  category?: string
  priority?: number
  sound?: string
}
export type NotificationReadiness = Record<NotificationChannel, { ready: boolean; error?: string }>
export interface NotificationTransportDeps {
  notifyScript: string
  phoneAvailable(): boolean
  nativeAvailable(): boolean
  nativeSend(message: NotificationMessage): void | Promise<void>
  execFile(file: string, args: string[], options: { timeout: number; maxBuffer: number },
    callback: (error: (Error & { killed?: boolean }) | null, stdout: string, stderr: string) => void): unknown
}

export function createNotificationTransport(deps: NotificationTransportDeps) {
  const readiness = (): NotificationReadiness => ({
    native: deps.nativeAvailable() ? { ready: true } : { ready: false, error: 'Native notifications unavailable' },
    phone: deps.phoneAvailable() ? { ready: true } : { ready: false, error: 'Phone sender unavailable' },
  })
  const send = async (input: NotificationMessage): Promise<NotificationDelivery> => {
    const ready = readiness()[input.channel]
    if (!ready.ready) return { status: 'Failed', error: ready.error }
    const message = { ...input, title: input.title.slice(0, 120), message: input.message.slice(0, 2_000) }
    if (message.channel === 'native') {
      try { await deps.nativeSend(message); return { status: 'Sent' } }
      catch { return { status: 'Failed', error: 'Native delivery failed' } }
    }
    const args = ['-c', message.category || 'scheduled-alert', '-t', message.title, '-m', message.message]
    if (message.priority !== undefined) args.push('-p', String(message.priority))
    if (message.sound !== undefined) args.push('-s', message.sound)
    args.push('--id', message.id)
    if (message.url) args.push('--url', message.url, '--url-title', message.urlTitle || 'Open Cortex')
    return new Promise((resolve) => {
      try {
        deps.execFile(deps.notifyScript, args, { timeout: 40_000, maxBuffer: 8_192 }, (error, stdout) => {
          if (error) return resolve({ status: 'Failed', error: error.killed ? 'Phone delivery timed out' : 'Phone delivery failed' })
          if (/^Muted:/m.test(stdout)) return resolve({ status: 'Muted' })
          if (/^Sent:/m.test(stdout)) return resolve({ status: 'Sent' })
          resolve({ status: 'Failed', error: 'Phone sender returned no acceptance' })
        })
      } catch { resolve({ status: 'Failed', error: 'Phone delivery failed' }) }
    })
  }
  return { send, readiness }
}
