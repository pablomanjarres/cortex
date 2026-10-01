# Student Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Replace the oversized Student overview with a compact responsive workspace where courses, deadlines, assignments, and status editing stay together.

**Architecture:** `StudentPage` keeps store ownership and coordination while focused components render the header, course selector, assignment workspace, and course drawer. Pure helpers own status transitions and derived grade summaries so tests can verify behavior without a browser. Desktop renders a course rail and table, iPad uses a course strip with a responsive table or cards, and phone uses a course select with assignment cards.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS 4, Node test runner, Playwright, Electron

**Spec:** `docs/superpowers/specs/2026-09-21-student-workspace-redesign.md`

## Global Constraints

* Preserve existing Student store keys and data shapes.
* Use the existing Cortex colors, type, spacing, buttons, chips, and surfaces.
* Expose Open, Awaiting grade, and Graded as direct controls anywhere status can change.
* Keep Topics and Notes in a compact course drawer that is collapsed by default.
* Support 1440 by 1000 desktop, 834 by 1112 iPad portrait, and 390 by 844 phone viewports.
* Keep touch controls at least 44 pixels tall on touch layouts.
* Do not run or post a code review.

***

### Task 1: Assignment status transitions

**Files:**
* Modify: `src/features/student/student-overview.ts`
* Modify: `scripts/student-overview.test.mts`

**Interfaces:**
* Consumes: `Assignment` and `AssignmentStatus`.
* Produces: `applyAssignmentStatus(assignment: Assignment, status: AssignmentStatus): Assignment`.

- [x] **Step 1: Write failing transition tests**

Add tests that assert these exact transitions:

```ts
assert.deepEqual(applyAssignmentStatus(open, 'Awaiting grade'), {
  ...open,
  done: true,
  grade: undefined,
})
assert.deepEqual(applyAssignmentStatus(graded, 'Open'), {
  ...graded,
  done: false,
  grade: undefined,
})
assert.deepEqual(applyAssignmentStatus(open, 'Graded'), {
  ...open,
  done: true,
  grade: undefined,
})
```

- [x] **Step 2: Run the focused test and confirm RED**

Run: `npx tsx --test scripts/student-overview.test.mts`

Expected: failure because `applyAssignmentStatus` is missing.

- [x] **Step 3: Implement the pure transition helper**

```ts
export function applyAssignmentStatus(assignment: Assignment, status: AssignmentStatus): Assignment {
  if (status === 'Open') return { ...assignment, done: false, grade: undefined }
  if (status === 'Awaiting grade') return { ...assignment, done: true, grade: undefined }
  return { ...assignment, done: true }
}
```

- [x] **Step 4: Run the focused test and confirm GREEN**

Run: `npx tsx --test scripts/student-overview.test.mts`

Expected: all Student overview tests pass.

- [x] **Step 5: Commit the behavior**

```bash
git add scripts/student-overview.test.mts
git commit -m "test(student): define assignment status transitions"
git add src/features/student/student-overview.ts
git commit -m "feat(student): support direct status changes"
```

### Task 2: Compact workspace header and course selector

**Files:**
* Create: `src/features/student/StudentWorkspaceHeader.tsx`
* Create: `src/features/student/CourseSelector.tsx`
* Create: `scripts/student-workspace-shell.test.mts`

**Interfaces:**
* Consumes: active semester, semester list, active courses, grade summaries, selected course, overview counts, and callbacks owned by `StudentPage`.
* Produces: `StudentWorkspaceHeader` and `CourseSelector` components with labeled status filters and course controls.

- [x] **Step 1: Write failing static markup tests**

Render both components with two courses and assert:

```ts
assert.match(html, /Open 4/)
assert.match(html, /Awaiting grade 2/)
assert.match(html, /Current average 4\.6/)
assert.match(html, /All courses/)
assert.match(html, /Algorithms/)
assert.match(html, /Databases/)
assert.match(html, /aria-pressed="true"/)
```

- [x] **Step 2: Run the new test and confirm RED**

Run: `npx tsx --test scripts/student-workspace-shell.test.mts`

Expected: module resolution failure because the two components do not exist.

- [x] **Step 3: Implement the header**

The header renders semester pills, Add semester, Add assignment, and three small status metrics. Each status metric is a button that calls `onStatusFilter` with its status. Current average is read only.

Use one compact surface with `flex-wrap`, small metric cells, and no hero height.

- [x] **Step 4: Implement the course selector**

Render the same course data in three responsive controls:

```tsx
<nav className="hidden lg:flex" aria-label="Courses">...</nav>
<div className="hidden overflow-x-auto sm:flex lg:hidden" aria-label="Courses">...</div>
<label className="sm:hidden">Course<select aria-label="Course">...</select></label>
```

The selected control calls `onSelectCourse`. Every layout includes All courses and Add course.

- [x] **Step 5: Run the new test and confirm GREEN**

Run: `npx tsx --test scripts/student-workspace-shell.test.mts`

Expected: all shell tests pass.

- [x] **Step 6: Commit tests and components separately**

```bash
git add scripts/student-workspace-shell.test.mts
git commit -m "test(student): define compact workspace shell"
git add src/features/student/StudentWorkspaceHeader.tsx src/features/student/CourseSelector.tsx
git commit -m "feat(student): add compact workspace shell"
```

### Task 3: Reusable assignment status control

**Files:**
* Create: `src/features/student/AssignmentStatusControl.tsx`
* Create: `scripts/assignment-status-control.test.mts`

**Interfaces:**
* Consumes: `status: AssignmentStatus`, `onChange(status: AssignmentStatus): void`, and optional compact styling.
* Produces: a labeled native select with all three statuses and a minimum touch height on narrow layouts.

- [x] **Step 1: Write the failing render test**

```ts
assert.match(html, /aria-label="Status for Lab report"/)
assert.match(html, /<option value="Open" selected="">Open<\/option>/)
assert.match(html, /<option value="Awaiting grade">Awaiting grade<\/option>/)
assert.match(html, /<option value="Graded">Graded<\/option>/)
```

- [x] **Step 2: Run the test and confirm RED**

Run: `npx tsx --test scripts/assignment-status-control.test.mts`

Expected: module resolution failure because `AssignmentStatusControl` does not exist.

- [x] **Step 3: Implement the control**

Use the three values from `ASSIGNMENT_STATUSES`. Apply existing semantic colors based on the current status. Keep the visible text because color alone cannot communicate status.

- [x] **Step 4: Run the test and confirm GREEN**

Run: `npx tsx --test scripts/assignment-status-control.test.mts`

Expected: the status control test passes.

- [x] **Step 5: Commit**

```bash
git add scripts/assignment-status-control.test.mts
git commit -m "test(student): define direct status control"
git add src/features/student/AssignmentStatusControl.tsx
git commit -m "feat(student): add direct status control"
```

### Task 4: Responsive assignment workspace

**Files:**
* Create: `src/features/student/AssignmentWorkspace.tsx`
* Create: `src/features/student/AssignmentTable.tsx`
* Create: `src/features/student/AssignmentCardList.tsx`
* Create: `scripts/assignment-workspace.test.mts`

**Interfaces:**
* Consumes: filtered assignments, due soon assignments, course map, active filters, sort state, editing callbacks, and Add assignment.
* Produces: one responsive assignment workspace with due soon actions, desktop table, and phone cards.
* Uses: `AssignmentStatusControl` from Task 3.

- [x] **Step 1: Write failing workspace markup tests**

Assert that a due assignment renders one actionable item with these labels:

```ts
assert.match(html, /Due soon/)
assert.match(html, /Open Lab report/)
assert.match(html, /Edit deadline for Lab report/)
assert.match(html, /Status for Lab report/)
assert.match(html, /All assignments/)
assert.match(html, /hidden sm:table/)
assert.match(html, /sm:hidden/)
```

- [x] **Step 2: Run the test and confirm RED**

Run: `npx tsx --test scripts/assignment-workspace.test.mts`

Expected: module resolution failure because `AssignmentWorkspace` does not exist.

- [x] **Step 3: Implement assignment table and cards**

The table renders assignment, status, type, weight, grade, deadline, and actions. The card renders assignment, course, status, deadline, grade, and Edit. Both call the same callbacks.

Use a button for the assignment name so `onOpenAssignment` has the same meaning everywhere.

- [x] **Step 4: Implement due soon and filters**

Due soon renders the existing deadline queue inside the workspace. Each item has Open assignment, status control, and date input. Type and status filters remain directly above All assignments.

Do not render a duplicate full row inside Due soon. The due item is a short action strip and the editable record remains in All assignments.

- [x] **Step 5: Run the test and confirm GREEN**

Run: `npx tsx --test scripts/assignment-workspace.test.mts`

Expected: all workspace tests pass.

- [x] **Step 6: Commit in test and production slices**

```bash
git add scripts/assignment-workspace.test.mts
git commit -m "test(student): define responsive assignment workspace"
git add src/features/student/AssignmentTable.tsx src/features/student/AssignmentCardList.tsx
git commit -m "feat(student): add responsive assignment views"
git add src/features/student/AssignmentWorkspace.tsx
git commit -m "feat(student): add actionable assignment workspace"
```

### Task 5: Compact course details drawer

**Files:**
* Create: `src/features/student/CourseDetailsDrawer.tsx`
* Create: `scripts/course-details-drawer.test.mts`
* Modify: `src/features/student/StudentPage.tsx`

**Interfaces:**
* Consumes: the existing `CourseDetail` props plus selected course grade summary.
* Produces: a collapsed `details` element with a one row summary and existing settings, topics, and notes inside.

- [x] **Step 1: Write the failing drawer test**

```ts
assert.match(html, /<details/)
assert.doesNotMatch(html, /<details open/)
assert.match(html, /Systems Engineering/)
assert.match(html, /3 credits/)
assert.match(html, /Current 4\.5/)
assert.match(html, /Topics/)
assert.match(html, /Course notes/)
```

- [x] **Step 2: Run the test and confirm RED**

Run: `npx tsx --test scripts/course-details-drawer.test.mts`

Expected: module resolution failure because `CourseDetailsDrawer` does not exist.

- [x] **Step 3: Move course details into the drawer component**

Reuse the existing editing behavior. The closed summary uses a compact flex row. The open content uses one column below 640 px and two columns above it. Limit Notes to `min-h-24 max-h-48` with vertical resize.

- [x] **Step 4: Remove the old local CourseDetail implementation**

Import `CourseDetailsDrawer` into `StudentPage`. Preserve all callbacks and course deletion cleanup.

- [x] **Step 5: Run the test and confirm GREEN**

Run: `npx tsx --test scripts/course-details-drawer.test.mts`

Expected: drawer test passes.

- [x] **Step 6: Commit**

```bash
git add scripts/course-details-drawer.test.mts
git commit -m "test(student): define compact course drawer"
git add src/features/student/CourseDetailsDrawer.tsx src/features/student/StudentPage.tsx
git commit -m "feat(student): collapse course details"
```

### Task 6: Integrate the new workspace and remove oversized panels

**Files:**
* Modify: `src/features/student/StudentPage.tsx`
* Delete: `src/features/student/StudentOverviewCards.tsx`
* Modify: `scripts/student-overview-card.test.mts`
* Modify: `scripts/student-workspace-shell.test.mts`

**Interfaces:**
* Consumes: all components from Tasks 2 through 5.
* Produces: the complete Student overview with store updates and calendar synchronization intact.

- [x] **Step 1: Replace the old hero test with integration source assertions**

Assert the page imports and renders `StudentWorkspaceHeader`, `CourseSelector`, `AssignmentWorkspace`, and `CourseDetailsDrawer`. Assert the old `StudentOverviewCards`, separate Deadline queue card, PREP panel, and Semester overview card are absent.

- [x] **Step 2: Run focused tests and confirm RED**

Run: `npx tsx --test scripts/student-overview-card.test.mts scripts/student-workspace-shell.test.mts`

Expected: failure because `StudentPage` still contains the old panels.

- [x] **Step 3: Wire status updates through the pure helper**

```ts
const setAssignmentStatus = (id: string, status: AssignmentStatus) =>
  update((items) => items.map((item) =>
    item.id === id ? applyAssignmentStatus(item, status) : item
  ))
```

When Graded is chosen without a grade, set the assignment to Awaiting grade and focus its grade editor. Keep the stored representation valid.

- [x] **Step 4: Replace the page layout**

Render the compact header first. Render a two column desktop workspace with `CourseSelector` and `AssignmentWorkspace`. Render the selected `CourseDetailsDrawer` directly below. Remove the old hero, card grid, PREP box, deadline card, semester card, and legacy assignment table markup.

- [x] **Step 5: Preserve add and navigation flows**

Add assignment chooses the selected course. If All courses is selected, the editor requires a course selection. Opening an assignment selects its course, restores its type and status filter, then focuses its table row or phone card.

- [x] **Step 6: Run focused tests and confirm GREEN**

Run: `npx tsx --test scripts/student-overview.test.mts scripts/student-overview-card.test.mts scripts/student-workspace-shell.test.mts scripts/assignment-status-control.test.mts scripts/assignment-workspace.test.mts scripts/course-details-drawer.test.mts`

Expected: all Student tests pass.

- [x] **Step 7: Commit the integration**

```bash
git add scripts/student-overview-card.test.mts scripts/student-workspace-shell.test.mts
git commit -m "test(student): define compact overview integration"
git add src/features/student/StudentPage.tsx src/features/student/StudentOverviewCards.tsx
git commit -m "feat(student): replace overview with compact workspace"
```

### Task 7: Responsive browser verification

**Files:**
* Create: `scripts/student-workspace.e2e.ts`
* Modify: `playwright.config.ts` only if the existing config cannot target the running app.

**Interfaces:**
* Consumes: the running Cortex web app and persisted Student data.
* Produces: assertions and screenshots for desktop, iPad, and phone layouts.

- [x] **Step 1: Write the browser assertions**

For each viewport, navigate to `/#/student`, then assert the assignment workspace and Awaiting grade control are visible. Desktop asserts the course rail and table. iPad asserts the course strip. Phone asserts the course select and assignment cards. Change one disposable assignment to Awaiting grade and assert the summary count changes, then restore its original status.

- [x] **Step 2: Run the browser test and fix only observed failures**

Run: `npx playwright test scripts/student-workspace.e2e.ts`

Expected: all three projects pass. If browser projects are not configured, run the same script with Chromium viewports in one test.

- [x] **Step 3: Capture three screenshots**

Save screenshots under `/tmp` as:

* `/tmp/cortex-student-desktop.png`
* `/tmp/cortex-student-ipad.png`
* `/tmp/cortex-student-phone.png`

Inspect each screenshot for clipping, duplicate controls, horizontal page scrolling, and touch target spacing.

- [x] **Step 4: Commit the browser test**

```bash
git add scripts/student-workspace.e2e.ts playwright.config.ts
git commit -m "test(student): cover responsive workspace"
```

### Task 8: Full verification, PR update, and installed app

**Files:**
* Modify: `docs/superpowers/plans/2026-09-21-student-workspace-redesign.md` to mark steps complete.
* Modify: PR 49 description and issue 48 with verified behavior.

**Interfaces:**
* Produces: a built, signed, installed Cortex app and an updated PR. No review object is created.

- [x] **Step 1: Run source checks**

Run:

```bash
npm test
npm run build
npx eslint src/features/student scripts/student-overview.test.mts scripts/student-overview-card.test.mts scripts/student-workspace-shell.test.mts scripts/assignment-status-control.test.mts scripts/assignment-workspace.test.mts scripts/course-details-drawer.test.mts
git diff --check
```

Expected: tests, build, targeted lint, and diff check pass. Record any existing unrelated full lint failures separately.

- [x] **Step 2: Build Electron**

Run: `npm run electron:build`

Expected: `release/mac-arm64/Cortex.app` exists.

- [x] **Step 3: Install safely**

Quit Cortex, move the current `/Applications/Cortex.app` to a unique temporary backup, copy the new app, clear extended attributes, apply an ad hoc signature, verify the signature, then open the app. Restore the backup if any install step fails.

- [x] **Step 4: Verify the installed app**

Confirm the installed `app.asar` hash matches the built artifact. Confirm port 3456 is listening. Recheck the two Calculus III sessions and the Student assignment count through the live API. Open Student and repeat the three viewport checks against the installed app.

- [x] **Step 5: Update and push PR 49**

Update the PR body to cover direct status editing and the responsive redesign. Push the branch. Do not run or post code review.

- [x] **Step 6: Record final evidence**

Mark this plan complete and add a short Results section with test counts, build results, installed hash match, live data checks, and screenshot paths.

## Results

- `npm test`: 130 passed, 0 failed.
- `npx playwright test e2e/student-workspace.spec.ts`: 3 passed across desktop, iPad, and phone.
- `npm run build`: passed.
- Targeted ESLint for changed production and E2E files: passed.
- `git diff --check`: passed.
- `npm run electron:build`: passed.
- Built and installed `app.asar` SHA-256: `737fac63297c5fe76a1471e7482f8ec809c8a4662ed2e800ee1b5db434b3f534`.
- `/Applications/Cortex.app`: ad hoc signature verified and port 3456 listening.
- Live Student store: all 87 assignments preserved.
- Live focus store: two Calculus III sessions, 90 minutes each, 180 minutes total, zero Improving entries.
- Installed-app screenshots: `/tmp/cortex-student-installed-desktop.png`, `/tmp/cortex-student-installed-ipad.png`, and `/tmp/cortex-student-installed-phone.png`.
- Repo-wide lint remains broken by 65 existing errors and 11 warnings outside this change.
- PR 49 and issue 48 were updated. No code review was run, per request.
