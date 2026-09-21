import { expect, test, mockStores } from './fixtures'

const course = { id: 'calculus', name: 'Calculus III', semester: 'Fall', difficulty: 'Hard', iconKey: 'sigma', status: 'Normal', credits: 3 }
const assignment = { id: 'exam', courseId: course.id, name: 'Vector exam', type: 'Exam', deadline: '2026-09-24', done: false, priority: 'High', weight: 0.25 }
const otherAssignment = { id: 'project', courseId: course.id, name: 'Surface project', type: 'Project', deadline: '2026-09-28', done: false, priority: 'Medium', weight: 0.2 }

const viewports = [
  { name: 'desktop', width: 1440, height: 1000, screenshot: '/tmp/cortex-student-desktop.png' },
  { name: 'ipad', width: 834, height: 1112, screenshot: '/tmp/cortex-student-ipad.png' },
  { name: 'phone', width: 390, height: 844, screenshot: '/tmp/cortex-student-phone.png' },
] as const

for (const viewport of viewports) {
  test(`${viewport.name} keeps courses, assignments, and status editing usable`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const backend = await mockStores(page, {
      'cortex-student-semesters': ['Fall'],
      'cortex-student-active-semester': 'Fall',
      'cortex-student-courses': [course],
      'cortex-student-assignments': [assignment, otherAssignment],
      'cortex-student-topics': [],
    })
    await page.goto('/#/student')
    await expect(page.getByRole('heading', { name: 'Assignments', exact: true })).toBeVisible()
    await expect(page.getByLabel('Assignment status filters')).toBeVisible()

    if (viewport.name === 'desktop') {
      const courses = page.locator('aside[aria-label="Courses"]')
      await expect(courses).toBeVisible()
      await expect(page.locator('#student-assignments table')).toBeVisible()
      await courses.getByRole('button', { name: /Calculus III/ }).click()
    } else if (viewport.name === 'ipad') {
      const courses = page.locator('div[aria-label="Courses"]')
      await expect(courses).toBeVisible()
      await expect(page.locator('[id^="student-assignment-card-"]').first()).toBeVisible()
      await courses.getByRole('button', { name: /Calculus III/ }).click()
    } else {
      await page.getByLabel('Course', { exact: true }).selectOption(course.id)
      await expect(page.locator('[id^="student-assignment-card-"]').first()).toBeVisible()
    }
    await expect(page.getByText('Course details', { exact: true })).toBeVisible()

    const status = page.locator('select[aria-label^="Status for"]:visible').first()
    await expect(status).toBeVisible()
    await status.selectOption('Awaiting grade')
    await expect(page.getByRole('button', { name: 'Awaiting grade 1' })).toBeVisible()
    await expect.poll(() => backend.stores['cortex-student-assignments']).toContainEqual({ ...assignment, done: true })
    await page.screenshot({ path: viewport.screenshot, fullPage: true })
  })
}
