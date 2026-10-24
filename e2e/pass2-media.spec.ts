import { test, expect, mockStores } from './fixtures'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7hoAAAAASUVORK5CYII='
const pdf = 'data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsOfCg=='

const course = { id: 'calc', name: 'Calculus', difficulty: 'Medium', iconKey: 'calc', semester: 'Term', status: 'Normal', credits: 3 }
const studentSeed = () => ({
  'cortex-student-semesters': ['Term'],
  'cortex-student-active-semester': 'Term',
  'cortex-student-courses': [course],
  'cortex-student-assignments': [],
  'cortex-student-topics': [],
  'cortex-classes': [],
})
const courseItem = (files: { id: string; name: string; mime: string; size: number }[]) => ({
  id: 'crs-1', title: 'Automata', category: 'pdf', subject: '', content: '', url: '', files, createdAt: '2026-10-23T12:00:00Z',
})

test('student inline inputs commit once on Enter or blur and cancel on Escape', async ({ page }) => {
  const backend = await mockStores(page, studentSeed())
  const writes = (key: string) => backend.writes.filter((w) => w.key === key).length
  await page.goto('/#/student')

  await page.getByRole('button', { name: 'Add semester', exact: true }).click()
  const semester = page.getByRole('textbox', { name: 'New semester name', exact: true })
  await expect(semester).toBeFocused()
  await semester.fill('Dropped')
  await semester.press('Escape')
  await expect(semester).toHaveCount(0)
  await page.waitForTimeout(300)
  expect(writes('cortex-student-semesters')).toBe(0)

  await page.getByRole('button', { name: 'Add semester', exact: true }).click()
  await expect(semester).toHaveValue('')
  await semester.fill('  Term 2  ')
  await semester.press('Enter')
  await expect.poll(() => backend.stores['cortex-student-semesters']).toEqual(['Term 2', 'Term'])
  await page.waitForTimeout(300)
  expect(writes('cortex-student-semesters')).toBe(1)

  await page.getByRole('button', { name: 'Add course', exact: true }).click()
  const newCourse = page.getByRole('textbox', { name: 'New course name', exact: true })
  await newCourse.fill('Physics')
  await page.getByRole('heading', { name: 'Courses', exact: true }).click()
  await expect.poll(() => (backend.stores['cortex-student-courses'] as { name: string; semester: string }[]).map((c) => [c.name, c.semester]))
    .toEqual([['Calculus', 'Term'], ['Physics', 'Term 2']])

  await page.getByRole('button', { name: 'Add course', exact: true }).click()
  await newCourse.press('Enter')
  await expect(newCourse).toHaveCount(0)
  await page.waitForTimeout(300)
  expect((backend.stores['cortex-student-courses'] as unknown[]).length).toBe(2)
})

test('course rename keeps the name on Escape or empty input and saves on Enter', async ({ page }) => {
  const backend = await mockStores(page, studentSeed())
  await page.goto('/#/student')
  await page.getByRole('button', { name: /Calculus/ }).first().click()
  const rename = page.getByRole('button', { name: 'Rename Calculus', exact: true })
  const name = page.getByRole('textbox', { name: 'Course name', exact: true })

  await rename.click()
  await expect(name).toBeFocused()
  await expect(name).toHaveValue('Calculus')
  await name.fill('Wrong')
  await name.press('Escape')
  await expect(rename).toBeVisible()
  await rename.click()
  await expect(name).toHaveValue('Calculus')
  await name.fill('   ')
  await name.press('Enter')
  await expect(rename).toBeVisible()
  await page.waitForTimeout(300)
  expect(backend.writes.filter((w) => w.key === 'cortex-student-courses')).toHaveLength(0)

  await rename.click()
  await name.fill('Calculus II')
  await name.press('Enter')
  await expect(page.getByRole('button', { name: 'Rename Calculus II', exact: true })).toBeVisible()
  await expect.poll(() => (backend.stores['cortex-student-courses'] as { name: string }[])[0].name).toBe('Calculus II')
})

test('courses reject an oversize upload with a visible error and keep existing files', async ({ page }) => {
  const backend = await mockStores(page, { 'cortex-courses': [courseItem([{ id: 'crs-1-1-0.pdf', name: 'Old.pdf', mime: 'application/pdf', size: 10 }])] })
  await page.goto('/#/library?kind=courses')
  await page.getByText('Automata', { exact: true }).click()
  await page.locator('input[type=file][accept="*/*"]').setInputFiles({
    name: 'Huge scan.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(15 * 1024 * 1024 + 1),
  })
  await expect(page.getByRole('alert')).toHaveText('“Huge scan.pdf” is over 15 MB — skipped')
  await page.waitForTimeout(300)
  expect(backend.writes.filter((w) => w.key === 'cortex-courses')).toHaveLength(0)

  await page.locator('input[type=file][accept="*/*"]').setInputFiles({
    name: 'Week 3 notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n'),
  })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(() => (backend.stores['cortex-courses'] as { files: { id: string; name: string }[] }[])[0].files.map((f) => f.name))
    .toEqual(['Old.pdf', 'Week 3 notes.pdf'])
  const added = (backend.stores['cortex-courses'] as { files: { id: string }[] }[])[0].files[1].id
  expect(added).toMatch(/^crs-1-\d+-0\.pdf$/)
})

test('captures reject oversized images without attaching or uploading them', async ({ page }) => {
  const backend = await mockStores(page, {
    'cortex-captures': [{ id: 'cap', title: 'Photos', content: '', source: 'screenshot', url: '', imageIds: [], createdAt: '2026-10-23T12:00:00Z' }],
  })
  let uploads = 0
  await page.route('**/api/media', (route) => { uploads++; return route.fulfill({ json: true }) })
  await page.goto('/#/library?kind=captures')
  await page.getByText('Photos', { exact: true }).click()
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({
    name: 'Huge image.png', mimeType: 'image/png', buffer: Buffer.alloc(15 * 1024 * 1024 + 1),
  })
  await expect(page.getByRole('alert')).toHaveText('“Huge image.png” is over 15 MB — skipped')
  expect(uploads).toBe(0)
  expect(backend.writes.filter(write => write.key === 'cortex-captures')).toHaveLength(0)
})

test('course PDF viewer shows the filename and a Save download; the image lightbox steps and closes', async ({ page }) => {
  await mockStores(page, {
    'cortex-courses': [courseItem([
      { id: 'crs-1-1-0.pdf', name: 'Lecture 1.pdf', mime: 'application/pdf', size: 10 },
      { id: 'crs-1-1-1.png', name: 'Board A.png', mime: 'image/png', size: 10 },
      { id: 'crs-1-1-2.png', name: 'Board B.png', mime: 'image/png', size: 10 },
    ])],
  })
  await page.route('**/api/media?*', (route) =>
    route.fulfill({ json: new URL(route.request().url()).searchParams.get('id')!.endsWith('.pdf') ? pdf : pixel }))
  await page.goto('/#/library?kind=courses')
  await page.getByText('Automata', { exact: true }).click()

  await page.getByTitle('Open Lecture 1.pdf', { exact: true }).click()
  const viewer = page.getByRole('dialog', { name: 'Lecture 1.pdf' })
  await expect(viewer.getByText('Lecture 1.pdf', { exact: true })).toBeVisible()
  await expect(viewer.getByRole('link', { name: 'Save' })).toHaveAttribute('download', 'Lecture 1.pdf')
  await expect(viewer.locator('iframe')).toHaveAttribute('src', /^data:application\/pdf;base64,/)
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)

  await page.getByTitle('Open Board B.png', { exact: true }).click()
  const lightbox = page.getByRole('dialog')
  await expect(lightbox.getByText('2 / 2', { exact: true })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(lightbox.getByText('1 / 2', { exact: true })).toBeVisible()
  await lightbox.getByRole('button', { name: 'Previous image', exact: true }).click()
  await expect(lightbox.getByText('2 / 2', { exact: true })).toBeVisible()
  await expect(lightbox.getByRole('button', { name: 'Go to image 1' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(lightbox).toHaveCount(0)
})

test('materials open PDFs and single images in the shared viewers', async ({ page }) => {
  const file = (id: string, name: string, mime: string) => ({
    id, courseId: 'calc', kind: 'file', name, tags: [], addedAt: '2026-10-23T12:00:00Z', source: 'app',
    file: { mediaId: `${id}.${mime === 'application/pdf' ? 'pdf' : 'png'}`, name, mime, size: 10 },
  })
  await mockStores(page, {
    ...studentSeed(),
    'cortex-study-notes': [],
    'cortex-class-materials': [file('mat-a', 'Syllabus.pdf', 'application/pdf'), file('mat-b', 'Diagram.png', 'image/png')],
  })
  await page.route('**/api/media?*', (route) =>
    route.fulfill({ json: new URL(route.request().url()).searchParams.get('id')!.endsWith('.pdf') ? pdf : pixel }))
  await page.goto('/#/student')
  await page.getByRole('tab', { name: 'Materials', exact: true }).click()

  await page.getByRole('button', { name: 'Open Syllabus.pdf', exact: true }).first().click()
  const viewer = page.getByRole('dialog', { name: 'Syllabus.pdf' })
  await expect(viewer.getByRole('link', { name: 'Save' })).toHaveAttribute('download', 'Syllabus.pdf')
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)

  await page.getByRole('button', { name: 'Open Diagram.png', exact: true }).first().click()
  const lightbox = page.getByRole('dialog', { name: 'Diagram.png' })
  await expect(lightbox.getByRole('img', { name: 'Diagram.png' })).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect(lightbox.getByRole('button', { name: 'Next image' })).toHaveCount(0)
  await expect(lightbox.getByText(/\d+ \/ \d+/)).toHaveCount(0)
})

test('captures read legacy fallback images with their real mime and keep dots in the lightbox', async ({ page }) => {
  await mockStores(page, {
    'cortex-captures': [{ id: 'cap', title: 'Legacy', content: '', source: 'screenshot', url: '', imageIds: ['cap-1-0.png', 'cap-1-1.png'], createdAt: '2026-10-23T12:00:00Z' }],
  })
  await page.route('**/api/media?*', (route) => route.fulfill({ json: null }))
  await page.goto('/#/library?kind=captures')
  // A real JPEG, stored the way the old capture fallback did: raw bytes under a `.png` id.
  await page.evaluate((dataUrl) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 4, height: 4 })
    canvas.getContext('2d')!.fillRect(0, 0, 4, 4)
    localStorage.setItem('cortex-capture-img-cap-1-0.png', canvas.toDataURL('image/jpeg').split(',')[1])
    localStorage.setItem('cortex-capture-img-cap-1-1.png', dataUrl)
  }, pixel)
  await page.reload()
  await expect(page.locator('img[src^="data:image/jpeg;base64,"]').first()).toBeAttached()

  await page.getByText('Legacy', { exact: true }).click()
  await page.locator('img[src^="data:image/jpeg"]').first().click()
  const lightbox = page.getByRole('dialog')
  await expect(lightbox.getByText('1 / 2', { exact: true })).toBeVisible()
  await lightbox.getByRole('button', { name: 'Go to image 2', exact: true }).click()
  await expect(lightbox.getByText('2 / 2', { exact: true })).toBeVisible()
  await expect(lightbox.locator('img')).toHaveAttribute('src', pixel)
  await page.keyboard.press('ArrowRight')
  await expect(lightbox.getByText('1 / 2', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(lightbox).toHaveCount(0)
})

test('deleting a capture clears both the shared and the legacy fallback keys', async ({ page }) => {
  const backend = await mockStores(page, {
    'cortex-captures': [{ id: 'cap', title: 'Old', content: '', source: 'screenshot', url: '', imageIds: ['cap-2-0.png'], createdAt: '2026-10-23T12:00:00Z' }],
  })
  await page.route('**/api/media?*', (route) => route.fulfill({ json: null }))
  await page.addInitScript((dataUrl) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem('cortex-capture-img-cap-2-0.png', dataUrl)
    localStorage.setItem('cortex-media-cap-2-0.png', dataUrl.split(',')[1])
  }, pixel)
  await page.goto('/#/library?kind=captures')
  await page.getByText('Old', { exact: true }).click()
  await page.getByRole('button', { name: 'Delete capture', exact: true }).click()
  await expect.poll(() => (backend.stores['cortex-captures'] as unknown[]).length).toBe(0)
  expect(await page.evaluate(() => [
    localStorage.getItem('cortex-capture-img-cap-2-0.png'),
    localStorage.getItem('cortex-media-cap-2-0.png'),
  ])).toEqual([null, null])
})
