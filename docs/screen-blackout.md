# Screen blackout

System has independent switches for the Mac and `laptop-w`. They control the
existing screen blackout tools while the machines keep running. State comes
from the host, is refreshed every 15 seconds, and is never saved as a preference.

The Mac requires Umbra running from `/Applications/Umbra.app`, with support for
the `io.github.frapsd.Umbra.toggle` and `io.github.frapsd.Umbra.restore`
distributed notifications. The bundled Swift adapter reads the active displays'
gamma tables before and after a change. Umbra owns the saved tables and restores
them; Cortex does not create a second blackout layer.

`laptop-w` requires the existing ScreenBlackout helper and `machine-route`
installation. Read-only state uses SSH and validates the helper's live process.
Changes run in the interactive desktop through `machine-route`, which owns
readiness checks, input leases, deadlines, and execution receipts. The adapter
checks the requested state before sending a command and verifies it afterwards.
An uncertain command is not automatically retried.

Ownership:

- `electron/screen-blackout-contract.ts` defines the host and state contract.
- `electron/screen-blackout-service.ts` validates commands and bounds concurrent
  work. `screen-blackout-native.ts` owns process transport.
- `scripts/screen-blackout-mac.swift` and `screen-blackout-windows.ps1` adapt the
  installed tools. `build-screen-blackout.mjs` builds the Mac helper during
  `electron:compile`; Electron packaging includes both adapters.
- `src/features/system/ScreenBlackout.tsx` presents the controls;
  `useScreenBlackout.ts` owns polling and pending states; `blackout-api.ts` owns
  HTTP transport. `SystemPage` only composes the panel.

The HTTP endpoint is `GET /api/system/blackout` for both hosts and
`POST /api/system/blackout` with `{ "host": "mac", "enabled": true }` to set one
host. Invalid commands return 400, overlapping writes to one host return 409,
and unverified changes return 502. The existing local/Tailscale network gate
applies, and writes reject unrelated browser origins.
