import { test, expect, mockStores } from './fixtures'

const course = { id: 'calc', name: 'Calculus', difficulty: 'Medium', iconKey: 'calc', semester: 'Term', status: 'Normal', credits: 3 }
const assignment = { id: 'p1', name: 'Parcial 1', courseId: 'calc', type: 'Exam', weight: 0.3, grade: 4, done: true, priority: 'Medium' }

const seed = () => ({
  'cortex-student-semesters': ['Term'],
  'cortex-student-active-semester': 'Term',
  'cortex-student-courses': [course],
  'cortex-student-assignments': [assignment],
  'cortex-student-topics': [],
  'cortex-classes': [],
})

type Assignment = typeof assignment & { grade?: number }
const writesOf = (writes: { key: string }[], key: string) => writes.filter((w) => w.key === key).length

test('grade edits cancel on Escape and restore focus without writing', async ({ page }) => {
  const backend = await mockStores(page, seed())
  await page.goto('/#/student')
  const trigger = page.getByRole('button', { name: 'Edit grade for Parcial 1', exact: true })
  await trigger.click()
  const input = page.getByRole('textbox', { name: 'Grade for Parcial 1', exact: true })
  await expect(input).toBeFocused()
  await input.fill('2.5')
  await input.press('Escape')
  await expect(input).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveText('4.0')
  await page.waitForTimeout(300)
  expect(writesOf(backend.writes, 'cortex-student-assignments')).toBe(0)
})

test('grade Enter writes exactly once and blank clears to unknown', async ({ page }) => {
  const backend = await mockStores(page, seed())
  await page.goto('/#/student')
  const trigger = page.getByRole('button', { name: 'Edit grade for Parcial 1', exact: true })
  await trigger.click()
  const input = page.getByRole('textbox', { name: 'Grade for Parcial 1', exact: true })
  await input.fill('4,5')
  await input.press('Enter')
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveText('4.5')
  await page.waitForTimeout(300)
  expect(writesOf(backend.writes, 'cortex-student-assignments')).toBe(1)
  expect((backend.stores['cortex-student-assignments'] as Assignment[])[0].grade).toBe(4.5)

  await trigger.click()
  await input.fill('')
  await input.press('Enter')
  await expect(trigger).toHaveText('—')
  await expect.poll(() => (backend.stores['cortex-student-assignments'] as Assignment[])[0].grade).toBeUndefined()
  expect(writesOf(backend.writes, 'cortex-student-assignments')).toBe(2)
})

test('out-of-range grade is rejected on Enter and discarded on blur', async ({ page }) => {
  const backend = await mockStores(page, seed())
  await page.goto('/#/student')
  await page.getByRole('button', { name: 'Edit grade for Parcial 1', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Grade for Parcial 1', exact: true })
  await input.fill('7')
  await input.press('Enter')
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('heading', { name: 'Courses', exact: true }).click()
  await expect(input).toHaveCount(0)
  await page.waitForTimeout(300)
  expect(writesOf(backend.writes, 'cortex-student-assignments')).toBe(0)
})

test('weight blur writes once, rejects over 100%, and credits share the editor', async ({ page }) => {
  const backend = await mockStores(page, seed())
  await page.goto('/#/student')
  const weight = page.getByRole('button', { name: 'Edit weight for Parcial 1', exact: true })
  await expect(weight).toHaveText('30%')
  await weight.click()
  const weightInput = page.getByRole('textbox', { name: 'Weight for Parcial 1', exact: true })
  await weightInput.fill('150')
  await weightInput.press('Enter')
  await expect(weightInput).toHaveAttribute('aria-invalid', 'true')
  await weightInput.fill('25')
  await page.getByRole('heading', { name: 'Courses', exact: true }).click()
  await expect(weight).toHaveText('25%')
  await page.waitForTimeout(300)
  expect(writesOf(backend.writes, 'cortex-student-assignments')).toBe(1)
  expect((backend.stores['cortex-student-assignments'] as Assignment[])[0].weight).toBeCloseTo(0.25)

  await page.getByRole('button', { name: /Calculus/ }).first().click()
  const credits = page.getByRole('button', { name: 'Edit credits', exact: true })
  await credits.click()
  const creditsInput = page.getByRole('textbox', { name: 'Credits', exact: true })
  await creditsInput.fill('')
  await creditsInput.press('Enter')
  await expect(creditsInput).toHaveAttribute('aria-invalid', 'true')
  await creditsInput.fill('4')
  await creditsInput.press('Enter')
  await expect(credits).toBeFocused()
  await expect.poll(() => (backend.stores['cortex-student-courses'] as typeof course[])[0].credits).toBe(4)
  expect(writesOf(backend.writes, 'cortex-student-courses')).toBe(1)
})

test('course properties and add rows expose labelled controls', async ({ page }) => {
  await mockStores(page, seed())
  await page.goto('/#/student')
  await page.getByRole('button', { name: /Calculus/ }).first().click()
  await expect(page.getByRole('combobox', { name: 'Semester', exact: true })).toHaveValue('Term')
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('Normal')
  await expect(page.getByRole('combobox', { name: 'Difficulty', exact: true })).toHaveValue('Medium')
  await expect(page.getByRole('combobox', { name: 'Type for Parcial 1', exact: true })).toHaveValue('Exam')
  await page.getByRole('button', { name: 'Assignment', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'New assignment name', exact: true })).toBeFocused()
  await expect(page.getByRole('combobox', { name: 'New assignment type', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'New assignment weight', exact: true })).toBeVisible()
})

test('assignment columns use the shared sortable header', async ({ page }) => {
  await mockStores(page, seed())
  await page.goto('/#/student')
  const deadline = page.getByRole('columnheader', { name: 'Deadline', exact: true })
  const grade = page.getByRole('columnheader', { name: 'Grade', exact: true })
  await expect(deadline).toHaveAttribute('aria-sort', 'ascending')
  await grade.getByRole('button').click()
  await expect(grade).toHaveAttribute('aria-sort', 'ascending')
  await expect(deadline).toHaveAttribute('aria-sort', 'none')
  await grade.getByRole('button').click()
  await expect(grade).toHaveAttribute('aria-sort', 'descending')
})
