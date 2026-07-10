// radar-lib — pure, deterministic helpers shared by the radar scripts.
//
// Jobs (all root-cause fixes, all unit-tested in radar-lib.test.mjs):
//   1. selectHits — pick which scraped hits reach the (capped) classifier. The scraper
//      pulls every lane (x/linkedin/reddit/instagram/github/web), but X alone routinely
//      out-numbers the whole MAX_HITS budget, so a naive slice(0, MAX_HITS) starves the
//      other platforms before the model ever sees them. We keep order-matching hits (e.g.
//      a Colombia city order) first, then ROUND-ROBIN the rest across platforms so each
//      lane gets fair representation.
//   2. inferSource — the scraper/classifier tags Devpost hits as the generic "web" (there
//      was no devpost enum value), so the UI showed "Web" for real Devpost hackathons.
//      Derive the true platform from the post/apply host instead.
//   3. Deadline intelligence — deadlineTypeOf / rollingFromDeadlineType normalize the
//      optional deadlineType field over legacy {deadline, rolling} records;
//      mergeOpportunity refreshes a stored record from a new radar sighting WITHOUT
//      losing user edits (the old behavior silently DROPPED the incoming record, so
//      "Thiel Fellowship 2027" could never refresh a stale 2026 entry);
//      shouldAutoArchive expires fixed-deadline items that closed >7 days ago.
//   4. stableId — the one content-hash id helper (ingest + catalog seed share it).
//
// Kept dependency-free and side-effect-free so scripts/radar-lib.test.mjs can `node --test`.

import { createHash } from "node:crypto"

/** Strip diacritics + lowercase so "Medellín" matches "Medellin". */
export function deburr(s) {
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

// host substring → canonical source. Order matters only for readability; matches are
// by domain suffix so subdomains (foo.devpost.com, eventbrite.co.uk) resolve correctly.
const HOST_SOURCE = [
  ["twitter.com", "x"], ["x.com", "x"], ["t.co", "x"],
  ["linkedin.com", "linkedin"], ["lnkd.in", "linkedin"],
  ["reddit.com", "reddit"], ["redd.it", "reddit"],
  ["instagram.com", "instagram"],
  ["github.com", "github"], ["github.io", "github"],
  ["devpost.com", "devpost"],
  ["lu.ma", "luma"], ["luma.com", "luma"],
  ["eventbrite.", "eventbrite"],
  ["meetup.com", "meetup"],
]

export function hostOf(u) {
  if (!u) return ""
  try {
    return new URL(String(u).trim()).host.replace(/^www\./, "").toLowerCase()
  } catch {
    // bare host or malformed — best-effort strip
    return String(u).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
  }
}

/** Platform a hit was found on, derived from where it lives. `sourceRef` (the post URL)
 *  wins over `url` (the apply link), so a hackathon found on X but applied-to on Devpost
 *  still reads as "x". Falls back to the caller's already-validated source. */
export function inferSource(url, sourceRef, fallback = "web") {
  for (const ref of [sourceRef, url]) {
    const host = hostOf(ref)
    if (!host) continue
    for (const [needle, src] of HOST_SOURCE) {
      if (needle.endsWith(".") ? host.includes(needle) : (host === needle || host.endsWith("." + needle))) {
        return src
      }
    }
  }
  return fallback
}

/** Text of a hit that an order term could match against. */
function hitHaystack(h) {
  const urls = Array.isArray(h?.urls) ? h.urls.join(" ") : ""
  return deburr(`${h?.text || ""} ${h?.videoTranscript || ""} ${(h?.matchedKeywords || []).join(" ")} ${urls} ${h?.author || ""}`)
}

/**
 * Choose up to `maxHits` from `hits` for classification.
 * - Hits matching any active-order term (city/keyword) come FIRST (never truncated away).
 * - The remaining budget is filled ROUND-ROBIN across `source` lanes so LinkedIn/Reddit/
 *   Instagram aren't crowded out by a firehose lane (X). Within a lane, original order
 *   (recency from the scraper) is preserved.
 * Deterministic: no Date/Math.random; stable given the same input.
 */
export function selectHits(hits, orderTerms = [], maxHits = 180) {
  const list = Array.isArray(hits) ? hits : []
  if (list.length <= maxHits) return list.slice()

  const terms = (orderTerms || []).map((t) => deburr(t)).filter((t) => t.length >= 3)
  const matched = []
  const rest = []
  for (const h of list) {
    if (terms.length && terms.some((t) => hitHaystack(h).includes(t))) matched.push(h)
    else rest.push(h)
  }

  const out = matched.slice(0, maxHits)
  if (out.length >= maxHits) return out.slice(0, maxHits)

  // Bucket the remainder by lane, preserving order, then round-robin.
  const buckets = new Map()
  for (const h of rest) {
    const src = (h && h.source) || "web"
    if (!buckets.has(src)) buckets.set(src, [])
    buckets.get(src).push(h)
  }
  const lanes = [...buckets.values()]
  let added = true
  while (out.length < maxHits && added) {
    added = false
    for (const lane of lanes) {
      if (!lane.length) continue
      out.push(lane.shift())
      added = true
      if (out.length >= maxHits) break
    }
  }
  return out
}

// ── Shared schema vocab ───────────────────────────────────────────────────────
// One source of truth for the enums the ingest whitelist, the seed script, and the
// tests all agree on. The UI + MCP mirror these unions (TypeScript side).

export const DEADLINE_TYPES = new Set(["fixed", "rolling", "recurring", "always-open", "unknown"])
export const EFFORTS = new Set(["low", "medium", "high"])
export const CATEGORIES = new Set([
  "hackathon", "grant", "accelerator", "fellowship", "internship", "exchange",
  "competition", "pitch", "speaking", "scholarship", "community", "launch",
  "trending", "program", "residency", "research", "other",
])
export const SOURCES = new Set([
  "x", "linkedin", "reddit", "instagram", "github", "devpost", "luma",
  "eventbrite", "meetup", "web", "manual", "catalog",
])

/** Stable content-hash id: 'opp-' + sha1(sourceRef || url || title). Shared by the
 *  ingest and the catalog seed so the same program maps to the same id forever. */
export function stableId(o) {
  const key = (o.sourceRef || o.url || o.title || "").trim().toLowerCase()
  return "opp-" + createHash("sha1").update(key).digest("hex").slice(0, 12)
}

/**
 * Normalize an item's deadline type. Records predating the field derive it:
 *   rolling === true  -> 'rolling'
 *   deadline set      -> 'fixed'
 *   otherwise         -> 'unknown'
 * An explicit valid deadlineType always wins.
 */
export function deadlineTypeOf(item) {
  const o = item || {}
  if (o.deadlineType && DEADLINE_TYPES.has(o.deadlineType)) return o.deadlineType
  if (o.rolling === true) return "rolling"
  if (o.deadline) return "fixed"
  return "unknown"
}

/** The legacy `rolling` boolean, derived from deadlineType — old consumers still read it,
 *  so every writer keeps the two in sync via this single rule. */
export function rollingFromDeadlineType(deadlineType) {
  return deadlineType === "rolling" || deadlineType === "always-open"
}

/** YYYY-MM-DD string for `days` days after a YYYY-MM-DD `dateStr` (negative = before). */
export function addDays(dateStr, days) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Auto-archive rule (applied at ingest): a FIXED-deadline item whose deadline closed
 * MORE than 7 days ago and that the user never engaged with (status 'new') is dead
 * weight — archive it. NEVER touches pursuing/applied/won/lost (user-owned states).
 * Boundary: deadline exactly 7 days ago is still "recently closed" — NOT archived.
 */
export function shouldAutoArchive(item, today) {
  const o = item || {}
  if (o.status !== "new") return false
  if (deadlineTypeOf(o) !== "fixed" || !o.deadline) return false
  // YYYY-MM-DD strings compare lexicographically as dates.
  return String(o.deadline).slice(0, 10) < addDays(today, -7)
}

// Radar-owned string fields refresh from the incoming sighting when it carries a
// meaningful value; blank incoming values never erase existing intel.
const refreshStr = (incoming, existing) => {
  const v = typeof incoming === "string" ? incoming.trim() : ""
  return v ? incoming : (existing ?? "")
}

/**
 * mergeOpportunity — a title-collision is a RE-SIGHTING of a known program, not a dupe
 * to drop. The radar refreshes what it owns (deadline intel, links, logistics); the
 * user keeps what they own (id, status, priority, leverage edits, notes).
 *
 *   radar-owned  : deadline, deadlineType(+rolling sync), recurrence, nextWindowExpected,
 *                  amountUsd, reward, url, officialUrl, location, modality, eligibility,
 *                  tags — refreshed from `incoming` (blank/unknown never overwrite),
 *                  runId -> the new run, discoveredAt -> kept from the original.
 *   user-owned   : id, title, host, category, goals, status, priority, leverageScore,
 *                  leverageNote, source, sourceRef, notes — preserved from `existing`.
 *   notes        : when the deadline ACTUALLY changed, a one-line
 *                  "(refreshed for new cycle YYYY-MM-DD)" is appended so the user sees
 *                  why a "closed" item is live again.
 *
 * Pure: returns a new object; inputs are not mutated.
 */
export function mergeOpportunity(existing, incoming, { runId, today } = {}) {
  const prev = existing || {}
  const next = incoming || {}
  const day = String(today || runId || "").slice(0, 10)

  // Deadline intel: always trust the fresh sighting (that's the whole point of the
  // merge — a new cycle replaces the stale one, even fixed -> rolling or date -> null).
  const deadline = next.deadline !== undefined ? next.deadline : (prev.deadline ?? null)
  const deadlineType = deadlineTypeOf({ ...next, deadline })
  const deadlineChanged = (prev.deadline ?? null) !== (deadline ?? null)

  const notes = deadlineChanged && day
    ? `${String(prev.notes ?? "").replace(/\s+$/, "")}${prev.notes ? "\n" : ""}(refreshed for new cycle ${day})`
    : (prev.notes ?? "")

  return {
    ...prev,
    // radar-owned — refreshed
    deadline: deadline ?? null,
    deadlineType,
    rolling: rollingFromDeadlineType(deadlineType),
    recurrence: next.recurrence ?? prev.recurrence ?? null,
    nextWindowExpected: next.nextWindowExpected ?? prev.nextWindowExpected ?? null,
    amountUsd: Number.isFinite(next.amountUsd) ? next.amountUsd : (Number.isFinite(prev.amountUsd) ? prev.amountUsd : null),
    reward: refreshStr(next.reward, prev.reward),
    url: refreshStr(next.url, prev.url),
    officialUrl: refreshStr(next.officialUrl, prev.officialUrl),
    location: refreshStr(next.location, prev.location),
    modality: next.modality && next.modality !== "unknown" ? next.modality : (prev.modality ?? "unknown"),
    eligibility: next.eligibility && next.eligibility !== "unknown" ? next.eligibility : (prev.eligibility ?? "unknown"),
    requires18Plus: typeof next.requires18Plus === "boolean" ? next.requires18Plus : (prev.requires18Plus ?? null),
    effort: next.effort ?? prev.effort ?? null,
    tags: Array.isArray(next.tags) && next.tags.length ? next.tags : (prev.tags ?? []),
    runId: runId ?? next.runId ?? prev.runId,
    discoveredAt: prev.discoveredAt ?? next.discoveredAt,
    // user-owned — preserved (id/title/host/category/goals/status/priority/leverage*/
    // source/sourceRef ride along via ...prev)
    notes,
  }
}
