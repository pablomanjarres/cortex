# Cortex Light Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved colorful Cortex desktop and mobile composition, dark by default with a light option, while preserving every existing data and integration contract.

**Architecture:** Replace tokens and shared visual primitives first, then the shell. Add pure Home selectors and use them in responsive Home components. Add Calendar as a read-only route over the existing range bridge, reshape the Student overview, and visually align the remaining page families without changing their stores.

**Tech Stack:** React 19, TypeScript 5.9, Electron 41, Tailwind v4, Vite 8, Node test runner through `tsx`, existing Recharts and Base UI.

**Spec:** `docs/superpowers/specs/2026-09-19-cortex-light-redesign-design.md`

## Global Constraints

- The three approved images are composition references only; never hard-code their sample people, dates, courses, targets, counts, or quotes.
- Preserve encrypted store keys, Electron preload and HTTP contracts, MCP contracts, finance arithmetic, EventKit mutation semantics, and legacy redirects.
- No `Co-Authored-By`, no push to main, no force-push, no merge. Stage exact files. Never mix test and production files in a commit; each commit changes at most four files and 200 added/deleted lines.
- Light alternative tokens: canvas `#F1F2F7`, surface `#FFFFFF`, ink `#22232B`, secondary `#66707B`, iris `#624AB5`, lilac `#DDD2FF`, lime `#E2F2C7`. Dark is the user-preferred default; keep lilac/lime panels expressive and contrast-safe in both modes.
- Home and Calendar must use actual stores and the existing `getEventsInRange`/`/api/calendar/events` reads. Blank or failed reads must not render invented zero claims.
- Every visual surface works at desktop and phone widths. Keyboard focus, reduced motion, safe areas, and mobile touch targets remain usable.
- The installed `/Applications/Cortex.app` is the final target. Preserve its live encrypted data and verify installation, not just a Vite preview.

---

### Task 1: Shared light visual language

**Files:** Modify `src/index.css`, `index.html`, `src/components/widgets/WidgetCard.tsx`, `src/components/shared/StatTile.tsx`, `src/components/shared/PageHeader.tsx`, `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/tabs.tsx`, `src/components/ui/chip.tsx`, `DESIGN-SYSTEM.md`. Add a local font dependency in `package.json` only if the existing Inter cannot match the approved mockups.

**Interfaces:** Produces the existing component signatures unchanged. Add only optional presentational variants if needed.

- [ ] **Step 1:** Replace the root color variables with the exact Global Constraints palette. Example: `--background: #F1F2F7; --card: #FFFFFF; --foreground: #22232B; --accent: #624AB5;` and define `--focus-surface` and `--progress-surface`. Give `.dark` matching contrast-safe overrides. Remove the forced `dark` class from `index.html` and set its theme color to the light canvas.
- [ ] **Step 2:** Restyle `.surface`, `.surface-strong`, `.liquid-glass`, and global focus/selection rules for quiet white cards on the fog canvas. Remove the old inset graphite shine. Keep semantic success, warning, and danger readable on both themes.
- [ ] **Step 3:** Update shared cards, title typography, controls, and tabs to sentence case, generous padding, approximately 20px card corners and 12px control corners. Preserve every exported prop and variant.
- [ ] **Step 4:** Run `npm run build` and changed-file ESLint. Inspect Home, Student, Finance, and Settings at desktop width before committing visual slices. Split commits by component family under the four-file and 200-line gate.
- [ ] **Step 5:** Replace `DESIGN-SYSTEM.md` with the actual new token/component contract and commit it separately after linting its prose.

### Task 2: Responsive navigation and top bar

**Files:** Modify `src/lib/routes.ts`, `src/components/layout/Sidebar.tsx`, `src/components/layout/Header.tsx`, `src/components/layout/DashboardLayout.tsx`, `src/features/library/LibraryPage.tsx`. Create `src/components/layout/RouteSearch.tsx` and `src/components/layout/MobileNav.tsx` only if keeping those controls isolated makes the shell clearer. Test route/search selection in `scripts/light-navigation.test.mts`.

**Interfaces:** `ROUTES`, `NAV_GROUPS`, `routeForPath`, and `titleForPath` retain their exports. Add Calendar to `ROUTES`; `App.tsx` registration arrives in Task 5. The Capture action goes to `/library?kind=captures`, and LibraryPage selects its existing Captures filter from that query instead of inventing a new write path.

- [ ] **Step 1:** Write a Node test that asserts all old paths still resolve and that `/calendar` is in Today; run `npx tsx --test scripts/light-navigation.test.mts` and observe the new-calendar failure.
- [ ] **Step 2:** Update groups to Today, Build, Study, Life, System and add Calendar without dropping routes. Keep search as route/action navigation only. `ROUTES.filter(route => route.navLabel.toLowerCase().includes(query.toLowerCase()))` is the initial search behavior; Escape closes it and Enter opens the selected route.
- [ ] **Step 3:** Restyle the sidebar and header to match the approved desktop frame. Keep Electron drag regions and a persistent sprint indicator; place the Capture action in the top bar. Add a drawer and four-destination mobile nav with safe-area padding.
- [ ] **Step 4:** Run the new test, build, changed-file lint, and desktop/phone keyboard checks. Commit production and test files in separate commits.

### Task 3: Pure Home data model

**Files:** Create `src/features/daily/home-model.ts`, `scripts/home-model.test.mts`.

**Interfaces:** Export `weekDates(anchor: Date): string[]`, `weeklyFocusMinutes(days: string[], sessionsByDay: Record<string, SprintSession[]>): number[]`, `activeHabitSummary(habits: Array<{id: string; onHold?: boolean}>, completed: Record<string, boolean>): {done: number; total: number}`, and `upcomingAssignments(assignments: Assignment[], now: Date): Assignment[]`. These return stored facts, never display copy.

- [ ] **Step 1:** Test a Monday-to-Sunday week with hand-written date strings, a midnight-started session stored under its start day, held habits excluded from both numerator and denominator, and open deadlines sorted before later ones. Run `npx tsx --test scripts/home-model.test.mts`; each test must fail because the export is missing.
- [ ] **Step 2:** Implement the four pure selectors with local date boundaries. A sample expected assertion is `assert.deepEqual(weeklyFocusMinutes(['2026-09-14'], {'2026-09-14': [{id:'a', task:'X', duration:25, startedAt:'2026-09-14T23:50:00-05:00', completedAt:'2026-09-15T00:15:00-05:00'}]}), [25])`.
- [ ] **Step 3:** Run the focused test, `npm run build`, and changed-file lint. Commit `home-model.ts` and `home-model.test.mts` separately under the test/production split rule.

### Task 3b: Dark-first appearance preference

**Files:** Modify `index.html`, `src/index.css`, `src/main.tsx`, `src/features/settings/SettingsPage.tsx`, `DESIGN-SYSTEM.md`; add a focused theme helper and Node test if useful.

**Interfaces:** Keep the light tokens as an option. A namespaced local cosmetic preference selects dark or light without changing encrypted stores or Electron contracts.

- [ ] **Step 1:** Test missing, invalid, light, and dark saved values. Default to dark. Run the test RED before implementation.
- [ ] **Step 2:** Initialize dark before React mounts, persist theme changes, update the browser theme color, and expose a labelled Dark/Light control in Settings without disrupting its Keychain/data features.
- [ ] **Step 3:** Refine the dark lilac/lime surface tokens for vivid but readable cards. Build, lint changed files, inspect Home and Settings in both themes and mobile width. Commit test and production in separate granular slices.

### Task 4: Home desktop and phone composition

**Files:** Modify `src/features/daily/DailyPage.tsx`, `src/features/daily/UpcomingDeadlines.tsx`; create small components in `src/features/daily/components/` for `FocusHero`, `WeeklyRhythm`, `WeekMap`, and `UpNext`. Reuse Task 3 selectors.

**Interfaces:** Continue to use `useSprintTimer`, `useDailyHabits`, `useStore('cortex-habits')`, dated session keys, and Calendar range reads. Keep Monday audit and tray navigation/update effects. Do not change store write behavior.

- [ ] **Step 1:** Extract the timer into `FocusHero` without changing start, pause, resume, reset, task, or duration behavior. Render only the action valid for current timer state, not simultaneous Start and Pause buttons.
- [ ] **Step 2:** Build the 12-column desktop layout and narrow-screen order from the spec. Read a seven-day range and use Task 3 selectors. Facts name their periods; unset goals show counts, not percentages. Show loading and no-events states honestly.
- [ ] **Step 3:** Compose the day-selected Week map and Up next list from Calendar events and open assignments. Deadline clicks open Student; event clicks open Calendar. A Needs attention strip shows only actual overdue assignments or read failures.
- [ ] **Step 4:** Run focused tests, build, and changed-file lint. Inspect at 1440px, 1024px, and 390px, plus a reduced-motion setting. Commit by component groups and keep each slice under the pre-commit gate.

### Task 5: Calendar read-only route

**Files:** Create `src/features/calendar/CalendarPage.tsx`, `src/features/calendar/calendar-model.ts`, `scripts/calendar-model.test.mts`; modify `src/App.tsx` and possibly `src/lib/routes.ts` only to complete registration.

**Interfaces:** `window.electronAPI?.calendar.getEventsInRange(start, end)` on desktop, otherwise `GET /api/calendar/events?start=...&end=...`. Neither path mutates events. The return shape is `CalendarEventFull[]` from `src/types/electron.d.ts`.

- [ ] **Step 1:** Test `groupCalendarDays(events, weekDates)` with one all-day and one timed event, plus an event crossing midnight. Run `npx tsx --test scripts/calendar-model.test.mts` and observe failure.
- [ ] **Step 2:** Implement the pure grouping selector and read-only day/week UI. Keep calendar name visible and separate all-day from timed events. On a failed HTTP read show a retry action; on an empty result show an access-check hint without claiming denied permission.
- [ ] **Step 3:** Register the lazy route, build and lint changed files, run the model test, then inspect desktop and mobile. Commit implementation and tests separately.

### Task 6: Student overview matching the concept

**Files:** Modify `src/features/student/StudentPage.tsx`, `src/features/student/StudentSection.tsx`; create `src/features/student/StudentOverviewCards.tsx` if needed. Keep `MaterialsTab.tsx` and `NotesTab.tsx` behavior intact.

**Interfaces:** Reuse `Course`, `Assignment`, and existing selectors/actions already defined in StudentPage. No new progress statistic unless it is computed from stored assignments or graded weights with a labelled denominator.

- [ ] **Step 1:** Place actual next open assignment in the lilac study panel, followed by real open-work and class counts and a week workload. Keep the existing grade calculation and assignment completion actions. Empty data must show an add-course or add-assignment action.
- [ ] **Step 2:** Move existing course rows, upcoming deadlines, materials, and notes into the approved hierarchy without losing tabs or detail panels. Do not hard-code CS201, fake percentages, or sample dates.
- [ ] **Step 3:** Build, lint changed files, and visually inspect populated and empty Student states at desktop/phone widths. Commit layout slices under the size gate.

### Task 7: Remaining page families and accessibility

**Files:** Audit every routed page under `src/features/`. Touch only pages that need local spacing or hierarchy fixes after Task 1, including `src/features/founder/FounderPage.tsx`, `src/features/cloud-costs/CloudCostsPage.tsx`, `src/features/finance/FinancePage.tsx`, `src/features/gym/GymPage.tsx`, `src/features/social/SocialSection.tsx`, and `src/features/system/SystemPage.tsx`, plus shared components where reuse is needed.

**Interfaces:** No data shape or calculation changes. Preserve `CloudCostsPage` source-health states and Finance `months`, `paid`, and `paidAmounts` semantics.

- [ ] **Step 1:** Inspect every routed page in dark-default and optional light themes at desktop and phone widths, including one populated and one empty representative screen in each nav group; record concrete layout defects caused by the new design system.
- [ ] **Step 2:** Fix those defects with shared components before page-specific CSS. Keep controls labelled and reachable by keyboard. For behavior changes, write a failing Node test first and commit it separately.
- [ ] **Step 3:** Run full focused tests, build, Electron compile, MCP build, and changed-file lint. Commit small page-family slices.

### Task 8: Installed app, review, and handoff

**Files:** No product changes unless verification finds a defect; update `tasks/todo.md` only as ignored local progress.

- [ ] **Step 1:** Capture a read-only snapshot of relevant live encrypted data hashes and the installed app SHA. Build/package the branch and install `/Applications/Cortex.app` with exact-target checks; do not run the `cortex:install` script blindly because it removes the old app before copying.
- [ ] **Step 2:** Verify signature, packaged-versus-installed `app.asar` hash, app port/health, and data hash preservation. Inspect Home, Calendar, Student, Finance, Cloud Spend, and mobile width in dark-default and optional light themes against the approved compositions. Record screenshots.
- [ ] **Step 3:** Open a PR from `codex/cortex-light-redesign`; run one official code review pass and submit a GitHub review object. Fix verified findings, re-run focused checks, and stop without merging.
