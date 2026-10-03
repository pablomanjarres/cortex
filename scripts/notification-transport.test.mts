import test from 'node:test'
import assert from 'node:assert/strict'
import { createNotificationTransport } from '../electron/notification-transport.ts'

const input = { channel: 'phone' as const, id: 'card-cycle-1', title: 'Card payment', message: 'COP 100 remains', url: 'http://localhost:3456/finance' }
function transport(output: string, error: Error | null = null) {
  let call: { file: string; args: string[]; timeout: number } | undefined
  const sender = createNotificationTransport({
    notifyScript: '/fake/notify.sh', phoneAvailable: () => true,
    nativeAvailable: () => true, nativeSend: () => {},
    execFile: (file, args, options, callback) => {
      call = { file, args, timeout: options.timeout }
      callback(error, output, 'credential-containing stderr must never escape')
    },
  })
  return { sender, call: () => call }
}

test('phone acceptance requires Sent, and stable IDs and URL survive shell argument boundaries', async () => {
  const t = transport('Sent: [scheduled-alert] Card payment\n')
  assert.deepEqual(await t.sender.send(input), { status: 'Sent' })
  assert.equal(t.call()?.file, '/fake/notify.sh')
  assert.deepEqual(t.call()?.args.slice(-6), ['--id', input.id, '--url', input.url, '--url-title', 'Open Cortex'])
  assert.ok(t.call()!.timeout > 30_000 && t.call()!.timeout < 45_000)
})

test('zero exit muted and duplicate-failure output never count as sent', async () => {
  for (const output of ['Muted: [scheduled-alert] category-policy', 'Muted: [scheduled-alert] duplicate-failure']) {
    assert.equal((await transport(output).sender.send(input)).status, 'Muted')
  }
  assert.equal((await transport('').sender.send(input)).status, 'Failed')
})

test('provider errors and timeout are explicit without revealing stderr', async () => {
  const failed = await transport('', new Error('secret token')).sender.send(input)
  assert.deepEqual(failed, { status: 'Failed', error: 'Phone delivery failed' })
  const timedOut = await transport('', Object.assign(new Error('secret token'), { killed: true })).sender.send(input)
  assert.deepEqual(timedOut, { status: 'Failed', error: 'Phone delivery timed out' })
})

test('unavailable channels and native exceptions yield independent failures', async () => {
  const sender = createNotificationTransport({
    notifyScript: '/missing', phoneAvailable: () => false, nativeAvailable: () => true,
    nativeSend: () => { throw new Error('native unavailable') },
    execFile: () => { assert.fail('missing transport must not execute') },
  })
  assert.equal((await sender.send(input)).status, 'Failed')
  assert.equal((await sender.send({ ...input, channel: 'native' })).status, 'Failed')
  assert.equal(sender.readiness().phone.ready, false)
})

test('readiness probe failure remains a typed failure and cannot run the provider', async () => {
  const sender = createNotificationTransport({
    notifyScript: '/fake/notify.sh', phoneAvailable: () => { throw new Error('private platform error') },
    nativeAvailable: () => true, nativeSend: () => {},
    execFile: () => { assert.fail('failed probe must not execute') },
  })
  assert.equal(sender.readiness().phone.ready, false)
  assert.equal((await sender.send(input)).status, 'Failed')
  assert.equal((await sender.send({ ...input, channel: 'native' })).status, 'Sent')
})
