import { test, expect, mockStores } from './fixtures'
import { readFile } from 'node:fs/promises'
import { applyWorkHoursCommand, emptyWorkHoursState, type WorkEvidence, type WorkHoursCommand } from '../electron/work-hours-model'

test('a project can be started and stopped from Projects, leaving one saved interval', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', { configurable: true, value: undefined })
  })
  await page.clock.setFixedTime(new Date('2026-09-27T14:20:00.000Z'))
  let state = emptyWorkHoursState()
  const backend = await mockStores(page, { 'cortex-project-time': state })
  let commandTime = '2026-09-27T12:59:00.000Z'
  await page.route('**/api/work-hours/command', async (route) => {
    try {
      const command = route.request().postDataJSON() as WorkHoursCommand
      state = applyWorkHoursCommand(state, command, commandTime)
      backend.set('cortex-project-time', state)
      await route.fulfill({ json: { ok: true, state } })
    } catch (error) {
      await route.fulfill({ status: 400, json: { ok: false, error: String(error) } })
    }
  })

  await page.goto('/#/projects')
  await expect(page.getByRole('heading', { name: 'Project time' })).toBeVisible()
  await page.getByPlaceholder('Project name').fill('ConstruCredit')
  await page.getByRole('button', { name: 'Add project' }).click()
  await expect(page.getByText('ConstruCredit', { exact: true }).first()).toBeVisible()

  commandTime = '2026-09-27T13:00:00.000Z'
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  commandTime = '2026-09-27T14:20:00.000Z'
  await page.getByRole('button', { name: 'Stop', exact: true }).click()

  await expect.poll(() => state.sessions.length).toBe(1)
  expect(state.active).toBeNull()
  expect(state.sessions[0].durationMs).toBe(4_800_000)
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
})

test('a reviewed interval exports only client delivery fields and exact billing', async ({ page }) => {
  const prUrl = 'https://github.com/acme/repo/pull/42'
  let state = applyWorkHoursCommand(emptyWorkHoursState(), { type: 'add-project', id: 'construcredit', name: 'ConstruCredit' }, '2026-09-27T12:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'set-rate', projectId: 'construcredit', ratePerHour: 120_000 }, '2026-09-27T12:01:00Z')
  state = applyWorkHoursCommand(state, { type: 'start', id: 'session-42', projectId: 'construcredit' }, '2026-09-27T13:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'stop' }, '2026-09-27T14:20:00Z')
  state = applyWorkHoursCommand(state, {
    type: 'correct-session', sessionId: 'session-42', startedAt: '2026-09-27T13:00:00Z',
    endedAt: '2026-09-27T14:20:00Z', description: 'Add payment-history scoring', billable: true, prUrl,
  }, '2026-09-27T14:30:00Z')
  const backend = await mockStores(page, { 'cortex-project-time': state })
  await page.route('**/api/work-hours/command', async (route) => {
    const command = route.request().postDataJSON() as WorkHoursCommand
    state = applyWorkHoursCommand(state, command, '2026-09-27T15:00:00Z')
    backend.set('cortex-project-time', state)
    await route.fulfill({ json: { ok: true, state } })
  })
  const evidence: WorkEvidence = {
    pr: { status: 'Merged', number: 42, title: 'Add payment-history scoring', url: prUrl, source: prUrl, commit: 'a81f29c', checkedAt: '2026-09-27T14:55:00Z' },
    ci: { status: 'Passed', tests: 'Passed', build: 'Passed', source: null, commit: 'a81f29c', checkedAt: '2026-09-27T14:55:00Z' },
    deployment: { status: 'Not verified', source: null, commit: 'a81f29c', checkedAt: '2026-09-27T14:55:00Z' },
  }
  await page.route('**/api/work-hours/evidence', async (route) => route.fulfill({ json: evidence }))

  await page.goto('/#/projects')
  await page.getByRole('checkbox', { name: /Include session from/ }).check()
  await page.getByPlaceholder('What was delivered?').fill('Add payment-history scoring')
  await page.getByRole('button', { name: 'Refresh evidence' }).click()
  await expect(page.getByText('PR: Merged')).toBeVisible()
  await expect(page.getByText('Production: Not verified')).toBeVisible()
  await page.getByRole('button', { name: 'Finalize report' }).click()
  await expect.poll(() => state.reports.length).toBe(1)
  expect(state.reports[0].amount).toBe(160_000)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Markdown' }).click()
  const download = await downloadPromise
  const markdown = await readFile(await download.path(), 'utf8')
  expect(markdown).toContain('Add payment-history scoring')
  expect(markdown).toContain('Tests: Passed; Build: Passed')
  expect(markdown).toContain('Not verified')
  expect(markdown).toContain('COP 160,000.00')
  expect(markdown).not.toMatch(/prompt|token|model cost|agent runtime/i)
})
