import { test, expect, mockStores } from './fixtures'

test('project expansion and the repository link are separate keyboard controls', async ({ page }) => {
  await mockStores(page)
  await page.route('**/api/projects/scan', route => route.fulfill({ json: [{
    name: 'demo', path: '/projects/demo', description: 'A project', type: 'app',
    hasPackageJson: true, hasClaude: false, gitRemote: 'https://github.com/example/demo.git',
    latestCommit: null, workflows: [], techStack: [], scripts: [], connections: [],
  }] }))
  await page.goto('/#/projects')
  const toggle = page.getByRole('button', { name: 'Details for demo', exact: true })
  await expect(toggle).toBeVisible({ timeout: 2000 })
  await toggle.focus()
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const link = page.getByRole('link', { name: 'Open demo on GitHub' })
  await expect(link).toHaveAttribute('href', 'https://github.com/example/demo')
  expect(await link.evaluate(element => element.closest('button'))).toBeNull()
  await link.focus()
  await expect(link).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
})
