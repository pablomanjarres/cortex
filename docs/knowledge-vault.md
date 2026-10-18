# Knowledge vault

Cortex reads and writes the Eightfold Obsidian vault through one service, `electron/knowledge/vault.ts`. The HTTP API, the MCP `obsidian_*` tools and the research narrative store all use it.

## Ownership

| Data | Owner | Notes |
| --- | --- | --- |
| Startup narrative: venture, project, CRM and context notes, dashboards, templates | Vault | Notes link to Cortex records with the `cortex_refs` property. |
| Research notes, findings and decisions (after migration) | Vault, `Research/<campaign>/` | Without the vault, or before migration, Cortex keeps them. |
| Published research brief revisions and hashes, outreach events, meetings, sync receipts | Cortex | Noelle reads the published brief from Cortex. |
| Habits, goals, calendar, finance, manual CRM, Noelle DM history and other operational records | Cortex | Daily and Founder own current activity. No operational summaries are written to the vault. |
| Sync and backup protection | Cortex System | Reads the runtime's health report outside the vault. The runtime does not write vault content. |
| `System/` and `Templates/` | Vault setup | Cortex never writes them. Notes with `generated: true` are never rewritten. |

`electron/knowledge/refs.ts` is the only mapping between Cortex records and Cortex screens. Record references look like `kind:id`:

| Reference | Cortex screen |
| --- | --- |
| `home:eightfold` | `#/daily` (opens the vault Home note) |
| `project:<folder name, lower-case, dashed>` | `#/projects?project=<id>` |
| `goal:<id>` | `#/goals?record=goal:<id>` |
| `crm:<id>` (manual CRM) | `#/social?tab=crm&record=crm:<id>` |
| `noelle:<platform>:<id>` (Noelle DM contact) | `#/social?tab=crm&record=noelle:<platform>:<id>` |
| `contact:<id>` (personal contact) | `#/social?tab=contacts&record=contact:<id>` |
| `research:<campaign>` | `#/founder?tab=research` |

Manual CRM and Noelle DM contacts use different kinds and are never merged.

## Vaults and identity

- Primary vault: `CORTEX_VAULT_ROOT` (absolute path) or `~/Knowledge/Eightfold` when it exists. Only the primary vault is writable.
- Other vaults come from Obsidian's registry (`obsidian.json`). The legacy Mars vault comes from `MARS_VAULT_ROOT`, otherwise the registered `Mars` vault.
- A note's stable id is its `id` property. Reads, updates and record links resolve by id, so renaming or moving a note keeps references working. Notes without an `id` are addressed by path.
- Links open with `obsidian://open?vault=<vault name>&file=<path>`. The vault name is the same on every machine, so the same link works wherever the vault is synced.

## Safety and limits

- Paths are vault-relative and resolved against the vault's real path. Traversal, hidden and config folders (`.obsidian`, `.trash`, `.git`) and symlinks that leave the vault are refused.
- Listing walks at most 20,000 files; search reads at most 64 MB per request; single reads are capped at 2 MB. Results are paged with `limit` (max 200) and `cursor`, and report `truncated` when a cap was hit.
- Capture creates a new Markdown file without overwriting: a taken name gets a numeric suffix.
- Updates need the `revision` from a read. A changed note returns 409 with the current revision. Files are written to a temporary file and renamed into place.
- Notes whose properties use nested YAML can have their body updated, but their properties must be edited in Obsidian.

## HTTP API

All routes sit behind the app's localhost and Tailscale gate. Write routes also require a loopback connection.

| Route | Purpose |
| --- | --- |
| `GET /api/knowledge/vaults` | Vaults with source, primary/writable flags and bounded file counts. |
| `GET /api/knowledge/files?vault=&query=&extensions=md,canvas&folder=&limit=&cursor=` | File metadata, no bodies. |
| `GET /api/knowledge/search?q=&vault=&extensions=&limit=&cursor=` | Filename, text, Base and Canvas card matches. |
| `GET /api/knowledge/read?path=` or `?id=` `&vault=&limit=&cursor=&offset=&includeText=` | Markdown/text/Base lines with `note`, `properties` and `revision`; Canvas nodes with geometry and edges. |
| `GET /api/knowledge/links?ref=<record reference>` | `{ ref, available, vault, notes, uri, cortexUrl }`. `uri` is the first linked note, or a vault search when none links the record. |
| `GET /api/knowledge/summary` | Curated operational summary (below). |
| `GET /api/knowledge/health` | `{ status: 'ok', modifiedAt, ageSeconds, health }`, or `{ status: 'missing' \| 'invalid', error }`. Reads `~/Library/Application Support/Eightfold/health.json` and never writes it. |
| `POST /api/knowledge/capture` | `{ title, body?, folder? (default Inbox), properties? }` → note reference with `id` and `revision`. Loopback only. |
| `POST /api/knowledge/update` | `{ path \| id, baseRevision, body?, properties? }` (a `null` property removes it; `id` and `created` cannot change). Loopback only. |
| `POST /api/knowledge/migrate/research` | `{ dryRun?: boolean }`. Loopback only. See below. |

### Summary

`GET /api/knowledge/summary` returns `schemaVersion: 1` with:

- `generatedAt`, `timeZone`, Cortex URLs, and the vault name with its Home note URI;
- `projects` (reference, name, status, priority, tagline, Cortex URL; up to 50);
- `goals` (active and done counts; up to 20 active goals with progress);
- `calendar` (event count and up to 15 events for the next seven days: title, start, end, all-day, calendar);
- `finance` (this month's planned income, expenses, subscriptions and net);
- `crm` (manual CRM counts by status and active value, Noelle DM contact/conversation/message counts and sync time, personal contact count);
- `founder` (latest daily metrics, seven-day commits and deploys, research brief version/hash, event, verified-send, finding and decision counts).

It contains no contact details, message bodies, notes or raw store contents.

This endpoint remains available to API clients. It is not mirrored into Obsidian. The System page's protection panel reads the health endpoint through one bounded polling hook; its view model evaluates freshness per observation and backup cadence.

## MCP tools

`obsidian_list_vaults`, `obsidian_list_files`, `obsidian_search`, `obsidian_read`, `obsidian_capture` and `obsidian_update_note` call the HTTP API above, so the Cortex app must be running.

## Research narrative migration

The research service keeps reading and writing narrative in Cortex until the campaign has a manifest note (`type: research-campaign`) in `Research/<campaign>/`. The migration creates that manifest last, after copying and verifying every note, finding and decision:

```sh
# Preview: counts to create, records already in the vault, differences
curl -s -X POST http://127.0.0.1:3456/api/knowledge/migrate/research -H 'Content-Type: application/json' -d '{"dryRun":true}'

# Migrate
curl -s -X POST http://127.0.0.1:3456/api/knowledge/migrate/research -H 'Content-Type: application/json' -d '{}'
```

- Running it again creates nothing. Records already in the vault are kept; differences are listed in `differing`.
- `verified: true` with `authority: "vault"` means the vault is now the narrative source. With `verified: false`, no manifest was written and Cortex stays authoritative.
- The stored copy of the narrative is left as it was at migration time. It is not updated or read while the vault is authoritative.
- If the vault folder is missing, Cortex falls back to the stored narrative.
- Exports (`/api/founder-research/export`) and the local archive use the narrative from whichever side is authoritative.

Vault files: `Notes/Campaign.md` and `Notes/Event … .md` (`type: research-note`, `scope`), `Findings/*.md` (`type: research-finding`, `status`, `source_ids`), `Decisions/*.md` (`type: research-decision`, `status`, `evidence_ids`). The note body is the text. Findings and decisions keep their Cortex ids as their `id` property.

## Tests

- `scripts/knowledge-vault.test.mts`: discovery, confinement, paging, Canvas geometry, identity, capture and revision-checked updates.
- `scripts/knowledge-research.test.mts`: migration, authority switch, conflicts, fallback.
- `scripts/knowledge-http.test.mts`: routes, loopback gating, health, summary privacy, record references.
- `scripts/obsidian-mcp.test.mjs`: MCP tool routing.
- `e2e/knowledge-links.spec.ts`: deep links and vault links in the UI.
