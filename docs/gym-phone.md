# Gym on your phone

Keep the Cortex app running on an awake, networked Mac. Connect the Mac and phone to the same Tailscale network, then open Cortex through HTTPS.

## Secure address

The packaged app serves its UI and data API on port 3456. Choose an unused HTTPS port and proxy it with [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve):

```bash
tailscale serve --bg --https=8445 http://127.0.0.1:3456
tailscale serve status
```

Follow Tailscale's HTTPS setup prompt if needed. Use the hostname printed by Serve and open `https://YOUR-MAC.YOUR-TAILNET.ts.net:8445/#/gym` on the phone. Replace the example hostname with your own. If Cortex uses `CORTEX_PORT`, proxy that port instead of 3456.

Set `CORTEX_PUBLIC_URL` in the environment that launches Cortex, or save the same origin in the `cortex-web-settings` data key through the app's API:

```bash
curl --fail-with-body http://127.0.0.1:3456/api/data \
  -H 'Content-Type: application/json' \
  --data '{"key":"cortex-web-settings","data":{"publicUrl":"https://YOUR-MAC.YOUR-TAILNET.ts.net:8445"}}'
```

The value must be an HTTPS origin. It can include a port, but cannot contain credentials, a path, a query, or a fragment. A valid `CORTEX_PUBLIC_URL` takes priority for rest alert links. Alerts open the gym route at `/#/gym`.

## Tracking and reopening

Choose a workout and tap **Start workout**. Enter weight and reps, then tap **Log set**. Plan edits, active sets, rest deadlines, and swimming start times save through the shared data store. Reopening the page restores the data that reached the Mac; timers recalculate from their stored timestamps.

The page refreshes its records when it becomes visible again. If **Save failed** appears, restore the connection and verify the latest set after reopening. Pending edits can be lost if the browser closes before they reach the Mac.

**Finish workout** saves a full or partial session. **Discard** removes the active workout. The latest logged workout is kept for each day. Starting a replacement requires confirmation and preserves the previous record until the new workout is logged.

Open **Session options** to check **Keep screen on**. Cortex requests a screen wake lock while the active workout is visible on HTTPS and requests it again after returning to the page. Browser support, battery saver, and device settings can decline or release it. **Retry screen control** makes another request when available. The operating system can still suspend the page or lock the phone.

## Rest notifications

Rest alerts run in the Mac app, so the phone page can be backgrounded or locked. The Mac must stay awake, connected, and running Cortex. If the app stops, it recovers a saved rest deadline at its next startup; delivery can be delayed while the Mac or network is unavailable.

Cortex uses the existing notification script at `~/Projects/pushover/bin/notify.sh`. This path is fixed relative to the Mac account's home folder. Configure that integration's credentials and allow its `gym-rest` category; cloning Cortex does not install the script or configure notification policy.

The script receives the category, title, message, sound, a stable notification ID, and the configured HTTPS gym link. Cortex waits for a successful exit and `Sent:` acknowledgement. `Muted:` output or an error is a delivery failure, with at most three attempts per rest period. Provider acceptance does not confirm that the phone displayed or sounded the alert.

Skipping rest, finishing, or discarding cancels a pending alert. Delivery receipts prevent repeating a confirmed alert after reload or app restart. Foreground sound remains available in the workout page.

The shared store in `src/lib/store.ts` owns saving and refresh. `electron/gym-rest-alerts.ts` owns scheduling, delivery, and receipts. `src/features/gym/hooks/use-workout-wake-lock.ts` owns screen control.
