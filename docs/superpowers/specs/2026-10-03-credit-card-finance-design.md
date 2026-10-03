# Credit card in Finance

Status: approved and implemented; shipping verification is recorded in the pull request.

## Intended outcome

Give Pablo a clear view of card debt, the installments committed in each month,
and the preparation needed before payment. Surface deadlines through Finance,
Home, native notifications, and the existing phone notification channel.
Use Cortex's approved graphite and muted teal system.

The user's screenshots are evidence. Purchase details, bank figures, and the
one-time setup payload remain private; this repository is public.

## Product shape

Add a prominent **Credit card** section in Finance, plus a Credit card entry
in Finance's category breakdown. Keep one card profile for the requested card.
The section follows the selected Finance month; its payment timeline also has
full dates and a separate cycle selector that crosses calendar years.

The leading panel answers three questions:

1. **What is committed?** Tracked outstanding purchases and pending charges,
   alongside the bank's last reported debt and available credit.
2. **What is next?** The next unpaid cycle, its amount, and its payment deadline.
3. **Am I ready?** Money marked as set aside, the remaining preparation amount,
   and a plain status: Needs funding, Ready to pay, Paid, or Overdue.

Prepared money is a manual earmark. It does not move cash, reduce debt, mark a
payment as complete, or suppress payment reminders.

## Distinctive experience

The **Payment runway** is a horizontal timeline of monthly obligations and the
date the current purchase plan ends. Each cycle opens its installment breakdown.
It exposes future pressure without making the user inspect twelve budget columns.

The **Purchase preview** accepts a price, installment count, first due cycle,
and any known charges. It previews the resulting month totals and estimated
available credit. Saving creates a purchase; previewing writes nothing.

The **Statement checkpoint** appears at closing time: confirm the bank's figures,
minimum payment, due date, and any interest or fees. Until confirmed, projected
payments remain visibly estimated. A zero statement balance does not hide a
pending purchase or its future installments.

A focused **Needs attention** entry on Home opens this Finance section when a
payment is approaching, overdue, or a statement needs confirmation.

## Purchases and payments

Purchase fields: label, amount in whole COP, purchase date if known, status,
installment count, first due date, and optional bank-confirmed charges.
Statuses are Pending, Posted, and Cancelled. Pending charges reserve estimated
credit and produce a tentative schedule; cancelling removes future commitments.
Never invent the date of a screenshot purchase when only "today" is visible.

Split principal with integer arithmetic and put any remainder into the final
installment. All installment amounts must add back to the purchase amount.
Use full date-only dates and clamp a configured due day to the month's last day.
Never wrap a January installment into the previous year's January budget.

Record completed payments with actual amount, actual payment date, allocations
to due cycles, and an optional known principal/charge breakdown. The payment
amount is counted once in the cash month; allocations settle due-month targets.
Unclassified amounts stay unclassified. Do not invent the bank's allocation rule.
Allow corrections through validated commands without silently erasing history.

Keep the reported minimum distinct from the planned cycle payment. Show both
when they differ, never replace a full installment forecast with a smaller
minimum, and require the chosen target to cover any confirmed unpaid minimum.

Store bank-reported balances as immutable dated snapshots. Payment entries do
not rewrite those facts. Show tracked estimates separately, and identify a bank
snapshot that predates a balance-changing entry.

## Monthly Finance integration

The card ledger is distinct from recurring budget rows and one-time expenses.
`financeMonth()` remains the owner of Finance totals and takes an optional card
month projection. This extends Expenses, Savings, Pending, Paid, Account balance,
the category pie, annual charts, and a derived Credit card budget subtotal.

Planned installments and known charges count in the month they are due.
Completed cash payments count in the month money was paid. Early payment can
therefore reduce this month's balance and settle next month's installment.
Never add the full purchase as an expense and then add its installments again.
Legacy Finance data and totals remain identical when the card ledger is empty.

## Reminders

Defaults: 7, 3, and 1 day before payment; the due day; then at most one reminder
per day while an amount remains overdue. Add a statement confirmation reminder
at closing. Use America/Bogota and an editable daytime delivery window.

Closing the window leaves Cortex running in the tray. Quitting Cortex or
sleeping the Mac stops its scheduler. Check on startup, hourly, after resume,
and after relevant committed changes. Catchup sends the current action once,
instead of replaying every missed threshold. Show the last check and channel
readiness. Add an opt-in launch-at-login control using Electron's existing API.

Full payment stops that cycle's reminders. Partial payment reminders show only
the remainder. Set-aside money never stops reminders. Settings provide an
enable switch, lead times, quiet hours, channels, and a clearly labelled test.

Use one main-process notification adapter for native and phone delivery.
Migrate the existing notification IPC, academic deadline sender, and automation
sender to the shared transport, removing their replaced transport copies while
preserving their existing policy. Credit card consumes typed delivery outcomes.
Native clicks open Credit card. Phone delivery uses the existing Pushcut sender,
without changing unrelated muted categories. Provider acceptance and phone
display are distinct; the UI must not claim the latter from an HTTP response.

Track delivery per cycle, reminder kind, threshold, and channel. Await sender
outcome; Muted and Failed are not Sent. Use one active check, bounded messages,
and at most three total sends per occurrence/channel with persisted attempt
counts and next retry time. Backoff is bounded; hourly checks and restart never
reset the cap. Manual Retry starts a new bounded attempt for a current action.
Before every send, reread obligation, channels, enable switch, and quiet hours;
paid, cancelled, changed-date, or disabled work cannot send from a stale queue.
Quiet hours defer delivery without consuming the threshold.

Persist the occurrence before sending; reuse a stable Pushcut notification ID
across retries and restart. This replaces the same notification if acceptance
is followed by a bookkeeping failure. Surface persistence failures explicitly.
If one selected channel fails, send at most one actionable failure notice through
a working selected channel. If both fail, retain the visible failure state.
Keep only active cycle bookkeeping and at most 100 recent outcomes.
No renderer-owned background timers and no LLM in the scheduled work.

## Ownership and boundaries

| Responsibility | Owner |
|---|---|
| Card types and public pure domain facade | `electron/credit-card-types.ts`, `electron/credit-card-model.ts` |
| Validated serialized card commands | `electron/credit-card-service.ts` |
| Due checks and delivery bookkeeping | `electron/credit-card-alerts.ts` |
| Main-process channel delivery | focused shared notification adapter under `electron/` |
| Encryption, atomic writes, revisions, broadcasts | existing pipeline in `electron/main.ts` |
| Card UI and forms | `src/features/finance/credit-card/` |
| Finance composition and total integration | existing `FinancePage.tsx`, `finance-model.ts` |
| Home summary | focused card consumer of the public domain facade |

Use separate encrypted managed keys for the card ledger and delivery status.
Commands own mutation and validation; protect them from generic whole-key writes.
Expose matching IPC and HTTP commands for installed and browser consumers.
Require request identifiers for safe retries and serialize read-transition-write.
Browser-safe domain code must not import Electron, storage, or subprocess APIs.

Reuse WidgetCard, StatTile, Button, Input, Chip, Tabs, Modal, EmptyState,
Skeleton, and existing theme/chart tokens. Use focused components for the payment
timeline, readiness panel, purchase list, and forms. Pages only compose them.

## Initial setup and verification

Import the user's screenshot facts once with provenance and a stable command ID.
Keep the purchase pending, preserve the reported zero statement debt, and use the
observed future statement/due dates as editable estimates until confirmed.
Do not assume zero interest, import a whole statement, connect a bank, or pay it.

Verify installment conservation, cross-year dates, short months, pending/posted/
cancelled transitions, statement reconciliation, partial and early payments,
duplicate commands, concurrent writes, and legacy Finance compatibility.
Test reminders across failure, mute, retry, restart, quiet hours, wake, and paid
suppression. Test native success with phone failure independently.

Run existing unit tests, affected Finance/Home E2E, TypeScript frontend and
Electron builds, and changed-file lint. Verify 320px, keyboard, dark/light,
and empty/error states. No separate architecture checker currently exists.
Complete one focused ownership/reuse review and one actual PR review.

Install with a recoverable backup and preserve features already present in the
installed app. Verify the installed Finance UI, saved state, monthly totals,
and alert outcome; a bundle hash alone does not prove the running result.
