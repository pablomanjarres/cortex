import { test, expect, mockStores } from './fixtures'

const course = { id: 'calc', name: 'Calculus', difficulty: 'Medium', iconKey: 'calc', semester: 'Term', status: 'Normal', credits: 3 }
const work = (id: string, weight: number, grade?: number) =>
  ({ id, name: id, courseId: 'calc', type: 'Exam', weight, grade, done: grade !== undefined, priority: 'Medium' })
const studentSeed = () => ({
  'cortex-student-semesters': ['Term'],
  'cortex-student-active-semester': 'Term',
  'cortex-student-courses': [course],
  'cortex-student-assignments': [work('Parcial 1', 0.25, 4), work('Parcial 2', 0.25, 2), work('Final', 0.5)],
  'cortex-student-topics': [],
  'cortex-classes': [],
})
type Note = { text: string; courseId?: string; courseName?: string; pinned: boolean; tags: string[]; source: string }

test('course card, detail, and semester overview agree on grade standing', async ({ page }) => {
  await mockStores(page, studentSeed())
  await page.goto('/#/student')
  const card = page.getByRole('button', { name: /Calculus/ }).first()
  await expect(card).toContainText('3.0')
  await expect(page.getByText('3.00', { exact: true })).toBeVisible()
  await expect(page.getByText(/max 4\.00/)).toBeVisible()
  await card.click()
  await expect(page.getByText('3.00/5.0', { exact: true })).toBeVisible()
  await expect(page.getByText('4.00/5.0', { exact: true })).toBeVisible()
  await expect(page.getByText('1.50/5.0', { exact: true })).toBeVisible()
  await expect(page.getByText('Graded', { exact: true }).locator('..')).toContainText('50%')
})

test('materials quick notes and the notes composer file under the course', async ({ page }) => {
  const backend = await mockStores(page, { ...studentSeed(), 'cortex-study-notes': [], 'cortex-class-materials': [] })
  await page.goto('/#/student')
  await page.getByRole('tab', { name: 'Materials', exact: true }).click()
  const quick = page.getByRole('textbox', { name: 'Quick note', exact: true })
  await quick.fill('Chain rule first')
  await quick.press('Enter')
  await expect(quick).toHaveValue('')
  await expect.poll(() => (backend.stores['cortex-study-notes'] as Note[])[0]).toMatchObject(
    { text: 'Chain rule first', courseId: 'calc', courseName: 'Calculus', pinned: false, tags: [], source: 'manual' })

  await page.getByRole('tab', { name: 'Notes', exact: true }).click()
  await page.getByRole('textbox', { name: 'New study note', exact: true }).fill('Limits review')
  await page.getByRole('combobox', { name: 'Note course', exact: true }).selectOption('calc')
  await page.getByRole('textbox', { name: 'Note tags', exact: true }).fill('exam, limits')
  await page.getByRole('button', { name: 'Pin this note', exact: true }).click()
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect.poll(() => (backend.stores['cortex-study-notes'] as Note[]).length).toBe(2)
  expect((backend.stores['cortex-study-notes'] as Note[])[0]).toMatchObject(
    { text: 'Limits review', courseId: 'calc', courseName: 'Calculus', pinned: true, tags: ['exam', 'limits'], source: 'manual' })
})

test('thought book sources follow the reading list defaults and delete stays reachable by keyboard', async ({ page }) => {
  await mockStores(page, {
    'cortex-thoughts': [{ id: 'thought', name: 'A useful thought', subline: '', topic: '', book: '', highValue: false }],
  })
  await page.goto('/#/library')
  await page.getByRole('tab', { name: 'Thoughts', exact: true }).click()
  const toggle = page.getByRole('button', { name: 'Details for A useful thought', exact: true })
  await expect(page.locator(`#${await toggle.getAttribute('aria-controls')}`)).toBeAttached()
  const remove = page.getByRole('button', { name: 'Delete thought', exact: true })
  await toggle.focus()
  await page.keyboard.press('Tab')
  await expect(remove).toBeFocused()
  await expect(remove).toHaveCSS('opacity', '1')
  await toggle.click()
  await expect(page.getByLabel('Book source', { exact: true }).locator('option', { hasText: 'The Intelligent Investor' })).toHaveCount(1)
})

test('goal edits stay local until Save and steps add from the card', async ({ page }) => {
  const backend = await mockStores(page, {
    'cortex-goals': [{ id: 'g1', title: 'Run a 10k', status: 'active', createdAt: '2026-01-01T00:00:00Z', progress: 20, area: 'Health' }],
  })
  await page.goto('/#/goals')
  const goalWrites = () => backend.writes.filter((w) => w.key === 'cortex-goals').length
  await page.getByRole('button', { name: 'Edit goal', exact: true }).click()
  await page.getByRole('textbox', { name: 'Goal title', exact: true }).first().fill('Run a marathon')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('Run a 10k', { exact: true })).toBeVisible()
  await page.waitForTimeout(300)
  expect(goalWrites()).toBe(0)

  await page.getByRole('button', { name: 'Edit goal', exact: true }).click()
  await page.getByRole('combobox', { name: 'Goal status', exact: true }).selectOption('done')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('100%', { exact: true })).toBeVisible()
  await expect.poll(() => (backend.stores['cortex-goals'] as { status: string; completedAt?: string }[])[0])
    .toMatchObject({ status: 'done', completedAt: expect.any(String) })

  const step = page.getByRole('textbox', { name: 'Add a step to Run a 10k', exact: true })
  await step.fill('Buy shoes')
  await step.press('Enter')
  await expect(step).toHaveValue('')
  await expect(page.getByText('Buy shoes', { exact: true })).toBeVisible()
})

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7hoAAAAASUVORK5CYII='

test('capture lightbox wraps with arrow keys and buttons', async ({ page }) => {
  await mockStores(page, {
    'cortex-captures': [{ id: 'cap', title: 'Gallery', content: '', source: 'screenshot', url: '', imageIds: ['a.png', 'b.png', 'c.png'], createdAt: '2026-10-23T12:00:00Z' }],
  })
  await page.route('**/api/media?*', (route) => route.fulfill({ json: pixel }))
  await page.goto('/#/library?kind=captures')
  await page.getByText('Gallery', { exact: true }).click()
  await page.getByRole('button', { name: 'Previous image', exact: true }).click()
  await page.locator('img[src^="data:image"]').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('3 / 3', { exact: true })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByText('1 / 3', { exact: true })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(dialog.getByText('3 / 3', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Next image', exact: true }).click()
  await expect(dialog.getByText('1 / 3', { exact: true })).toBeVisible()
})
