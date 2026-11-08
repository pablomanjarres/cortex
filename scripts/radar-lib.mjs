// radar-lib — pure, deterministic helpers shared by the radar scripts.
//
// Jobs (all root-cause fixes, all unit-tested in radar-lib.test.mjs):
//   1. inferSource — the scraper/classifier tags Devpost hits as the generic "web" (there
//      was no devpost enum value), so the UI showed "Web" for real Devpost hackathons.
//      Derive the true platform from the post/apply host instead.
//   2. Deadline intelligence — deadlineTypeOf / rollingFromDeadlineType normalize the
//      optional deadlineType field over legacy {deadline, rolling} records;
//      mergeOpportunity refreshes a stored record from a new radar sighting WITHOUT
//      losing user edits (the old behavior silently DROPPED the incoming record, so
//      "Thiel Fellowship 2027" could never refresh a stale 2026 entry);
//      shouldAutoArchive expires fixed-deadline items that closed >7 days ago.
//   3. stableId — the one content-hash id helper (ingest + catalog seed share it).
//
// Kept dependency-free and side-effect-free so scripts/radar-lib.test.mjs can `node --test`.

import { createHash } from "node:crypto"

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

// ── Shared schema vocab ───────────────────────────────────────────────────────
// One source of truth for the enums the ingest whitelist, the seed script, and the
// tests all agree on. The UI + MCP mirror these unions (TypeScript side).

export const DEADLINE_TYPES = new Set(["fixed", "rolling", "recurring", "always-open", "unknown"])
export const EFFORTS = new Set(["low", "medium", "high"])
export const CATEGORIES = new Set([
  "hackathon", "grant", "accelerator", "fellowship", "internship", "exchange",
  "competition", "pitch", "speaking", "scholarship", "community", "launch",
  "trending", "program", "residency", "research", "travel", "other",
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

/** Bogotá calendar day, YYYY-MM-DD: the radar's "today" everywhere (scripts and MCP). */
export const bogotaToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "America/Bogota" })

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

/**
 * Retention rule (applied by the research run): an item the profile auto-hid
 * (hiddenReason set) and no run has re-sighted for 90 days is dropped, so junk can't
 * pile up in the one-blob store. The curated catalog and anything Pablo touched stay.
 */
export function shouldPrune(item, today) {
  const o = item || {}
  if (!o.hiddenReason || o.status !== "archived" || o.source === "catalog") return false
  const lastSeen = String(o.runId || o.discoveredAt || "").slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(lastSeen) && lastSeen < addDays(today, -90)
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
 *                  tags, intel, lastVerified, opensAt, programStart, programEnd, evidence —
 *                  refreshed from `incoming` (blank/unknown never overwrite),
 *                  runId -> the new run, discoveredAt -> kept from the original.
 *   user-owned   : id, title, host, category, goals, status, priority, leverageScore,
 *                  source, sourceRef, notes, hiddenReason, premium, todoistTaskId —
 *                  preserved from `existing` (a sighting may set premium, never clear it);
 *                  leverageNote is filled from `incoming` only while blank.
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
    // The research "why" fills a blank note; once set (or edited), it is Pablo's.
    leverageNote: prev.leverageNote ? prev.leverageNote : (next.leverageNote ?? ""),
    ...(next.intel || prev.intel ? { intel: next.intel ?? prev.intel } : {}),
    // Proof and dates belong to one cycle. When the deadline moved, the old cycle's
    // verification, evidence and dates no longer vouch for it: keep only what this
    // sighting supplied. Otherwise a blank field keeps the stored value.
    ...(deadlineChanged
      ? {
          lastVerified: next.lastVerified ?? null,
          evidence: next.evidence ?? null,
          opensAt: next.opensAt ?? null,
          programStart: next.programStart ?? null,
          programEnd: next.programEnd ?? null,
        }
      : {
          lastVerified: next.lastVerified ?? prev.lastVerified ?? null,
          evidence: next.evidence ?? prev.evidence ?? null,
          opensAt: next.opensAt ?? prev.opensAt ?? null,
          programStart: next.programStart ?? prev.programStart ?? null,
          programEnd: next.programEnd ?? prev.programEnd ?? null,
        }),
    // Premium is his call: a sighting can set it, never clear it.
    ...(prev.premium || next.premium === true ? { premium: true } : {}),
    runId: runId ?? next.runId ?? prev.runId,
    discoveredAt: prev.discoveredAt ?? next.discoveredAt,
    // user-owned — preserved (id/title/host/category/goals/status/priority/leverage*/
    // source/sourceRef ride along via ...prev)
    notes,
  }
}
