import { useEffect, useEffectEvent, useState } from 'react'
import type { ActiveWorkoutState } from '@/types/gym'
import { notifyRestDone } from '../domain/training-feedback'

export function useTrainingClock(workout: ActiveWorkoutState, onUpdate: (state: ActiveWorkoutState) => void) {
  const [elapsed, setElapsed] = useState('0:00')
  const [restTimeLeft, setRestTimeLeft] = useState(0)
  const expireRest = useEffectEvent(() => {
    notifyRestDone()
    onUpdate({ ...workout, isResting: false, restTimerEnd: null })
  })

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (!workout.isResting || workout.restTimerEnd === null) return
    const end = workout.restTimerEnd
    let finished = false
    const tick = () => {
      if (finished) return
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setRestTimeLeft(remaining)
      if (remaining === 0) {
        finished = true
        expireRest()
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    const onVisibility = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [workout.isResting, workout.restTimerEnd])

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Date.now() - new Date(workout.startedAt).getTime())
      setElapsed(`${Math.floor(diff / 60000)}:${String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')}`)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [workout.startedAt])

  return { elapsed, restTimeLeft }
}
