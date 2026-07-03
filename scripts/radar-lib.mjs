// radar-lib — pure, deterministic helpers shared by the radar scripts.
//
// Two jobs, both root-cause fixes for "everything is X or Web, nothing from LinkedIn":
//   1. selectHits — pick which scraped hits reach the (capped) classifier. The scraper
//      pulls every lane (x/linkedin/reddit/instagram/github/web), but X alone routinely
//      out-numbers the whole MAX_HITS budget, so a naive slice(0, MAX_HITS) starves the
//      other platforms before the model ever sees them. We keep order-matching hits (e.g.
//      a Colombia city order) first, then ROUND-ROBIN the rest across platforms so each
//      lane gets fair representation.
//   2. inferSource — the scraper/classifier tags Devpost hits as the generic "web" (there
//      was no devpost enum value), so the UI showed "Web" for real Devpost hackathons.
//      Derive the true platform from the post/apply host instead.
//
// Kept dependency-free and side-effect-free so scripts/radar-lib.test.mjs can `node --test`.

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
