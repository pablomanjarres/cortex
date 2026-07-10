# Cortex Design System — "Editorial Instrument Panel"

**This is the contract.** Every re-skin agent obeys it. The voice: an editorial serif
over quiet, instrument-grade telemetry. Restraint reads as luxury. One signal color.
Hairlines, not borders. Mono numerals everywhere.

Source of truth: `src/index.css` (tokens), `src/lib/routes.ts` (navigation),
`src/lib/chart-theme.tsx` (charts), the primitives in `src/components/{ui,shared,widgets}`.

---

## (a) Tokens

All colors are oklch on a warm-graphite axis (hue 75, chroma ≤ 0.006 for neutrals).
The accent + semantic trio sit at matched L/C so they read as one family of indicator lights.

### Ground (neutrals)

| CSS var | Value | Tailwind utility | Use |
|---|---|---|---|
| `--background` | `oklch(0.11 0.004 75)` | `bg-background` | App ground. Page canvas only. |
| `--card` / `--popover` | `oklch(0.22 0.005 75)` | `bg-card` / `bg-popover` | Panel fill (prefer `.surface` class for cards). |
| `--secondary` / `--muted` | `oklch(0.27 0.005 75)` | `bg-secondary` / `bg-muted` | Lifted controls, hover fills, wells. |
| `--sidebar` | `oklch(0.09 0.004 75)` | `bg-sidebar` | Sidebar only. |
| `--border` | `oklch(0.26 0.005 75)` | `border-border` (default on `*`) | THE hairline. Never brighter. `border-border/60` for sub-hairlines. |
| `--input` | `oklch(0.32 0.005 75)` | `border-input` | Form-control hairline (slightly brighter than `--border`). |

### Ink (exactly three text roles)

| CSS var | Value | Tailwind utility | Use |
|---|---|---|---|
| `--foreground` | `oklch(0.985 0.002 75)` | `text-foreground` | Primary ink: values, body, titles. |
| `--muted-foreground` | `oklch(0.74 0.006 75)` | `text-muted-foreground` | Secondary ink: labels, descriptions, axis ticks. |
| `--foreground-faint` | `oklch(0.62 0.006 75)` | `text-foreground-faint` | Tertiary ink: micro-copy, placeholders, sub-lines. Never body text. |

No fourth role. No `text-foreground/50` improvisations.

### The ONE signal

| CSS var | Value | Tailwind utility | Use |
|---|---|---|---|
| `--accent` | `oklch(0.8 0.12 218)` ice-cyan | `text-accent` `bg-accent/10` `border-accent/40` | ONLY: focus rings, active nav indicator, links, running-sprint state, selected filters/chips, primary chart series, rare key hairlines. **≤ 5% of any screen.** |
| `--ring` | same as accent | (global focus style) | Focus rings — already global, do not restyle. |

White (`bg-primary text-primary-foreground`, i.e. `bg-foreground text-background`)
remains the primary-button color — that sharpness is part of the identity. Accent is
never a button fill.

### Semantic trio (indicator lights, matched to the accent)

| CSS var | Value | Utilities | Use |
|---|---|---|---|
| `--success` | `oklch(0.78 0.115 155)` phosphor green | `text-success` `bg-success/10` `border-success/25` | Done, on-track, gains. |
| `--warning` | `oklch(0.8 0.115 80)` instrument amber | `text-warning` `bg-warning/10` `border-warning/25` | Paused, at-risk, pending. |
| `--destructive` | `oklch(0.74 0.13 25)` signal red | `text-destructive` `bg-destructive/10` `border-destructive/25` | Errors, overdue, losses. |

Status color grammar: **soft tint fill (`/10`) + hairline (`/25`) + full-strength text.**
Never solid semantic fills, never raw `red-500`/`green-500`/`yellow-500`.

### Charts

| CSS var | Value | Role |
|---|---|---|
| `--chart-1` | `oklch(0.8 0.12 218)` | Primary series = THE accent cyan. |
| `--chart-2` | `oklch(0.78 0.115 155)` | Green. |
| `--chart-3` | `oklch(0.8 0.115 80)` | Amber. |
| `--chart-4` | `oklch(0.74 0.115 290)` | Violet. |
| `--chart-5` | `oklch(0.76 0.115 350)` | Rose. |

Consumed ONLY through `src/lib/chart-theme.tsx` (see catalog). Never inline hex.

### Shadows

| CSS var | Utility | Use |
|---|---|---|
| `--shadow-card` | `shadow-card` | The one ambient card shadow (already inside `.surface`). |
| `--shadow-lift` | `shadow-lift` | Hover lift, overlays, popovers, tooltips. |

Panels never invent their own shadows.

### Micro-type scale

| Theme token | Utility | Size | Use |
|---|---|---|---|
| `--text-2xs` | `text-2xs` | 10px / 14px | Card titles (mono-upper), chips, kickers, tick labels. |
| `--text-3xs` | `text-3xs` | 9px / 12px | Smallest chip size, dense table meta. Absolute floor — nothing below 9px. |

**`text-[10px]` / `text-[9px]` / any `text-[Npx]` bracket is banned.** Use the scale.

---

## (b) Type system

| Role | Font | Utility | Rules |
|---|---|---|---|
| Display | Instrument Serif | `font-serif` | Page titles (Header — automatic), PageHeader titles, Dialog/Modal titles, EmptyState whisper, rare editorial flourishes. **Always `italic`** — the italic is the brand inflection. Never for body, labels, or data. |
| Body | Inter | `font-sans` (default) | Everything conversational: sentences, list content, form labels. |
| Data | IBM Plex Mono | `font-mono` | ALL numerals, timestamps, timers, metrics, card titles, code, paths, chips, kickers. `tabular-nums` is baked into `--font-mono` (tnum) — add the `tabular-nums` utility on animated counters anyway to reserve width. |

### Casing rules

- **Card/section titles**: mono UPPERCASE `text-2xs` `tracking-wider` `text-muted-foreground`.
  `WidgetCard` enforces this via CSS `uppercase` — caller casing never matters. Hand-built
  section headings must use the same stack: `font-mono text-2xs uppercase tracking-wider text-muted-foreground`.
- **Kickers / group labels**: `font-mono text-2xs uppercase tracking-widest` (sidebar groups, PageHeader kicker).
- **Serif is never uppercased.** Body sans is never letter-spaced.

### Title ownership

The topbar (Header) renders the route title from `src/lib/routes.ts` — serif italic,
with a conveyor mask reveal on route change. **Routed pages must NOT repeat their route
title.** In-page section headers use `<PageHeader>` (different words than the route title)
or the WidgetCard title.

---

## (c) Radius, spacing, shadow rules

### Radius — exactly three

| Shape | Utility | Applies to |
|---|---|---|
| Cards / panels / modals | `rounded-xl` | `.surface`, WidgetCard, StatTile, DialogContent. |
| Controls | `rounded-md` | Buttons, inputs, tabs list, tooltips, nav items, menu items. |
| Pills / chips | `rounded-full` | Chip, Badge, sprint pill, date chip, progress tracks, dots. |

Bare `rounded` is **banned**. Other radii (`rounded-lg`, `rounded-sm`) only appear
inside primitives (e.g. segmented-tab inner radius) — never in feature code.

### Spacing rhythm

- Grid gutters: `gap-4` standard, `gap-3` compact grids.
- Card padding: `p-4` standard, `p-3` compact (WidgetCard handles this via `compact`).
- Page: `PageShell` provides `gap-6` between page sections. Don't add extra outer margins.

### Shadow

- Cards get shadow from `.surface` (never add `shadow-*` to a surface).
- Hover/overlay states: `shadow-lift`.
- The inset top-highlight on `.surface`/`.surface-strong` is a signature — never remove it.

### Motion

- Page entrance: `PageShell` fade-up (12px / 0.4s). Widgets: `WidgetCard` stagger via
  `delay` (total capped at 0.45s — the cap is enforced inside WidgetCard).
- Interactive transitions: 150–250ms. Pressed states: `active:scale-[0.98]`.
- EVERY animation respects `prefers-reduced-motion`: framer-motion via `useReducedMotion`,
  CSS via `motion-safe:` variants (a global reduce rule also collapses CSS animation as a
  safety net). One signature flourish exists (Header title conveyor); do not add more.

---

## (d) Component catalog

### Button (`@/components/ui/button`)

Variants: `default` (white-on-black — THE primary), `secondary` (surface-toned),
`ghost`, `outline`, `destructive` (soft danger tint), `accent-outline` (rare
selected/engage), `link`. Sizes: `sm` / `default` / `lg` (+ `xs`, `icon`, `icon-xs`,
`icon-sm`, `icon-lg`).

```tsx
<Button onClick={save}>Save</Button>
<Button variant="secondary" size="sm">Edit</Button>
<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>
```

### Chip (`@/components/ui/chip`)

The ONE tag/category/filter primitive. `neutral` (hairline + mono — the DEFAULT for
categories/tags/domains), `accent` (selected/active), `success|warning|danger`
(status only). Sizes `sm|md`. `selectable` renders a button; `selected` promotes to accent.

```tsx
<Chip>compilers</Chip>
<Chip variant="danger" size="sm">overdue</Chip>
<Chip selectable selected={filter === 'week'} onClick={() => setFilter('week')}>week</Chip>
```

### Badge (`@/components/ui/badge`)

Small sans status/count pill (`default`, `secondary`, `outline`, `accent`, `success`,
`warning`, `destructive`). For categories/tags prefer `Chip`.

```tsx
<Badge variant="secondary">12</Badge>
<Badge variant="success">paid</Badge>
```

### StatTile (`@/components/shared/StatTile`)

THE KPI tile — replaces every hand-rolled metric tile. `variant="glass"` is one of the
two sanctioned `.liquid-glass` roles (hero KPI rows only).

```tsx
<StatTile label="MRR" value="$4,120" delta={<TrendBadge value={12.4} />} />
<StatTile label="Deep work" value="3.5h" sub="of 6h target" icon={<Timer />} />
<StatTile variant="glass" label="Streak" value={21} />
```

### TrendBadge (`@/components/shared/TrendBadge`)

▲/▼/— + percent, mono `text-2xs`. Up = success, down = danger; `invert` flips
(expenses, load). Flat renders neutral.

```tsx
<TrendBadge value={8.2} />
<TrendBadge value={-3} invert />  {/* spend went down = green */}
```

### PageHeader (`@/components/shared/PageHeader`)

Optional in-page header for tab sections: mono-upper kicker, serif italic title,
subtitle, actions slot. Never repeats the topbar route title.

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
