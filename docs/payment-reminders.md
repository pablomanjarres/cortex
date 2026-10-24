# Credit card payment reminders

The macOS LaunchAgent `com.pablo.cortex-payment-reminders` checks Cortex on each hour and at login. It sends one Pushcut reminder per credit card payment cycle, three calendar days before the deadline, from 09:00 America/Bogota. A late check catches up through the due date; it does not send overdue reminders.

The Mac must be awake and Cortex must be running. launchd coalesces missed calendar checks when the Mac wakes. Run results appear in Cortex Automations. The existing notification sender reads Pushcut credentials from its configured private store; the reminder job holds no credentials.

## Ownership

- `src/features/finance/accounts/account-reminders.ts` plans reminders using the account model's calendar rules. Archived accounts, debit cards, bank accounts, unset schedules, and explicit exclusions are skipped.
- `scripts/lib/payment-reminder-runner.ts` owns delivery transitions. It persists a claim before sending, records success only after the sender confirms acceptance, and holds uncertain deliveries for review.
- `scripts/payment-reminders.mts` reads live Cortex data, calls the existing Pushcut sender, reports each run, and owns local files and the process lock. Each run sends at most ten reminders; history and logs are bounded.
- `scripts/install-payment-reminders.mts` installs the runtime and timer. `--check` verifies installed files against source and checks that the LaunchAgent is loaded.

## Install and verify

Use a macOS Node runtime with native TypeScript support:

```sh
node scripts/payment-reminders.mts --dry-run
node scripts/install-payment-reminders.mts
node scripts/install-payment-reminders.mts --check
```

The installed runtime lives in `~/Library/Application Support/Cortex/payment-reminders`. Delivery records live separately in `~/Library/Application Support/Cortex/payment-reminder-state/deliveries.json`, so reinstalling preserves them. The system `shlock` utility prevents overlapping runs and recovers locks whose process has exited.

## Settings and exclusions

The Cortex store key `cortex-card-payment-reminders` holds:

```json
{
  "enabled": true,
  "daysBefore": 3,
  "hour": 9,
  "timeZone": "America/Bogota",
  "excludedAccountIds": ["pending-card"]
}
```

Reminders default to disabled until configured. Exclusions remain effective even if an account later receives a payment date. After verifying that date, remove its ID from the exclusion list. Account dates and settings are reread before each send, so future edits apply without reinstalling.

To stop delivery, set `enabled` to `false`. To unload the timer, run `launchctl bootout gui/$(id -u)/com.pablo.cortex-payment-reminders`.

## Delivery failures

An accepted Pushcut request is recorded as `sent`; this confirms service acceptance, not that the phone displayed the notification. A failed or interrupted send stays `sending` or `uncertain` and is not automatically repeated. Check the notification sender's receipt and the phone before resolving that one entry. Keep the rest of the delivery history intact.

Failures are reported to Cortex Automations. If Cortex is unreachable, the existing notification sender receives a service-issue alert. The infrastructure monitor also watches the job's exit status and required presence. Output logs in `~/Library/Logs/Cortex` rotate at 1 MiB.
