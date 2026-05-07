import { useEffect, useState, useCallback, useRef } from 'react'
import { supabaseSelect, supabaseConfigured } from './supabase'

export interface SpendToday {
  service: string
  model: string
  resource: string
  cost_usd: number
  usage_units: number | null
  unit_label: string | null
  last_seen: string
}

export interface SpendBucket {
  hour: string
  service: string
  model: string
  cost_usd: number
}

export interface BurnRate {
  service: string
  last_hour_usd: number
  usd_per_hour: number
  last_seen: string
}

export interface VmStatus {
  vm_name: string
  bucket_start: string
  bucket_end: string
  last_minute_usd: number
  projected_usd_per_hour: number
  status: string | null
  machine_type: string | null
  zone: string | null
  updated_at: string
}

export interface RealtimeSpendData {
  today: SpendToday[]
  month: SpendToday[]
  buckets24h: SpendBucket[]
  burnRate: BurnRate[]
  vmStatus: VmStatus[]
  loading: boolean
  error: string | null
  lastFetched: Date | null
  refresh: () => void
}

export function useRealtimeSpend(intervalMs: number = 30_000): RealtimeSpendData {
  const [today, setToday] = useState<SpendToday[]>([])
  const [month, setMonth] = useState<SpendToday[]>([])
  const [buckets24h, setBuckets24h] = useState<SpendBucket[]>([])
  const [burnRate, setBurnRate] = useState<BurnRate[]>([])
  const [vmStatus, setVmStatus] = useState<VmStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const mountedRef = useRef(true)

  const fetchAll = useCallback(async () => {
    if (!supabaseConfigured) {
      setError('Supabase env not configured (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)')
      setLoading(false)
      return
    }
    try {
      const [t, m, b, r, v] = await Promise.all([
        supabaseSelect<SpendToday>('costs_realtime_today', { select: '*' }),
        supabaseSelect<SpendToday>('costs_realtime_month', { select: '*' }),
        supabaseSelect<SpendBucket>('costs_realtime_24h', { select: '*' }),
        supabaseSelect<BurnRate>('costs_realtime_burn_rate', { select: '*' }),
        supabaseSelect<VmStatus>('costs_realtime_vm_status', { select: '*' }),
      ])
      if (!mountedRef.current) return
      setToday(t)
      setMonth(m)
      setBuckets24h(b)
      setBurnRate(r)
      setVmStatus(v)
      setError(null)
      setLastFetched(new Date())
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to fetch realtime spend')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchAll()
    const id = setInterval(fetchAll, intervalMs)
    return () => {
      mountedRef.current = false
      clearInterval(id)
    }
  }, [fetchAll, intervalMs])

  return { today, month, buckets24h, burnRate, vmStatus, loading, error, lastFetched, refresh: fetchAll }
}
