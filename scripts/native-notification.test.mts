import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createNativeNotificationSender } from '../electron/native-notification.ts'

class Notification extends EventEmitter {
  shown = false
  closed = false
  show() { this.shown = true }
  close() { this.closed = true; this.emit('close') }
}
const message = { channel: 'native' as const, id: 'reminder', title: 'Card', message: 'Payment due' }

test('native acceptance waits for show and retains the click action', async () => {
  const notification = new Notification()
  let clicked = 0, settled = false
  const send = createNativeNotificationSender(() => notification, () => { clicked++ })
  const pending = send(message).then(() => { settled = true })
  assert.equal(notification.shown, true)
  assert.equal(settled, false)
  notification.emit('show')
  await pending
  notification.emit('click')
  assert.equal(clicked, 1)
})

test('native failure and missing confirmation cannot claim acceptance', async () => {
  const notification = new Notification()
  const send = createNativeNotificationSender(() => notification, () => {}, 5)
  const pending = send(message)
  notification.emit('failed')
  await assert.rejects(pending, /failed/)
  await assert.rejects(send(message), /not confirmed/)
})
