// Lightweight Supabase REST client (no SDK dep).
// Uses the publishable/anon key — RLS controls actual access.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

export async function supabaseSelect<T = unknown>(
  table: string,
  params?: Record<string, string>
): Promise<T[]> {
  if (!supabaseConfigured) throw new Error('Supabase env not configured')
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Supabase ${table} ${res.status}: ${await res.text()}`)
  return res.json()
}
