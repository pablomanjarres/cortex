import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { readStore } from '@/lib/store'

const LAST_ROUTE = 'cortex-last-route'

function lastRoute() {
  try {
    const route = localStorage.getItem(LAST_ROUTE)
    return route && /^\/[a-z-]+$/.test(route) ? route : '/daily'
  } catch { return '/daily' }
}

export function RouteMemory() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (pathname === '/') return
    try { localStorage.setItem(LAST_ROUTE, pathname) } catch { /* storage unavailable */ }
  }, [pathname])
  return null
}

export function RouteResume() {
  const [route, setRoute] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    Promise.all([
      readStore<{ workoutDayId?: string } | null>('cortex-gym-active', null),
      readStore<{ workoutDayId?: string } | null>('cortex-gym-swim-active', null),
    ]).then(([workout, swim]) => {
      if (active) setRoute(workout?.workoutDayId || swim?.workoutDayId ? '/gym' : lastRoute())
    }).catch(() => { if (active) setRoute(lastRoute()) })
    return () => { active = false }
  }, [])
  return route ? <Navigate to={route} replace /> : <p className="p-4 text-sm text-muted-foreground">Restoring your page…</p>
}
