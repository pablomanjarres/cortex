# Opportunity Modality & Location — Design

**Date:** 2026-07-03
**Feature area:** `src/features/opportunities/` (Cortex — Vite + React + Electron)
**Branch:** `feat/opp-modality`

## Problem

The Opportunities/Radar page surfaces scraped opportunities (hackathons, grants,
accelerators, etc.) but gives no first-class answer to a basic question: **is this
remote, hybrid, or in-person, and where is it held?**

Today there is a free-text `location` field and a coarse `eligibility` enum
(`remote-global | latam | us-eu | other | unknown`). But `eligibility` is a *region*
axis (who can apply), not a *venue-modality* axis (how/where it happens). There is no
structured way to tell remote from in-person, no way to filter by it, and no column
that shows it.

## Goal

Make modality a first-class, structured field, extracted by the classifier and
backfilled onto existing records, then exposed in the UI as:

- a **filter** (Remote / Hybrid / In-person pills),
- a **badge config** (colored dot + label, like `categoryConfig`), and
- a **table column** ("Where") showing the badge + the physical location.

## Non-goals

- **The external scraper is not touched.** The raw scraper lives in a separate
  `noelle` repo on a Lima VM and returns only post `text` + `urls` + `author` — it
  captures no structured location. Modality/location are **LLM-inferred cortex-side**
  from the post text by the classifier. Extending that classifier is the practical
  "use the scrapers to their fullest": we extract more structure from the same raw
  hits, we do not change collection.
- `eligibility` is left as-is. It is a distinct (region) axis and is not merged into
  modality.
- No new persistence backend. Opportunities stay in the encrypted
  `cortex-opportunities.json` store served by `main.js` over the local HTTP API.

## Data model

`Modality` taxonomy (chosen): `'remote' | 'hybrid' | 'in-person' | 'unknown'`.

Changes in `src/features/opportunities/OpportunitiesPage.tsx`:

- Add `type Modality = 'remote' | 'hybrid' | 'in-person' | 'unknown';` (near the
  other unions, ~lines 29-38).
- Add `modality: Modality;` to `interface Opportunity` (~line 52, beside `location`).
  `location` free-text is retained as the human-readable "where" (e.g. `Global`,
  `San Francisco`, `Lisbon · ETH Zürich`).
- Add a `modalityConfig` map beside `categoryConfig` (~lines 121-136):

  | value      | label      | dot/color        |
  |------------|------------|------------------|
  | remote     | Remote     | green            |
  | hybrid     | Hybrid     | purple/violet    |
  | in-person  | In-person  | blue             |
  | unknown    | Unknown    | neutral/gray     |

  Colors reuse the existing badge styling conventions in the file (same shape as
  `categoryConfig` / `statusConfig` entries) so it renders consistently.

## Classifier & ingest

The classifier already emits per-opportunity JSON including `location`. Extend it to
also emit `modality`.

- **`scripts/radar-build-prompt.mjs`** (~lines 75-128): add `"modality"` to the
  per-opportunity output shape and a short instruction:
  > `modality`: `remote` if fully online / remote-only; `hybrid` if it has a physical
  > location AND an online/remote option; `in-person` if physical-only; `unknown` if
  > the text doesn't say. Also return the best physical `location` string (city /
  > venue), or `Global` for remote.
- **`scripts/radar-parse-output.mjs`**: pass `modality` through (it parses the model's
  JSON — ensure the field survives).
- **`scripts/radar-ingest.mjs`** (`normalizeRecord`, ~lines 78-104): coerce `modality`
  to the enum, defaulting to `'unknown'` for anything missing/invalid. Mirror the
  existing `location`/`eligibility` handling.
- **`scripts/radar-refilter-prompt.mjs`**: add `modality` to the re-score output shape
  so re-filtering existing items does not drop the field.

## Backfill (existing ~40 records)

New one-shot script: **`scripts/radar-backfill-modality.mjs`**.

Flow:

1. `GET /api/data?key=cortex-opportunities` → the current records.
2. Select records missing `modality` or where `modality === 'unknown'` (unless
   `--force`, which re-does all).
3. Build a single tool-less `claude -p` prompt containing, per record,
   `{id, title, host, location, url, notes}`; ask for a JSON array of
   `{id, modality, location}` using the same taxonomy/rules as the classifier.
4. Merge results back by `id` (only overwrite `modality`, and overwrite `location`
   only when the model returns a non-empty improved value).
5. **`--dry-run` is the default**: print the proposed `{id, title, old→new modality,
   old→new location}` diff and write nothing. Writing back (POST to the store) only
   happens with an explicit `--write` flag.

Idempotent and safe to re-run. Uses the same store API (`localhost:3456`) as
`radar-ingest.mjs`, and relies on the existing backup-on-write behavior in `main.js`.

## UI

All in `src/features/opportunities/OpportunitiesPage.tsx`.

- **Filter state:** add `modalityFilter` (a `Set` / string like the existing
  `catFilter`, ~lines 258-268), and include it in the `filtered` useMemo predicate
  (~lines 336-348): a record passes when `modalityFilter` is empty or contains
  `opp.modality`.
- **Filter pills:** render Remote / Hybrid / In-person pills (from `modalityConfig`,
  skipping `unknown`) near the category pill row (~lines 618-626), toggling
  `modalityFilter`. Same interaction pattern as category pills.
- **Table "Where" column:** add a header cell in `<thead>` (~lines 671-689) and a body
  cell in the row render (~lines 692-730) that shows the `modalityConfig` badge (dot +
  label) followed by the `location` text. Placed logically near Category/Source.
- **Mobile card list** (~lines 638-665): show the modality badge + location inline on
  each card.
- **Edit form** (~lines 753-840): add a Modality `<select>` (remote/hybrid/in-person/
  unknown) next to the existing Location input so records can be corrected by hand.

## Data flow (unchanged shape, one new field)

```
Lima VM scrape.js  → raw.json (RawHit[]: text, urls, author)
  → radar-build-prompt.mjs  (+ modality in output shape)
  → claude -p
  → radar-parse-output.mjs  (passes modality through)
  → radar-ingest.mjs        (normalizeRecord: coerce modality→enum)
  → POST /api/data (cortex-opportunities)
  → encrypted cortex-opportunities.json
  → useStore in OpportunitiesPage.tsx → renders badge + Where column + filter

Backfill (one-shot): GET store → claude -p → merge modality/location → (–-write) POST store
```

## Testing / verification

- Typecheck + build the Vite app (`npm run build` / `tsc`) — no type errors from the
  new `Modality` union and `Opportunity` field.
- Seed a few records with each modality and confirm: badge renders, "Where" column
  shows badge + location, filter pills narrow the list correctly, and clearing pills
  restores the full list.
- Run the backfill in `--dry-run` and eyeball the proposed classifications before any
  `--write`.
- Confirm the classifier prompt change produces valid JSON with `modality` on a sample
  raw hit (or a `radar-parse-output.mjs` unit run against a saved model output).

## Risks / notes

- LLM-inferred modality will sometimes be wrong when the source text is vague — the
  `unknown` fallback + the manual edit-form select are the mitigations.
- Backfill hits the live opportunities store; the `--dry-run` default and `main.js`
  backup-on-write keep it reversible.
