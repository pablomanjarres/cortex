# Cortex workspace redesign

## Outcome and scope

Replace the old dark editorial instrument-panel presentation with the approved friendly Cortex visual composition. Pablo later clarified that he prefers dark mode: the finished app defaults to a rich dark version of the concept, with light available as an option. The generated desktop Home, Student, and mobile images are composition references only. Their dates, courses, targets, counts, and quotes are illustrative and must never become seeded user data or hard-coded UI claims.

The redesign covers the shared shell and component language, a new Home composition, a Calendar view over existing EventKit range reads, a Student overview composition, and visual consistency across all routed feature pages. Existing encrypted stores, Electron APIs, MCP contracts, calculations, and integrations stay intact. This is a UI migration, not a data migration.

## Visual contract

| Light-theme role | Token | Value |
|---|---|---|
| Canvas | `--background` | `#F1F2F7` |
| Surface | `--card` | `#FFFFFF` |
| Primary ink | `--foreground` | `#22232B` |
| Secondary ink | `--muted-foreground` | `#66707B` |
| Iris action | `--accent` | `#624AB5` |
| Lilac focus | `--focus-surface` | `#DDD2FF` |
| Lime progress | `--progress-surface` | `#E2F2C7` |

Success, warning, and error tokens remain semantic, with readable text and an icon or word rather than color alone. Dark is the default; keep the light palette above as a switchable alternative. Dark surfaces must retain vivid lilac focus and lime rhythm areas, not collapse into the old flat charcoal design. Persist the local cosmetic choice without migrating encrypted stores. Use a single self-hosted humanist sans face for UI and headings, and IBM Plex Mono only for times, currency, and tabular measurements. Headers and card labels use sentence case. The hero focus timer is the strong element; surrounding surfaces stay quiet. Cards use approximately 20px corners, controls 12px, and the existing 8px spacing rhythm. Motion is limited to purposeful state changes and respects reduced motion.

## Global shell

The desktop shell has a 236 to 252px sidebar, grouped navigation, and a top bar with route title, keyboard-accessible navigation search, current sprint state, a Capture action, and a compact system-status entry. Preserve native window drag behavior. Group routes as Today, Build, Study, Life, and System, retaining all existing destinations and legacy redirects. Calendar is added under Today. Search initially locates routes and actions; it does not imply cross-record search. Capture opens the existing capture flow. No unsupported notification count.

On narrow screens, navigation is a drawer and a four-destination bottom bar gives quick access to Home, Study, Build, and Life. Neither obscures page content or the macOS/PWA safe areas. Pointer controls remain keyboard operable and touch targets are at least 44px in the mobile layout.

## Home

Use a responsive 12-column desktop composition: a lilac focus timer hero, four small source-labelled facts, a lime weekly focus chart, a week map, an Up next list, and a Needs attention strip. The mobile reading order is focus, Up next, facts, weekly rhythm, week map, and domain shortcuts.

The timer uses the existing `SprintProvider` state and controls. Facts derive from real completed focus minutes, active habit completions, open student assignments, and Calendar events. Do not show a goal percentage without a configured goal. An unavailable source shows an honest empty or permission state, not zero. The weekly rhythm reads dated sprint sessions and uses local day boundaries. The week map reads EventKit events by range plus dated sprint sessions and assignment deadlines. It shows distinct event, focus, and deadline marks; selecting a day exposes the originating records. Up next orders future timed events and open deadlines by actual time, and each row opens its source. Needs attention contains only source-backed overdue items or failed source states and never auto-sends messages.

## Calendar and Student

Calendar is a new route displaying week and day views from the existing `getEventsInRange` bridge. It must distinguish all-day from timed events, show the calendar source, and explain missing EventKit permission. It does not create or edit recurring events as part of this redesign.

Student keeps its Overview, Materials, and Notes tabs. Overview leads with actual upcoming work and the week workload, then course rows, materials, and notes. Progress appears only where backed by a defined source calculation. Assignment completion continues using the existing store and semantics. The course detail and materials workflows remain reachable.

## Other pages

All routes inherit the new shell, palette, shared cards, tabs, buttons, inputs, dialogs, and page heading rules. Existing complex feature pages retain their workflows. Apply a small layout pass to each family: Founder and Cloud Spend emphasize source status and data freshness; Projects and Opportunities favor scannable lists; Finance preserves planned, paid, and actual-paid meanings and COP display; Training retains its mode tabs; Contacts keeps personal Contacts and CRM distinct; System keeps health and Automations accessible. No route becomes an empty visual placeholder.

## Component and data boundaries

The route registry remains the navigation source of truth. Shared visual components live under `src/components`, domain-specific Home components under `src/features/daily`, and Calendar view under `src/features/calendar`. Pure selectors for Home data live under `src/features/daily` and are testable without Electron. Read data through existing `useStore`, sprint context, and `electronAPI.calendar`. Avoid duplicating persistence, changing store keys, or introducing a second calendar cache.

Errors and loading states are explicit. A failed Calendar request explains that the schedule could not be loaded. An empty result says no events were found and points to Calendar access as a check if events were expected; it does not claim a permission error that the current bridge cannot distinguish. Cached source data is marked stale where applicable. Empty weekly activity says no sessions were logged; it does not render a fake chart.

## Acceptance

The app builds and existing focused tests pass. New pure selectors have red-green coverage for local-date grouping, ordering, missing data, and active-only habit counts. Home, Calendar, Student, and representative pages from every other group are visually checked in dark-default and optional light themes at desktop and phone widths, with keyboard and reduced-motion checks. Package and install `/Applications/Cortex.app`, verify its signature and packaged hash, then inspect the installed app without changing or losing live encrypted data. If Keychain authorization blocks a live read, report that boundary precisely.
