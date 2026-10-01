# Project time API

With Cortex running, send JSON commands to `POST http://127.0.0.1:3456/api/work-hours/command`.
Successful requests return `{ "ok": true, "state": ... }`. Validation errors return HTTP 400 with `{ "ok": false, "error": ... }`.

## Timer ownership

Choose a unique session ID when starting work and keep it for the matching stop:

```json
{ "type": "start", "id": "work-20260929-001", "projectId": "construcredit" }
```

```json
{ "type": "stop-owned", "id": "work-20260929-001" }
```

`stop-owned` stops only the active interval with that ID. A different active ID or an already stopped interval returns the current state unchanged. The ID check runs inside the same serialized operation as the stop, including when a manual timer change is queued first. Session IDs cannot be reused.

## Attach a deliverable

After stopping an interval, attach its PR URL and a description:

```json
{
  "type": "attach-deliverable",
  "id": "work-20260929-001",
  "prUrl": "https://github.com/owner/repo/pull/12",
  "description": "Fix loan calculation"
}
```

The command fills a blank description and preserves any existing nonblank description. It rejects a different PR URL if the session already has one. Repeating an unchanged attachment adds no correction entry.

Only the saved session's description and PR URL can change. Its times, duration, billing choice, review flag, prior corrections, and finalized reports stay intact. A changed attachment is recorded in the session's correction history.

Attaching a URL does not verify a PR, CI, or deployment. Fetch those facts separately through `POST /api/work-hours/evidence` with `{ "prUrl": "..." }`.
