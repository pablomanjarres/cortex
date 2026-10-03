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
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('ConstruCredit')
  await page.getByLabel('Project name', { exact: true }).fill('ConstruCredit S.A.S.')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect.poll(() => state.projects[0]?.name).toBe('ConstruCredit S.A.S.')
  await page.getByLabel('Rate (COP/hour)').fill('65000')
  await page.getByRole('button', { name: 'Save rate', exact: true }).click()
  await expect.poll(() => state.projects[0]?.ratePerHour).toBe(65_000)
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()

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
  await page.getByRole('button', { name: 'Reports', exact: true }).click()
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

test('project time shows only billable work while interrupted sessions remain reviewable', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00Z'))
  let state = applyWorkHoursCommand(emptyWorkHoursState(), { type: 'add-project', id: 'cc', name: 'ConstruCredit' }, '2026-09-22T12:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'set-rate', projectId: 'cc', ratePerHour: 65_000 }, '2026-09-22T12:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'set-billing-policy', projectId: 'cc', includedHours: 6, cycleDay: 22, timeZone: 'America/Bogota' }, '2026-09-22T12:00:00Z')
  for (const session of [
    { id: 'client', start: '2026-09-23T12:00:00Z', end: '2026-09-23T16:52:34.139Z', billable: true, description: 'Client delivery' },
    { id: 'support', start: '2026-09-24T12:00:00Z', end: '2026-09-25T01:00:00Z', billable: false, description: 'Internal support' },
  ]) {
    state = applyWorkHoursCommand(state, { type: 'start', id: session.id, projectId: 'cc' }, session.start)
    state = applyWorkHoursCommand(state, { type: 'stop' }, session.end)
    state = applyWorkHoursCommand(state, { type: 'correct-session', sessionId: session.id, startedAt: session.start, endedAt: session.end, description: session.description, billable: session.billable, prUrl: null }, session.end)
  }
  state = applyWorkHoursCommand(state, { type: 'start', id: 'interrupted', projectId: 'cc' }, '2026-09-26T12:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'mark-interrupted' }, '2026-09-26T16:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'start', id: 'running', projectId: 'cc' }, '2026-10-02T11:30:00Z')
  await mockStores(page, { 'cortex-project-time': state })
  await page.goto('/#/projects')

  const panel = page.getByRole('region', { name: 'Project time', exact: true })
  await expect(panel.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  await expect(panel.getByText('Today', { exact: true })).toHaveCount(0)
  await expect(panel.getByText('All time', { exact: true })).toHaveCount(0)
  await expect(panel.getByText('This billing cycle', { exact: true })).toHaveCount(0)
  await expect(panel.getByLabel('Project name', { exact: true })).toHaveCount(0)
  await expect(panel.getByLabel('Rate (COP/hour)')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Session history', exact: true })).toHaveCount(0)
  await expect(page.getByPlaceholder('What was delivered?')).toHaveCount(0)
  await expect(panel.getByText('Sep 22 to Oct 22', { exact: true })).toBeVisible()
  await expect(panel.getByText('4h 53m of 6h', { exact: true })).toBeVisible()
  await expect(panel.getByText('1h 7m', { exact: true })).toBeVisible()
  await expect(panel.getByText('COP 0', { exact: true })).toBeVisible()
  await expect(panel.getByText(/Not included until stopped/)).toBeVisible()

  await panel.getByRole('button', { name: 'History', exact: true }).click()
  const history = page.getByRole('dialog')
  await expect(history.getByText('Client delivery', { exact: true })).toBeVisible()
  await expect.soft(history.getByText('Internal support', { exact: true })).toHaveCount(0)
  await history.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('dialog', { name: 'Review interrupted session' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await panel.getByRole('button', { name: 'Reports', exact: true }).click()
  const reports = page.getByRole('dialog')
  await expect(reports.getByText('Client delivery', { exact: true })).toBeVisible()
  await expect.soft(reports.getByText('Internal support', { exact: true })).toHaveCount(0)
  await expect.soft(reports.getByRole('checkbox', { name: /Include session from/ })).toHaveCount(1)
  await reports.getByRole('button', { name: 'Select all shown', exact: true }).click()
  await expect.soft(reports.getByText('Selected: 1 · Billable 4h 52m', { exact: true })).toBeVisible()
  await expect.soft(reports.getByText(/Worked/)).toHaveCount(0)
  await reports.getByRole('button', { name: 'Close', exact: true }).click()
  expect(state.sessions).toHaveLength(3)
  expect(state.sessions.find((session) => session.id === 'support')?.billable).toBe(false)

  await page.setViewportSize({ width: 700, height: 900 })
  await expect(panel.getByText('4h 53m of 6h', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
