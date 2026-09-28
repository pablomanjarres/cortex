import { test, expect, mockStores } from './fixtures'
import { applyWorkHoursCommand, emptyWorkHoursState, type WorkHoursCommand } from '../electron/work-hours-model'

test('a project can be started and stopped from Projects, leaving one saved interval', async ({ page }) => {
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
