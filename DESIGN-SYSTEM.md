# Cortex Design System

This is the shared visual contract for the dark-first Cortex workspace. The app
should feel like a clear personal command center: graphite canvas, mineral
work surfaces, muted teal actions, sea-glass focus surfaces, and olive progress surfaces.
Light mode remains available as a selectable alternative. Use the existing data
and route contracts; this document only defines shared visual language.

Source of truth:

- `src/index.css` for tokens, surfaces, focus, selection, radius, and typography.
- `src/components/ui/*` for controls.
- `src/components/shared/*` and `src/components/widgets/*` for reusable panels.
- `src/lib/chart-theme.tsx` for chart colors and tooltip styling.

## Tokens

Dark is the default theme. `.dark` is the primary token set; `:root` is the
selectable light alternative. Keep focus and progress surfaces
distinct but restrained in both modes. Text on both uses the shared foreground tokens.

| Dark role | CSS var | Value |
|---|---|---:|
| Canvas | `--background` | `#181C1B` |
| Surface | `--card` | `#232A27` |
| Primary ink | `--foreground` | `#EDF1EC` |
| Secondary ink | `--muted-foreground` | `#B6C2BB` |
| Teal action | `--accent` | `#85C7B4` |
| Sea-glass focus | `--focus-surface` | `#263F37` |
| Olive progress | `--progress-surface` | `#343C2C` |

Home and Student use these same focus and progress tokens, including their text,
pills, and input treatments. Do not add brighter local overrides.

| Light role | CSS var | Value | Use |
|---|---|---:|---|
| Canvas | `--background` | `#F2F4EF` | App and page background. |
| Surface | `--card` | `#FCFDF9` | Cards, panels, popovers, dialogs. |
| Primary ink | `--foreground` | `#26332D` | Body, titles, important values. |
| Secondary ink | `--muted-foreground` | `#55645B` | Labels, descriptions, secondary metadata. |
| Faint ink | `--foreground-faint` | `#637366` | Decorative microcopy only. |
| Teal action | `--accent` | `#246B5B` | Primary actions, selected states, focus rings, key chart series. |
| Sea-glass focus | `--focus-surface` | `#D8E9DF` | Focus session hero and related emphasis surfaces. |
| Olive progress | `--progress-surface` | `#E7EAD9` | Weekly rhythm/progress surfaces. |

Semantic tokens remain meaning-driven:

| Role | CSS var | Light value | Use |
|---|---|---:|---|
| Success | `--success` | `#397447` | Done, available, on track, gains. |
| Warning | `--warning` | `#8A5A1E` | Pending, stale, at risk. |
| Danger | `--destructive` | `#B4423F` | Errors, overdue, destructive actions, losses. |

Never rely on color alone. Pair semantic color with a word, icon, status dot, or
direction glyph. Avoid raw Tailwind palette colors in feature code; prefer these
tokens and the shared primitives.

## Typography

Inter is the UI and heading face. IBM Plex Mono is reserved for times, currency,
code, paths, counters, and tabular measurements. The old display-serif treatment
is intentionally retired; `font-serif` aliases to the sans stack so legacy page
classes do not keep a second brand voice alive.

Write interface labels in sentence case. Do not add tracked all-caps labels unless
the content is genuinely tabular or code-like. Keep line lengths short and use
plain nouns that match what the user sees.

## Radius, Spacing, And Shadow

| Shape | Utility | Token size | Use |
|---|---|---:|---|
| Cards and panels | `rounded-xl` | `20px` | `.surface`, `WidgetCard`, `StatTile`, dialogs. |
| Controls | `rounded-md` | `12px` | Buttons, inputs, tab lists, menus, compact controls. |
| Pills | `rounded-full` | full | Chips, status dots, progress tracks, date pills. |

Use the existing 8px rhythm: `gap-4` for normal grids, `gap-3` for dense groups,
`p-5` for primary cards, and `p-4` for compact cards. Cards get their shadow from
`.surface`; overlays and stronger panels get `--shadow-lift` through
`.surface-strong`. Primary buttons share `--shadow-action` through `shadow-action`.

## Surfaces

`.surface` is the normal card/panel surface: token fill, quiet hairline, and the
shared ambient shadow. `.surface-strong` is for dialogs, popovers, and elevated
moments. `.liquid-glass` is a restrained translucent surface for compact chrome
and KPI moments.

Use `glow-danger` and `glow-success` only as semantic accents on an owning card.
They add a readable status outline, not a colored card fill.

## Controls

### Button

Use `@/components/ui/button` for every app button.

Variants:

- `default`: teal primary action.
- `secondary`: quiet token-surface action.
- `outline`: transparent low-emphasis action.
- `ghost`: chrome, row tools, icon-only controls.
- `destructive`: soft danger action.
- `accent-outline`: selected or engagement state.
- `link`: inline text action.

Sizes are `xs`, `sm`, `default`, `lg`, `icon`, `icon-xs`, `icon-sm`, and
`icon-lg`. Icon-only buttons need an `aria-label`.

### Input

Use `@/components/ui/input`. Inputs are 40px tall by default, with a token
surface, 12px radius, and token focus ring.

### Tabs

Use `@/components/ui/tabs`. The default list is a soft segmented control with
an active token-surface segment. `variant="line"` is for denser page sections where an
underline reads better.

### Chip

Use `@/components/ui/chip` for tags, categories, filters, and compact statuses.
Neutral chips are the default for categories. `accent` means selected/active.
`success`, `warning`, and `danger` are status only.

## Shared Panels

### Gym

Gym uses the shared graphite, teal, typography, and controls. Its layout follows
the training workflow: a compact day selector, one photographic workout hero,
then the actual exercise plan with movement thumbnails. Avoid large empty tinted
dashboard panels. On desktop, the hero and exercise plan sit side by side; on a
phone, the Start workout action stays in the first screen and exercises follow.

Active training pairs the current movement with one clear set entry. Exercise
media has more space on desktop and becomes a compact thumbnail on phones so
weight, reps, and Log set remain close together. Rest feedback lives with those
controls. Timers and counts use tabular numerals; details and editing open on
demand. Use the line tab variant for the Gym section navigation.

### WidgetCard

`WidgetCard` is the standard dashboard card. It preserves the existing props:
`title`, `description`, `children`, `className`, `delay`, `variant`, and
`compact`. Titles render as sentence-case sans labels; callers should pass the
actual label they want visible.

### StatTile

`StatTile` is the KPI tile. Labels are sentence case, values use tabular mono, and
icons use the teal accent. `variant="glass"` keeps the existing optional
translucent treatment.

### PageHeader

`PageHeader` is for in-page sections and tab panels. It must not repeat the route
title rendered by the shell. Kicker text is optional context, not an all-caps
decoration.

## Charts

Use `src/lib/chart-theme.tsx` for chart colors and tooltip styling. The first
series is teal, the second is sand, the third is olive, the fourth is
blue, and the fifth is clay. Use `axisProps()`, `gridProps()`, `chartColors()`,
`chartColor(i)`, `cssVar()`, and `<ThemedTooltip />` instead of inline hex values.

## Loading, Empty, And Error States

Loading states use `Skeleton` blocks shaped like the final content. Empty states
use `EmptyState` with a short sentence and optional hint/action. Inline errors use
token danger text plus a retry action when recovery is possible. Route failures
stay quiet: one clear failure message, the digest if useful, and a reload action.

## Motion And Accessibility

Motion should explain state changes, not decorate the page. Keep transitions
between 150ms and 250ms. Respect `prefers-reduced-motion`; the global CSS rule is
a safety net, not permission to add unnecessary animation.

Focus is global: 2px teal outline with offset. Do not remove outlines unless the
replacement is equally visible. Desktop dense controls should remain at least
28px; mobile-reachable actions should be at least 44px.

## Bans

- Light-only root classes or light-only theme metadata.
- Local colors that bypass the shared focus and progress surface tokens.
- Raw Tailwind palette colors for semantic UI.
- Decorative all-caps tracking for card titles and section labels.
- New fonts without an approved design reason.
- New one-off shadows, radii, or z-index scales.
- Hand-rolled buttons, inputs, tabs, chips, modals, or loading spinners when a
  shared primitive exists.
- Fake data, placeholder counts, or visual claims not backed by the existing
  source for that page.

## Migration Notes

When updating a page, first replace local cards with `WidgetCard` or `.surface`,
local KPI blocks with `StatTile`, local filters/tags with `Chip`, raw buttons with
`Button`, and chart colors with `chart-theme`. Preserve data semantics before
polishing the layout.
