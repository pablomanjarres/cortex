# Paperclip Integration Wiring

The Paperclip integration ships as 4 self-contained new files:

- `electron/integrations/paperclip.ts` — REST client
- `src/lib/use-paperclip.ts` — React polling hook
- `src/features/paperclip/PaperclipSection.tsx` — UI panel
- `src/features/paperclip/PaperclipPage.tsx` — full-page wrapper

To make them visible in the running app, paste the snippets below into your existing Cortex files when committing the WIP.

Keychain field names this integration uses:

- `paperclip-token` — bearer token, format `pcp_board_*`
- `paperclip-base-url` — optional override; defaults to `http://openclaw-vm:3100`

---

## 1. `electron/main.ts` — Express proxy route

Add the import alongside the other integration imports:

```ts
import { createPaperclipClient } from './integrations/paperclip.js'
```

Paste this route block next to the other `/api/integrations/*` handlers (mirrors the GitHub block at lines 860-868):

```ts
if (url.pathname.startsWith('/api/integrations/paperclip') && req.method === 'GET') {
  try {
    const token = getKey('paperclip-token')
    if (!token) { res.writeHead(200, corsHeaders); res.end(JSON.stringify({ error: 'No Paperclip token saved' })); return }
    const baseUrl = getKey('paperclip-base-url') || 'http://openclaw-vm:3100'
    const client = createPaperclipClient({ baseUrl, token })
    const sub = url.pathname.replace('/api/integrations/paperclip', '')
    let data: unknown
    if (sub === '/companies') {
      data = await client.listCompanies()
    } else {
      const m = sub.match(/^\/companies\/([^/]+)\/(agents|heartbeat-runs|activity|live-runs)$/)
      if (!m) { res.writeHead(404, corsHeaders); res.end(JSON.stringify({ error: 'Unknown paperclip route' })); return }
      const [, companyId, kind] = m
      const limit = parseInt(url.searchParams.get('limit') || '20')
      if (kind === 'agents') data = await client.listAgents(companyId)
      else if (kind === 'heartbeat-runs') data = await client.listHeartbeatRuns(companyId, limit)
      else if (kind === 'activity') data = await client.listActivity(companyId, limit)
      else data = await client.liveRuns(companyId)
    }
    res.writeHead(200, corsHeaders); res.end(JSON.stringify(data))
  } catch (e: any) { res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message })) }
  return
}
```

The keychain handlers (`keychain:save`, `keychain:get`, etc.) are already wired at `main.ts:1144-1148`. Nothing else to add there.

---

## 2. `src/features/system/SystemPage.tsx` — new tab

Add to the imports block at the top:

```tsx
import { PaperclipSection } from '@/features/paperclip/PaperclipSection'
```

Inside `<TabsList>` (currently has Live + Spend), add a third trigger:

```tsx
<TabsTrigger value="paperclip">Paperclip</TabsTrigger>
```

After the `<TabsContent value="spend">` block, add the matching content:

```tsx
<TabsContent value="paperclip">
  <PaperclipSection />
</TabsContent>
```

---

## 3. `src/features/settings/SettingsPage.tsx` — token field

Add two entries to the `keyFields` array (next to `lemon-store-id`):

```ts
{ service: 'paperclip-token', label: 'Paperclip Token', placeholder: 'pcp_board_...', description: 'Bearer token from Paperclip board settings' },
{ service: 'paperclip-base-url', label: 'Paperclip Base URL', placeholder: 'http://openclaw-vm:3100', description: 'Override only if Paperclip is not on the default tailnet host' },
```

The existing `KeyRow` component handles save/reveal/delete for any new entry without further changes.

---

## 4. (Optional) Standalone page route

`PaperclipPage.tsx` is a drop-in for cases where Paperclip should live as its own sidebar entry rather than inside the System tab — wire it the same way the other top-level pages are routed (look at how `SpendPage` / `SystemPage` are referenced in your router).
