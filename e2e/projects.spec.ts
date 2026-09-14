import { test, expect, mockStores } from './fixtures'

const project = (name: string) => ({
  name, path: `/fixtures/${name}`, description: name, type: 'app', hasPackageJson: true,
  hasClaude: false, gitRemote: null, latestCommit: null, workflows: [], techStack: [],
  scripts: [], connections: [],
})

for (const empty of [false, true]) {
  test(`a successful ${empty ? 'empty' : 'populated'} project scan replaces the cached list`, async ({ page }) => {
    await mockStores(page, {
      'cortex-cache-projects': { data: [project('Cached project')], lastUpdated: '2026-09-14T12:00:00Z' },
    })
    let release: () => void = () => {}
    const hold = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/api/projects/scan', async (route) => {
      await hold
      await route.fulfill({ json: empty ? [] : [project('Fresh project')] })
    })
    await page.goto('/#/projects')
    await expect(page.getByText('Cached project', { exact: true }).first()).toBeVisible()
    const response = page.waitForResponse('**/api/projects/scan')
    release()
    await response
    await expect(page.getByText('Cached project', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/^\d+ projects/)).not.toContainText('cached')
    if (empty) {
      await expect(page.getByText(/^0 projects/)).toBeVisible()
      await expect(page.getByText('No projects found.', { exact: true })).toBeVisible()
    } else await expect(page.getByText('Fresh project', { exact: true }).first()).toBeVisible()
  })
}
