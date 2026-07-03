#!/usr/bin/env node
// radar-refilter-prompt — build a prompt to re-filter + re-score the opportunities
// ALREADY in the Cortex store against the current profile (radar-profile.md). Output to
// stdout, fed to a TOOL-LESS claude call; the result is parsed by radar-parse-output.mjs.
//
// Usage: node radar-refilter-prompt.mjs <store.json>   (store.json = GET /api/data body)

import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const storePath = process.argv[2]
if (!storePath) { console.error("usage: radar-refilter-prompt.mjs <store.json>"); process.exit(2) }

const here = dirname(fileURLToPath(import.meta.url))
let profile = "17-year-old Colombia-based sophomore CS student; prefer remote/global + LatAm, under-18-eligible, undergrad-eligible."
try { profile = (await readFile(join(here, "radar-profile.md"), "utf8")).trim() } catch {}

const store = JSON.parse(await readFile(storePath, "utf8"))
const items = Array.isArray(store?.items) ? store.items : []
const today = new Date().toISOString().slice(0, 10)

const prompt = `You are re-filtering an existing list of opportunities for THIS person's
profile. Today is ${today}. Keep only ones that genuinely fit; re-score the rest.

=== PROFILE (apply the eligibility filter strictly) ===
${profile}
=== END PROFILE ===

You are given the current opportunity records as DATA. For EACH one decide:
- DROP it if the profile's eligibility filter excludes it (requires 18+ with a deadline
  before he turns 18, requires US work authorization / citizenship / residency he lacks,
  graduate/PhD/senior-only, expired before ${today}, or otherwise off-profile).
- Otherwise KEEP it, and update priority + leverageScore for THIS profile, and add a short
  eligibility caveat to notes if there's any age/visa/degree question. Preserve the item's
  id, sourceRef, url, source, title, host, deadline, location, and modality unchanged
  (only set modality if it is missing: "remote" fully online, "hybrid" physical+online,
  "in-person" physical-only, "unknown" if unclear).

Output EXACTLY one JSON object, nothing else:
{ "opportunities": [ <the KEPT records, full objects, re-scored> ], "report": "<plain-text digest: how many kept vs dropped and why, then the top items to act on now for a 17-year-old Colombia-based sophomore>" }

Each kept record keeps this shape: {id,title,host,category,goals,priority,leverageScore,leverageNote,deadline,rolling,location,modality,eligibility,reward,url,source,sourceRef,notes,tags}.
Do not invent new opportunities. Do not call any tools.

<DATA>
${JSON.stringify(items)}
</DATA>`

process.stdout.write(prompt)
