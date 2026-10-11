import { test, expect, mockStores } from './fixtures'

const syncedAt = '2026-10-11T15:00:00.000Z'
const imported = {
  schemaVersion: 1,
  source: 'noelle',
  syncedAt,
  status: { lastAttemptAt: syncedAt, lastSuccessfulSyncAt: syncedAt },
  contacts: [{
    id: 'sent-contact', name: 'Fixture recipient', platform: 'x', handle: 'fixture-recipient',
    profileUrl: 'https://x.com/fixture-recipient',
    firstSentAt: '2026-10-10T15:00:00.000Z', lastSentAt: '2026-10-10T15:00:00.000Z',
    conversations: [{
      id: 'thread-1', url: 'https://x.com/messages/1', syncStatus: 'ok', lastObservedAt: syncedAt,
      history: { complete: false, reason: 'Older history is still being collected.' },
      messages: [{
        id: 'message-1', direction: 'outbound', body: 'Fixture outbound message.',
        sentAt: '2026-10-10T15:00:00.000Z', observedAt: syncedAt, deliveryStatus: 'sent',
      }, {
        id: 'message-2', direction: 'inbound', body: 'Fixture incoming reply.',
        sentAt: null, observedAt: syncedAt,
      }],
    }],
  }],
}

test('minimal saved personal contacts render without writes and keep CRM reachable', async ({ page }) => {
  const minimalContact = { id: 'legacy-contact', name: 'Legacy fixture contact', notes: 'Saved record stays intact.' }
  const backend = await mockStores(page, {
    'cortex-contacts': [minimalContact],
    'cortex-noelle-crm': imported,
  })
  await page.goto('/#/social')
  await expect(page.getByText('Legacy fixture contact', { exact: true }).last()).toBeVisible()
  await page.getByPlaceholder('Search contacts...').fill('no match')
  await expect(page.getByText('Legacy fixture contact', { exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: 'CRM', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'DM conversations' })).toBeVisible()
  expect(backend.writes.filter((write) => write.key === 'cortex-contacts')).toHaveLength(0)
  expect(backend.stores['cortex-contacts']).toEqual([minimalContact])
})

test('CRM shows imported outbound and inbound history and stays current without remounting', async ({ page }, testInfo) => {
  const backend = await mockStores(page, { 'cortex-noelle-crm': imported })
  await page.goto('/#/social')
  await page.getByRole('tab', { name: 'CRM', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'DM conversations' })).toBeVisible()
  await page.getByRole('button', { name: /Fixture recipient/ }).click()
  await expect(page.getByText('Fixture outbound message.', { exact: true })).toBeVisible()
  await expect(page.getByText('Fixture incoming reply.', { exact: true })).toBeVisible()
  await expect(page.getByText('Time unavailable', { exact: true })).toBeVisible()
  await expect(page.getByText('History incomplete', { exact: true })).toBeVisible()

  const updated = structuredClone(imported)
  updated.contacts[0].conversations[0].messages.push({
    id: 'message-3', direction: 'inbound', body: 'Fixture follow-up reply.',
    sentAt: syncedAt, observedAt: syncedAt,
  })
  backend.set('cortex-noelle-crm', updated)
  await expect(page.getByText('Fixture follow-up reply.', { exact: true })).toBeVisible({ timeout: 10_000 })
  expect(backend.writes.filter((write) => write.key === 'cortex-noelle-crm')).toHaveLength(0)
  await page.screenshot({ path: testInfo.outputPath('dm-crm-desktop.png'), fullPage: true })
})

test('phone view wraps long message content and exposes sync errors with saved history', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const failed = structuredClone(imported)
  failed.status = { ...failed.status, error: 'Inbox unavailable. Saved history is retained.' } as typeof failed.status
  failed.contacts[0].conversations[0].syncStatus = 'error'
  failed.contacts[0].conversations[0].messages[1].body = 'x'.repeat(500)
  await mockStores(page, { 'cortex-noelle-crm': failed })
  await page.goto('/#/social')
  await page.getByRole('tab', { name: 'CRM', exact: true }).click()
  await expect(page.getByText('Inbox unavailable. Saved history is retained.')).toBeVisible()
  await page.getByRole('button', { name: /Fixture recipient/ }).click()
  await expect(page.getByText('x'.repeat(500), { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('dm-crm-phone.png'), fullPage: true })
})

test('LinkedIn filtering selects the correct platform when contact IDs overlap', async ({ page }) => {
  const both = structuredClone(imported)
  both.contacts.push({
    ...structuredClone(imported.contacts[0]),
    name: 'LinkedIn fixture recipient', platform: 'linkedin', handle: 'linkedin-fixture',
    profileUrl: 'https://www.linkedin.com/in/linkedin-fixture',
    conversations: [{
      ...structuredClone(imported.contacts[0].conversations[0]),
      url: 'https://www.linkedin.com/messaging/thread/fixture-thread',
      messages: [{
        id: 'linkedin-incoming', direction: 'inbound', body: 'LinkedIn fixture reply.',
        sentAt: syncedAt, observedAt: syncedAt,
      }],
    }],
  })
  await mockStores(page, { 'cortex-noelle-crm': both })
  await page.goto('/#/social')
  await page.getByRole('tab', { name: 'CRM', exact: true }).click()
  await page.getByRole('button', { name: 'LinkedIn · 1', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Fixture recipient/ })).toHaveCount(0)
  await page.getByRole('button', { name: /LinkedIn fixture recipient/ }).click()
  await expect(page.getByText('LinkedIn fixture reply.', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open profile' })).toHaveAttribute('href', 'https://www.linkedin.com/in/linkedin-fixture')
})

test('long threads page older messages without discarding stored history', async ({ page }) => {
  const history = structuredClone(imported)
  history.contacts[0].conversations[0].messages = Array.from({ length: 60 }, (_, index) => ({
    id: `history-${String(index).padStart(2, '0')}`, direction: 'inbound', body: `Saved message ${index}.`,
    sentAt: syncedAt, observedAt: syncedAt,
  }))
  await mockStores(page, { 'cortex-noelle-crm': history })
  await page.goto('/#/social')
  await page.getByRole('tab', { name: 'CRM', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Conversation messages' }).getByRole('listitem')).toHaveCount(50)
  await expect(page.getByText('Saved message 0.', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show older messages (10)' }).click()
  await expect(page.getByRole('list', { name: 'Conversation messages' }).getByRole('listitem')).toHaveCount(60)
  await expect(page.getByText('Saved message 0.', { exact: true })).toBeVisible()
})
