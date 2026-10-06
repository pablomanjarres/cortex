import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'

interface SwimTimer {
  workoutDayId: string
  startedAt: number
}

export function useSwimTimer() {
  const [swim, setSwim] = useStore<SwimTimer | null>('cortex-gym-swim-active', null)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (!swim) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [swim])

  return {
    swim,
    elapsed: swim ? Math.max(0, Math.floor((Math.max(now, swim.startedAt) - swim.startedAt) / 1000)) : null,
    start: (workoutDayId: string) => {
      setSwim(() => ({ workoutDayId, startedAt: Date.now() }))
    },
    stop: () => {
      if (!swim) return null
      const duration = Math.max(1, Math.round((Date.now() - swim.startedAt) / 60000))
      setSwim(() => null)
      return { workoutDayId: swim.workoutDayId, duration }
    },
  }
}
