# Student workspace redesign

## Goal

Make the Student overview useful as one connected workspace. A student should be able to choose a course, find an assignment, update its status, and edit its deadline without crossing a long page of separate panels.

The page must work at desktop, iPad, and phone widths. It must preserve the existing Cortex visual language and all stored Student data.

## Current problems

The existing page separates related actions by several screen heights. Course selection appears far above the assignment list. Course details, grade projections, topics, notes, deadline queue, semester overview, and assignments each occupy their own large surface.

The `Awaiting grade` status is derived from assignment data, but the interface has no direct way to choose it. Deadline rows show information without opening the assignment, editing its deadline, or changing its status.

The desktop table also becomes too wide for a phone. Scaling the same table down would create small controls and horizontal scrolling.

## Information hierarchy

The Overview tab will use this order:

1. Semester and compact summary
2. Course selector
3. Assignment workspace
4. Expandable course details

The large Study flow panel, the PREP explanation panel, the separate semester overview card, and the separate deadline queue card will be removed. Their useful information will move into the compact summary or assignment workspace.

Materials and Notes remain separate top level tabs. Course specific topics and notes remain available in the expandable course details.

## Assignment status model

The interface exposes three assignment statuses:

* Open uses `done: false` and `grade: undefined`. Work is still owed.
* Awaiting grade uses `done: true` and `grade: undefined`. Work was submitted and no grade has arrived.
* Graded uses `done: true` and `grade: number`. A grade has been recorded.

Changing status follows these rules:

* Open sets `done` to `false` and clears the grade.
* Awaiting grade sets `done` to `true` and clears the grade.
* Graded sets `done` to `true`. If no grade exists, the grade editor opens and the status stays Awaiting grade until a value is saved.
* Entering a grade sets `done` to `true` and displays Graded.
* Clearing a grade from a completed assignment displays Awaiting grade.

Every assignment row or card includes a status control. The same control appears in deadline actions. This removes the ambiguous completion icon as the main status editor.

## Layout

### Compact header

The semester selector stays at the top. Beside it, or directly below it on narrow screens, three compact metrics show Open, Awaiting grade, and Current average. Each status metric acts as a filter for the assignment workspace.

The header contains one primary action, Add assignment. Add course remains beside the course selector.

### Course selector

Desktop uses a narrow vertical course rail beside the assignment workspace. Each course item shows its name, open assignment count, and current grade when available. The selected course uses the existing accent treatment.

iPad uses a horizontally scrollable course strip above the workspace. Items keep a minimum 44 pixel touch target.

Phone uses a labeled course select control above the assignment list. It includes All courses and Add course actions.

Selecting a course filters assignments in place. It does not move the viewport to another distant section.

### Assignment workspace

The workspace includes status filters, type filters, sorting, and Add assignment. Status filters stay visible before type filters because status describes the student's current responsibility.

Desktop uses a dense table with these columns:

* Assignment and course
* Status
* Type
* Weight
* Grade
* Deadline
* Row actions

Each row opens its assignment editor when the name is selected. Status and deadline remain editable inline.

iPad keeps the table where the available width supports it. At narrower widths it switches to assignment cards.

Phone uses cards. Each card shows the assignment name, course, status control, deadline, grade, and an edit action. Secondary fields open in the assignment editor. Cards never require horizontal scrolling.

The first group in the workspace is Due soon. It contains open assignments with dates and sorts them by urgency. Each item can open the assignment, change status, or edit the deadline. The remaining assignments follow under All assignments. A single assignment is rendered once in the active view.

### Course details drawer

The selected course has one compact details drawer below the workspace. It is collapsed by default.

The closed state shows course name, difficulty, credits, current grade, and graded percentage in one row. Opening it reveals:

* Course settings
* Grade range and progress
* Topics
* Course notes
* Delete course

Topics and Notes stay inside this drawer. The drawer uses one column on phones and two columns when space allows. The notes field receives a useful maximum height instead of expanding to a large empty panel.

## Component boundaries

`StudentPage` will keep store ownership, derived collections, and coordination. The 1,037 line component will be split into focused modules:

* `StudentWorkspaceHeader` renders semester controls, status metrics, and primary actions.
* `CourseSelector` renders the rail, strip, or phone selector from the same course data.
* `AssignmentWorkspace` owns filters, sorting, due soon grouping, and responsive list selection.
* `AssignmentStatusControl` applies the three status transitions from any surface.
* `AssignmentTable` renders the desktop and wide iPad view.
* `AssignmentCardList` renders the phone and narrow iPad view.
* `CourseDetailsDrawer` contains course settings, grades, topics, and notes.

Shared status transition helpers live beside `student-overview.ts` so the behavior can be tested without rendering React.

## Responsive behavior

The page uses content driven breakpoints:

* Under 640 px uses the phone course select, assignment cards, and one column drawer.
* From 640 px to 1023 px uses the horizontal course strip, table or cards based on available workspace width, and a two column drawer where it fits.
* At 1024 px and above, the course rail and assignment workspace sit side by side with the dense table and two column drawer.

All interactive controls have a minimum 44 pixel target on touch layouts. Important actions stay visible without hover. Desktop can use compact hover actions as a supplement.

## Accessibility

Status changes use a labeled select or menu with the current value exposed to assistive technology. Filters expose their pressed state. Course selection uses one semantic control per course. Focus moves to the assignment editor only after an explicit open action.

Status is communicated by text as well as color. The responsive card view keeps the same reading order as the desktop table. Keyboard users can reach every inline editor and action.

## Data and compatibility

No store schema migration is required. Existing `done` and `grade` values already encode the three statuses. Existing assignments, courses, topics, notes, semester selection, calendar synchronization, and material links remain intact.

Calendar synchronization runs after deadline edits and assignment creation using the existing path. Status changes do not remove calendar data.

## Testing

The change will be built test first.

Unit tests cover every status transition, including choosing Graded without a value, clearing a grade, and reopening an assignment. Existing overview and filter tests remain green.

Component tests cover course filtering, summary filters, deadline actions, assignment navigation, and responsive content selection. The same assignment state must appear consistently in the summary, due soon group, and full list.

Visual verification covers at least these viewport sizes:

* 1440 by 1000 desktop
* 834 by 1112 iPad portrait
* 390 by 844 phone

The final check runs the complete test suite, production build, Electron build, installed app launch, live data preservation checks, and screenshots at all three widths.

## Delivery

The redesign will continue on PR 49 because it completes the same Awaiting grade workflow. The PR description and linked issue will be updated to include the workspace redesign. No code review will be run or posted, per Pablo's instruction.
