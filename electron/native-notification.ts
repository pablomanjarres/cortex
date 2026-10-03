import type { NotificationMessage } from './notification-transport.js'

interface NativeNotification {
  once(event: 'show' | 'failed' | 'close', listener: () => void): unknown
  on(event: 'click', listener: () => void): unknown
  show(): void
  close(): void
}

/** Await the native show/failure event, retain click handlers, and bound references. */
export function createNativeNotificationSender(
  create: (message: NotificationMessage) => NativeNotification,
  onClick: () => void,
  timeoutMs = 8_000,
) {
  const active = new Map<string, NativeNotification>()
  return async (message: NotificationMessage): Promise<void> => {
    active.get(message.id)?.close()
    const notification = create(message)
    active.set(message.id, notification)
    if (active.size > 100) {
      const oldest = active.keys().next().value
      if (oldest) { active.get(oldest)?.close(); active.delete(oldest) }
    }
    notification.on('click', onClick)
    notification.once('close', () => {
      if (active.get(message.id) === notification) active.delete(message.id)
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        active.delete(message.id)
        reject(new Error('Native notification was not confirmed'))
      }, timeoutMs)
      notification.once('show', () => { clearTimeout(timer); resolve() })
      notification.once('failed', () => {
        clearTimeout(timer); active.delete(message.id)
        reject(new Error('Native notification failed'))
      })
      try { notification.show() }
      catch (error) { clearTimeout(timer); active.delete(message.id); reject(error) }
    })
  }
}
