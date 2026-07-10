import { useEffect, useState } from 'react'
import { localDate } from './date-utils'

/**
 * Reactive "today" — returns the local YYYY-MM-DD string and keeps it fresh
 * while the app stays open across midnight (Cortex is an always-open app).
 *
 * - Arms a setTimeout for (next local midnight + 1s) and re-arms each day.
 * - Also recomputes on window focus + visibilitychange, because timers can
 *   stall or fire late while the Mac sleeps.
 *
 * Day-keyed surfaces (sprints, habits, nutrition, gym) must derive their
 * store keys from this hook instead of capturing localDate() once at mount.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => localDate())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const refresh = () => {
      const now = localDate()
      // setState bails out when the value is unchanged, so this is cheap
      setToday((prev) => (prev === now ? prev : now))
    }

    const arm = () => {
      if (timer) clearTimeout(timer)
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = setTimeout(() => {
        refresh()
        arm() // re-arm for the following midnight
      }, nextMidnight.getTime() - now.getTime() + 1000)
    }

    arm()

    // Sleep/wake safety: recompute immediately and re-arm from real time
    const onWake = () => {
      refresh()
      arm()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onWake()
    }
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return today
}
