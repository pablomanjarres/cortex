import { test, expect, type Page } from '@playwright/test'
import { applyCreditCardCommand, emptyCreditCardState } from '../electron/credit-card-model'
import { CREDIT_CARD_KEY, type CreditCardCommand, type CreditCardState } from '../electron/credit-card-types'

export { test, expect }

/** A fresh, in-memory backend per page; app data never reaches a real service. */
export async function mockStores(
  page: Page,
  initial: Record<string, unknown> = {},
  options: { canonicalizeWrite?: (key: string, data: unknown) => unknown } = {},
) {
  const stores = structuredClone(initial)
  const revisions = new Map(Object.keys(stores).map((key) => [key, 1]))
  const writes: { key: string; data: unknown }[] = []
  const cardCommands: CreditCardCommand[] = []
  const cardTests: string[] = []
  let launchAtLogin = false
  const alertStatus = () => ({ lastCheckedAt: null, outcomes: [], channels: { native: { ready: true }, phone: { ready: true } } })
  const read = (key: string) => stores[key] ?? null
  const revision = (key: string) => revisions.has(key) ? String(revisions.get(key)) : null

  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const json = (data: unknown, headers: Record<string, string> = {}) =>
      route.fulfill({ json: data, headers })

    if (url.pathname === '/api/data/keys') return json(Object.keys(stores))
    if (url.pathname === '/api/data/batch') {
      const keys = (url.searchParams.get('keys') ?? '').split(',')
      return json({ values: Object.fromEntries(keys.map((key) => [key, read(key)])),
        revs: Object.fromEntries(keys.map((key) => [key, revision(key)])) })
    }
    if (url.pathname === '/api/data' && request.method() === 'GET') {
      const key = url.searchParams.get('key') ?? ''
      const rev = revision(key)
      return json(read(key), rev === null ? {} : { 'X-Cortex-Rev': rev })
    }
    if (url.pathname === '/api/data' && request.method() === 'POST') {
      const body = request.postDataJSON() as { key: string; data: unknown; baseRev?: string | null }
      if (body.baseRev != null && body.baseRev !== revision(body.key)) {
        return route.fulfill({ status: 409, json: { error: 'conflict', data: read(body.key), rev: revision(body.key) } })
      }
      const saved = options.canonicalizeWrite?.(body.key, body.data) ?? body.data
      stores[body.key] = saved
      revisions.set(body.key, (revisions.get(body.key) ?? 0) + 1)
      writes.push({ key: body.key, data: structuredClone(saved) })
      return json({ ok: true, rev: revision(body.key), ...(options.canonicalizeWrite ? { data: saved } : {}) })
    }
    if (url.pathname === '/api/credit-card/command' && request.method() === 'POST') {
      const command = request.postDataJSON() as CreditCardCommand
      try {
        const state = applyCreditCardCommand((stores[CREDIT_CARD_KEY] ?? emptyCreditCardState()) as CreditCardState, command,
          await page.evaluate(() => new Date().toISOString()))
        stores[CREDIT_CARD_KEY] = state
        revisions.set(CREDIT_CARD_KEY, (revisions.get(CREDIT_CARD_KEY) ?? 0) + 1)
        cardCommands.push(command)
        return json({ ok: true, state })
      } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : 'Invalid card command' }) }
    }
    if (url.pathname === '/api/credit-card/alerts' || url.pathname === '/api/credit-card/retry') return json(alertStatus())
    if (url.pathname === '/api/credit-card/test') {
      const { channel } = request.postDataJSON() as { channel: string }
      cardTests.push(channel)
      return json({ channel, status: 'Sent', id: 'synthetic-test', title: 'Credit card test', at: new Date().toISOString() })
    }
    if (url.pathname === '/api/credit-card/login') {
      if (request.method() === 'POST') launchAtLogin = request.postDataJSON().enabled === true
      return json({ available: true, enabled: launchAtLogin })
    }
    if (url.pathname.startsWith('/api/')) {
      if (request.method() !== 'GET') return route.fulfill({ status: 405, json: { error: 'Fixture blocks external writes' } })
      return json(/calendar|scheduled-tasks|projects\/scan|media|keychain/.test(url.pathname) ? [] : {})
    }
    if (url.origin === 'http://127.0.0.1:3479') return route.continue()
    return route.abort()
  })

  return {
    stores,
    writes,
    cardCommands,
    cardTests,
    set(key: string, data: unknown) {
      stores[key] = structuredClone(data)
      revisions.set(key, (revisions.get(key) ?? 0) + 1)
    },
  }
}
