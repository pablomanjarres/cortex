// cortex-store — read and rev-checked read-modify-write of one Cortex store key over the
// app's local API (/api/data). Unlike the radar ingest's lenient reader, a failed read
// THROWS: callers here must never mistake "Cortex is down" for "the key is empty" and
// write an empty value over real data.

const MAX_RETRIES = 3

export async function readKey(api, key) {
  const res = await fetch(`${api}/api/data?key=${encodeURIComponent(key)}`)
  if (!res.ok) throw new Error(`Cortex ${res.status} reading ${key}: ${(await res.text()).slice(0, 200)}`)
  return { data: await res.json(), rev: res.headers.get("x-cortex-rev") }
}

/** One POST /api/data, with baseRev when known. Returns the raw Response. */
export async function writeKey(api, key, data, baseRev) {
  return fetch(`${api}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(baseRev != null ? { key, data, baseRev } : { key, data }),
  })
}

/**
 * fn(current) returns { value, result } to write `value`, or { result } alone to skip the
 * write. On a 409 the fresh value becomes the base and fn re-runs (it must be pure).
 * Returns fn's result from the attempt that landed.
 */
export async function mutateKey(api, key, fn) {
  let { data, rev } = await readKey(api, key)
  for (let attempt = 0; ; attempt++) {
    const out = await fn(data)
    if (!out || !("value" in out)) return out?.result
    const res = await writeKey(api, key, out.value, rev)
    if (res.ok) return out.result
    if (res.status === 409 && attempt < MAX_RETRIES) {
      const body = await res.json().catch(() => null)
      if (body && "data" in body) ({ data, rev } = { data: body.data, rev: body.rev ?? null })
      else ({ data, rev } = await readKey(api, key))
      continue
    }
    throw new Error(`Cortex ${res.status} writing ${key}: ${(await res.text()).slice(0, 200)}`)
  }
}
