# Opportunity alerts

Cortex tells Pablo when an opportunity becomes worth acting on. Kaiser, his ChatGPT
dot, delivers the message. Research still runs weekly. Alerts fire only on meaningful
changes.

## Flow

1. Research lands in the radar (`cortex-opportunities`) by one of two paths. Both use
   the same merge in `scripts/radar-ingest.mjs` (`buildStore`):
   - the native weekly run, `scripts/opportunity-research.mjs` (launchd, Monday 09:00);
   - ChatGPT's weekly research, through MCP `add_opportunities`.
2. Each path then runs the alert check (`reconcileOpportunityAlerts`). The check
   compares every item with its last snapshot in `cortex-opportunity-alerts`. It
   creates immutable alerts for:
   - a new opportunity that is open now;
   - a tracked opportunity whose applications open;
   - a closed opportunity that reopens;
   - new travel, housing, meals, visa, grant or stipend support;
   - a deadline that moves earlier (urgent), or a week or more later;
   - a verified deadline within 7 days (urgent).

   Each alert has a dedupe key, and the history of keys outlives pruning, so the same
   event never fires twice. The first check only records snapshots (silent baseline).
3. Kaiser's scheduled task calls `get_opportunity_alerts`. That call runs the check
   again, so time-based alerts appear without new research. It then returns one
   ready-to-post message and the alert ids it covers. Kaiser posts the message and
   calls `ack_opportunity_alerts`.
4. Delivery is pull-based. An alert stays pending until it is acknowledged. If the Mac
   is offline, the tunnel drops or a post fails (`delivered: false`), the next check
   offers the alert again. Pending alerts expire when he applies or archives the
   item, when it is removed, or when applications close.

### What a check sends

- Urgent cards every time: a verified deadline within 7 days, or a deadline that
  moved earlier.
- The digest at most once every 6 days: the top 5 by profile score, with premium
  items first.
  - Items whose recommended action is Skip, such as a blocked U.S. trip, rank last.
  - Any further items appear as "+N more" and are acknowledged with the digest.
- One card per opportunity. If an opportunity has several alerts, the extras are
  listed under "Also".

### Card format

`opportunity-alert-card.ts` builds each card when the alert is created. A card shows:

- why it matters;
- funding, with grant, stipend and investment shown separately (investment is labelled
  "not a grant");
- the deadline, days left and whether it is verified;
- place and dates;
- eligibility confidence;
- visa and travel warnings;
- the official link;
- the recommended action: Apply, Prepare, Verify or Skip.

## Facts and their owners

All of these modules live in `src/features/opportunities/`.

| Fact | Owner |
|---|---|
| Application status (upcoming, open, rolling, closed, unknown) | `opportunity-window.ts` |
| Deadline confidence | `opportunity-window.ts` |
| Eligibility for an 18-year-old Colombian undergraduate | `opportunity-score.ts` (`eligibilityOf`) |
| Profile score and penalties | `opportunity-score.ts` |
| Funding lines and support keys | `opportunity-funding.ts` |
| Travel flag | `travel-readiness.ts` |
| Alert rules, queue and digest | `opportunity-alerts.ts` |

Notes on these facts:

- **Deadline confidence.** A deadline is verified only when it has source evidence
  and was checked within the last 14 days.
- **Penalties.** The score now also penalizes generic Devpost hackathons, online
  courses, unfunded conferences and international travel he would pay for.
- **Travel flags.** The travel rule is user data in `cortex-travel-readiness`. The
  default says the U.S. visa is pending until 2027-05-01. In-person U.S. events that
  start before that date are `US_TRAVEL_BLOCKED`. Events with unknown dates are
  `VISA_PENDING`. Remote events are never flagged. Change the rule with MCP
  `set_travel_readiness`.

### New record fields

- `opensAt`, `programStart` and `programEnd` hold exact dates or null, never estimates.
- `evidence` is owned by the radar and refreshed on every run.
- `premium` and `todoistTaskId` are owned by Pablo. Re-sightings keep them.
- `intel.mealsCovered` is new.
- `travel` is a new category.

## Premium and Todoist

The Todoist Opportunities project is Pablo's list of things he is 100% interested in.
`scripts/todoist-sync.mjs` (MCP `sync_opportunity_todoist`, also run after each
research run) keeps it and the radar in step.

### Todoist to Cortex

- Each top-level task in the project marks the matching radar item `premium`.
- Tasks with no match are imported as premium items. Their dates stay unverified until
  research confirms them.
- Premium items are never auto-hidden. They rank first, get re-verified on every
  research run and have a Premium filter on the Radar page.
- Sections named like Watchlist, Maybe or Later are not premium.

### Cortex to Todoist

An Apply or Prepare alert gets one task. The task has:

- the action as its title;
- the verified deadline as its Todoist deadline;
- a preparation due date (7 days before, or 14 for heavy applications);
- labels for category, premium and travel flag;
- the official link;
- a `cortex:<id>` marker.

### Safety rules

- Sync never creates projects.
- It never touches completed or deleted tasks, and never recreates a task he deleted.
- It never writes an unverified deadline.
- On tasks he wrote himself it only adds labels and fills a missing deadline.

The sync needs a Todoist API token. Without one it reports `skipped` and changes
nothing.

```bash
security add-generic-password -U -s cortex-todoist -a api-token -w
```

## Kaiser setup (ChatGPT, one time)

Dots support recurring scheduled tasks and connected apps. Scheduled runs post in the
dot's conversation, and each task has its own completion-notification setting. There
is no inbound API, so Cortex cannot push to the dot. Kaiser polls instead.

1. Open Kaiser's profile, then Customize > Plugins. Connect the existing **Cortex** app,
   the same private-tunnel app used from ChatGPT today. If Cortex is not offered to the
   dot, it is not yet a supported plugin there; see "If the dot cannot use Cortex".
2. Send Kaiser this message:

   > Every day at 8:30 AM Bogotá time, check my Cortex opportunity alerts:
   > 1. Call the Cortex tool `get_opportunity_alerts` with mode "auto".
   > 2. If `hasAlerts` is false, reply only "No new opportunity alerts."
   > 3. If `hasAlerts` is true, post `message` exactly as returned. Do not reword it,
   >    and do not add or drop items.
   > 4. Then call `ack_opportunity_alerts` with exactly the returned `alertIds`.
   > 5. If Cortex is unreachable or a tool fails, say "Cortex unreachable, will retry
   >    next run" and do not acknowledge anything. Never say alerts were delivered
   >    unless `ack_opportunity_alerts` succeeded.

3. Open Scheduled, then this task, and turn on completion notifications.

Proof of delivery is the alert's `deliveries` log and `deliveredAt` in
`cortex-opportunity-alerts`. Check it with `node scripts/opportunity-alerts.mjs pending`
or MCP `get_opportunity_alerts`.

### If the dot cannot use Cortex

Ask a regular ChatGPT scheduled task, in a chat with the Cortex app enabled, to run
the same five steps. Whether scheduled tasks can call custom MCP apps has not been
verified.

## Deploy

The live MCP server (launchd `com.cortex.mcp-server`) and the ChatGPT tunnel
(`connection.json` `mcp_command`) run
`/Users/pablo/Projects/.worktrees/cortex-radar/mcp-server/dist/index.js`. That is the
clean, detached `main` checkout the weekly research run also uses. The server loads the
shared radar modules from the same checkout at runtime (`../../scripts`, `../src/features`),
so one update ships the tools and the weekly run together. To deploy a merged change:

1. Move the checkout to the new `main`:
   `git -C /Users/pablo/Projects/.worktrees/cortex-radar fetch origin && git -C /Users/pablo/Projects/.worktrees/cortex-radar checkout --detach origin/main`.
2. Rebuild the server. When `mcp-server/package.json` changed, run `npm install` there first
   (its lockfile is not tracked, so `npm ci` would reject a stale one):
   `npm run build --prefix /Users/pablo/Projects/.worktrees/cortex-radar/mcp-server`.
3. Restart the HTTP server:
   `launchctl kickstart -k gui/$(id -u)/com.cortex.mcp-server`.
4. Stop the tunnel runtime. The supervisor reconnects with the new code on its next
   check:
   `"$HOME/Library/Application Support/CortexChatGPTTunnel/tunnel-client" runtimes stop cortex-chatgpt`.
5. Refresh the Cortex app's tools in ChatGPT's connector settings when the tool list changed.
6. Optionally, run `npm run cortex:install` and relaunch the app for UI changes.

## CLI

```bash
node scripts/opportunity-alerts.mjs check
node scripts/opportunity-alerts.mjs pending all
node scripts/opportunity-alerts.mjs ack <id...>
node scripts/todoist-sync.mjs --dry
```
