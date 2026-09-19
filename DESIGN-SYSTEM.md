# Cortex Design System

This is the shared visual contract for the light Cortex workspace. The app should
feel like a clear personal command center: fog canvas, quiet white work surfaces,
iris actions, lilac focus moments, and lime progress moments. Use the existing
data and route contracts; this document only defines shared visual language.

Source of truth:

- `src/index.css` for tokens, surfaces, focus, selection, radius, and typography.
- `src/components/ui/*` for controls.
- `src/components/shared/*` and `src/components/widgets/*` for reusable panels.
- `src/lib/chart-theme.tsx` for chart colors and tooltip styling.

## Tokens

Light is the default theme. `.dark` is a contrast-safe override, not the primary
experience.

| Role | CSS var | Value | Use |
|---|---|---:|---|
| Canvas | `--background` | `#F1F2F7` | App and page background. |
| Surface | `--card` | `#FFFFFF` | Cards, panels, popovers, dialogs. |
| Primary ink | `--foreground` | `#22232B` | Body, titles, important values. |
| Secondary ink | `--muted-foreground` | `#66707B` | Labels, descriptions, secondary metadata. |
| Faint ink | `--foreground-faint` | `#8C95A3` | Decorative microcopy only. |
| Iris action | `--accent` | `#624AB5` | Primary actions, selected states, focus rings, key chart series. |
| Lilac focus | `--focus-surface` | `#DDD2FF` | Focus session hero and related emphasis surfaces. |
| Lime progress | `--progress-surface` | `#E2F2C7` | Weekly rhythm/progress surfaces. |

Semantic tokens remain meaning-driven:

| Role | CSS var | Light value | Use |
|---|---|---:|---|
| Success | `--success` | `#2F9E55` | Done, available, on track, gains. |
| Warning | `--warning` | `#B86E16` | Pending, stale, at risk. |
| Danger | `--destructive` | `#C73E3A` | Errors, overdue, destructive actions, losses. |

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
`.surface-strong`.

## Surfaces

`.surface` is the normal card/panel surface: white fill, quiet hairline, and the
shared ambient shadow. `.surface-strong` is for dialogs, popovers, and elevated
moments. `.liquid-glass` is a restrained translucent surface for compact chrome
and KPI moments; it must not bring back graphite inset shine.

Use `glow-danger` and `glow-success` only as semantic accents on an owning card.
They add a readable status outline, not a colored card fill.

## Controls

### Button

Use `@/components/ui/button` for every app button.

Variants:

- `default`: iris primary action.
- `secondary`: white quiet action.
- `outline`: white/transparent low-emphasis action.
- `ghost`: chrome, row tools, icon-only controls.
- `destructive`: soft danger action.
- `accent-outline`: selected or engagement state.
- `link`: inline text action.

Sizes are `xs`, `sm`, `default`, `lg`, `icon`, `icon-xs`, `icon-sm`, and
`icon-lg`. Icon-only buttons need an `aria-label`.

### Input

Use `@/components/ui/input`. Inputs are 40px tall by default, white on the fog
canvas, with a 12px radius and token focus ring.

### Tabs

Use `@/components/ui/tabs`. The default list is a soft segmented control with a
white active segment. `variant="line"` is for denser page sections where an
underline reads better.

### Chip

Use `@/components/ui/chip` for tags, categories, filters, and compact statuses.
Neutral chips are the default for categories. `accent` means selected/active.
`success`, `warning`, and `danger` are status only.

## Shared Panels

### WidgetCard

`WidgetCard` is the standard dashboard card. It preserves the existing props:
`title`, `description`, `children`, `className`, `delay`, `variant`, and
`compact`. Titles render as sentence-case sans labels; callers should pass the
actual label they want visible.

### StatTile

`StatTile` is the KPI tile. Labels are sentence case, values use tabular mono, and
icons use the iris accent. `variant="glass"` keeps the existing optional
translucent treatment.

### PageHeader

`PageHeader` is for in-page sections and tab panels. It must not repeat the route
title rendered by the shell. Kicker text is optional context, not an all-caps
decoration.

```tsx
<PageHeader kicker="This semester" title="Compilers" subtitle="4 assignments open"
  actions={<Button size="sm" variant="secondary">Add</Button>} />
```

### EmptyState (`@/components/shared/EmptyState`)

Serif italic whisper + optional hint + optional action. `py-10`, centered.
No dashed borders, no oversized icons, ever.

```tsx
<EmptyState message="Nothing captured yet." hint="Anything you save lands here."
  action={<Button variant="secondary" size="sm">New capture</Button>} />
```

### Skeleton (`@/components/shared/Skeleton`)

The standard loading affordance — skeleton over spinner, always. Shimmer is motion-safe.

```tsx
{loading
  ? <div className="flex flex-col gap-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-24 w-full" /></div>
  : <Chart data={data} />}
```

### Modal (`@/components/shared/Modal`)

The ONLY app modal/lightbox/viewer wrapper (wraps `ui/dialog`). Sizes: `sm` (forms,
confirms), `lg` (editors, detail), `full` (lightboxes, PDF viewers). One z-scale:
chrome z-30/40, overlays z-50 — nothing else, no `z-[9999]`. One scrim:
`bg-black/70 backdrop-blur-sm`. Panel: `.surface-strong`, `rounded-xl`.

```tsx
<Modal open={open} onOpenChange={setOpen} title="Add goal" size="sm"
  footer={<Button onClick={save}>Save</Button>}>
  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goal name" />
</Modal>
```

### WidgetCard (`@/components/widgets/WidgetCard`)

The standard dashboard panel. Title auto-styled mono-upper (any input casing).
`variant="urgent" | "success"` = semantic hairline + soft glow. `compact` = `p-3`.
`delay` staggers entrance (capped 0.45s internally).

```tsx
<WidgetCard title="Today's focus" delay={0.1}>…</WidgetCard>
<WidgetCard title="Overdue" variant="urgent" compact>…</WidgetCard>
```

### Tabs (`@/components/ui/tabs`)

`TabsList` default = the app-wide segmented control (recessed track, raised active
segment). `variant="line"` = bare triggers with a 2px accent underline.

```tsx
<Tabs value={tab} onValueChange={setTab}>
  <TabsList><TabsTrigger value="week">Week</TabsTrigger><TabsTrigger value="month">Month</TabsTrigger></TabsList>
  <TabsContent value="week">…</TabsContent>
</Tabs>
```

### Input / Progress / Tooltip / Separator / ScrollArea (`@/components/ui/*`)

Token-pure; use as-is. Progress indicator defaults to white — pass
`<ProgressIndicator className="bg-success" />` for status meters. Tooltip content is
mono `text-2xs` on a popover surface.

### chart-theme (`@/lib/chart-theme`)

`chartColors()` / `chartColor(i)` read the CSS vars at runtime; `axisProps()` /
`gridProps()` are spreadable presets; `<ThemedTooltip />` matches card surfaces.
Full recharts example:

```tsx
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ThemedTooltip, axisProps, chartColors, cssVar, gridProps } from '@/lib/chart-theme'

function SessionsChart({ data }: { data: { day: string; sessions: number }[] }) {
  const [c1] = chartColors()
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data}>
        <CartesianGrid {...gridProps()} />
        <XAxis dataKey="day" {...axisProps()} />
        <YAxis width={28} allowDecimals={false} {...axisProps()} />
        <Tooltip content={<ThemedTooltip />} cursor={{ stroke: cssVar('--border') }} />
        <Area type="monotone" dataKey="sessions" stroke={c1} strokeWidth={2}
          fill={c1} fillOpacity={0.12} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

Series order: 1st series = `chartColors()[0]` (accent cyan), 2nd = green, 3rd = amber,
4th = violet, 5th = rose. Single-series charts are ALWAYS accent cyan.

---

## (e) HARD BANS (and the replacement, per case)

| Banned | Replacement |
|---|---|
| Raw Tailwind palette utilities — `red-*`, `blue-*`, `emerald-*`, `green-*`, `yellow-*`, `amber-*`, `purple-*`, `pink-*`, `cyan-*`, `orange-*`, `gray-*`, etc. | Status → semantic tokens (`success`/`warning`/`destructive`). Category/tag chips → `Chip` neutral. Charts → `chart-theme`. Subject/domain "identity" colors → accent or neutral emphasis (weight, chip), **never per-item hues**. |
| `text-[10px]`, `text-[9px]`, `text-[11px]`, any `text-[Npx]` bracket | `text-2xs` (10px) / `text-3xs` (9px) / `text-xs` (12px). Nothing below 9px. |
| Bare `rounded` | `rounded-xl` (cards) / `rounded-md` (controls) / `rounded-full` (pills). |
| `border-2` and any thick border | Hairlines only (`border` + `border-border`). Emphasis via the 2px *indicator bar* pattern (`before:w-0.5 bg-accent`), not thick borders. |
| Hand-rolled `<button className="…">` | `<Button>` with a variant. |
| Hand-rolled `fixed inset-0` overlays / `z-[9999]` | `<Modal>` (sm/lg/full). |
| `<Loader2 className="animate-spin">` and any spinner | `<Skeleton>` blocks shaped like the loaded content. |
| Inline hex in chart props (`stroke="#60a5fa"`, `fill: '#888'`) | `chart-theme`: `chartColors()`, `axisProps()`, `gridProps()`, `<ThemedTooltip />`. |
| Dashed-border empty `<div>`s | `<EmptyState>`. |
| New shadows, new radii, new z-indexes, new fonts, second accent colors | The tokens above. If it isn't in this document, it doesn't ship. |

`.liquid-glass` outside its two roles (below) is also a ban.

---

## (f) Empty / loading / error state grammar

- **Loading**: `Skeleton` blocks approximating the loaded layout (2–4 blocks max).
  Never a spinner, never layout jump. Keep the card chrome (title) visible while the
  body loads.
- **Empty**: `EmptyState` — serif italic whisper (a quiet sentence, not "No data"),
  optional faint hint, optional single action. Inside a WidgetCard it sits directly in
  the card body.
- **Error (inline/widget)**: one line — `text-destructive text-xs` + a `ghost` retry
  Button. No red card fills; at most `variant="urgent"` on the owning WidgetCard.
- **Error (route)**: `RouteErrorBoundary` (see below).
- **Toast**: `StoreToast` (see below). Toasts are for transient confirmations/failures,
  never for validation.

### Sibling components (owned elsewhere — intended styling)

- **`RouteErrorBoundary.tsx`** (`src/components/shared/`): full-page quiet failure.
  Centered `EmptyState` grammar: serif italic whisper ("Something broke on this page."),
  faint mono error digest (`font-mono text-2xs text-foreground-faint`, one line,
  truncated), and a `secondary` Button "Reload view". No red walls — a single
  `text-destructive` glyph or hairline at most. Sits on plain `bg-background`.
- **`StoreToast.tsx`** (`src/components/shared/`): bottom-right stack, `z-50`.
  Each toast: `.surface-strong rounded-md px-3 py-2 shadow-lift`, body `text-xs
  text-foreground`, optional mono `text-2xs` detail line; a 2px LEFT hairline in the
  semantic color (`before:w-0.5 bg-success|bg-warning|bg-destructive|bg-accent`) instead
  of tinted fills. Entrance: motion-safe slide-up 150ms; auto-dismiss; respects
  reduced motion.

---

## (g) Migration cookbook — the 6 commonest patterns

### 1. Rainbow chip config map → Chip

```tsx
// BEFORE (StudentPage.tsx)
const diffColor: Record<Difficulty, string> = {
  Hard: 'bg-red-500/15 text-red-400',
  Medium: 'bg-yellow-500/15 text-yellow-400',
  Easy: 'bg-green-500/15 text-green-400',
}
<span className={`rounded-full px-2 py-0.5 text-[10px] ${diffColor[a.difficulty]}`}>{a.difficulty}</span>

// AFTER — difficulty is a STATUS → semantic variants
const diffVariant = { Hard: 'danger', Medium: 'warning', Easy: 'success' } as const
<Chip variant={diffVariant[a.difficulty]} size="sm">{a.difficulty}</Chip>

// AFTER — categories/types/tags are NOT statuses → all neutral
<Chip size="sm">{topic.type}</Chip>
```

### 2. Hand-rolled KPI tile → StatTile

```tsx
// BEFORE (FounderPage.tsx)
<div className="surface rounded-xl p-4">
  <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
  <p className="text-xl md:text-2xl font-bold tabular-nums">{kpi.value}</p>
  <p className="text-[10px] text-muted-foreground">{kpi.sub}</p>
</div>

// AFTER
<StatTile label={kpi.label} value={kpi.value} sub={kpi.sub}
  delta={<TrendBadge value={kpi.wow} />} />
```

### 3. Raw button → Button

```tsx
// BEFORE (DailyPage.tsx)
<button className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-80">
  <Play className="h-4 w-4" />
</button>

// AFTER
<Button size="icon-lg" aria-label="Start sprint"><Play /></Button>
```

### 4. Fixed-inset overlay → Modal

```tsx
// BEFORE (CapturesPage.tsx)
{lightbox && ReactDOM.createPortal(
  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={() => setLightbox(null)}>
    <button onClick={close} className="absolute right-4 text-white/70">…</button>
    <img src={lightbox} />
  </div>, document.body)}

// AFTER
<Modal open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)} size="full">
  <img src={lightbox ?? ''} className="mx-auto max-h-full object-contain" />
</Modal>
```

### 5. Recharts hex props → chart-theme

```tsx
// BEFORE (StatsPage.tsx)
<XAxis dataKey="day" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
<Tooltip {...TOOLTIP_STYLE} />
<Area dataKey="sessions" stroke="#60a5fa" strokeWidth={2} fill="url(#sessionGrad)" dot={{ r: 3, fill: '#60a5fa' }} />

// AFTER
const [c1] = chartColors()
<XAxis dataKey="day" {...axisProps()} />
<Tooltip content={<ThemedTooltip />} cursor={{ stroke: cssVar('--border') }} />
<Area dataKey="sessions" stroke={c1} strokeWidth={2} fill={c1} fillOpacity={0.12} dot={false} />
```

### 6. Dashed-border empty div → EmptyState

```tsx
// BEFORE (GoalsPage.tsx)
<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 py-16 text-center">
  <Target className="h-8 w-8 text-muted-foreground/30" />
  <p className="text-sm font-medium text-foreground">No goals yet</p>
  <p className="text-xs text-muted-foreground">Add your first one below.</p>
</div>

// AFTER
<EmptyState message="No goals yet." hint="Add your first one below." />
```

---

## (h) Accessibility guardrails

- **Contrast**: body/label ink ≥ 4.5:1 on its surface. The token set already clears
  this on `card` (accent 0.8L, muted-fg 0.74L); `text-foreground-faint` is decorative
  micro-copy only — never for information a user must read. Semantic text always at
  full token strength on `/10` tints.
- **Focus**: the global `:focus-visible` rule (2px accent outline, 2px offset) covers
  every interactive element. NEVER `outline-none` without a `focus-visible:` replacement.
- **Targets**: interactive elements ≥ 28px in dense desktop chrome, ≥ 44px for
  mobile-reachable actions. `size="icon-xs"` buttons only inside rows with generous
  hit-area padding.
- **Skeleton over spinner** — loading is shape, not motion.
- **Reduced motion**: framer-motion `useReducedMotion` on every `motion.*`; CSS via
  `motion-safe:`; the global reduce rule is a net, not an excuse.
- **Semantics**: icon-only buttons need `aria-label`. TrendBadge already carries
  sr-only direction text. Charts get a one-line text summary nearby when they carry
  decisions.
- Color is never the only signal: pair semantic color with a glyph or label
  (▲/▼, "paused", a dot + text).

---

## (i) `.surface` / `.surface-strong` / `.liquid-glass` rules

- **`.surface`** — every primary panel/card (WidgetCard, StatTile default, list panels).
  Always with `rounded-xl`. Includes hairline border, `--shadow-card`, and the signature
  inset top-highlight. Do not stack extra borders/shadows on it.
- **`.surface-strong`** — elevated moments only: dialog/modal panels, popover-grade
  surfaces (StoreToast). Not for in-page cards.
- **`.liquid-glass`** — RESERVED for exactly two roles: the **Header date pill** and the
  **StatTile `glass` variant**. Anywhere else is a ban.
- Sidebar/Header chrome uses flat token fills — never `.surface`.

---

## Navigation contract

`src/lib/routes.ts` is the single source for the 14 routes (path, title, navLabel,
group, icon). Sidebar groups and the Header title derive from it. Adding a page =
adding one entry there — never a hardcoded title map. `/gym` and `/opportunities`
are included (the old Header map missed them).
