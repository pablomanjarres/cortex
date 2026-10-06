import { useEffect, useState } from 'react'

type WakeLockStatus = 'idle' | 'requesting' | 'held' | 'insecure' | 'unsupported' | 'blocked' | 'released'

export function useWorkoutWakeLock(active: boolean) {
  const [enabled, setEnabled] = useState(true)
  const [status, setStatus] = useState<WakeLockStatus>('idle')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!active || !enabled) return
    let disposed = false
    let requesting = false
    let sentinel: WakeLockSentinel | null = null
    const release = () => {
      const held = sentinel
      sentinel = null
      if (held && !held.released) void held.release().catch(() => {})
    }
    const acquire = async () => {
      if (disposed || requesting || sentinel || document.visibilityState !== 'visible') return
      if (!window.isSecureContext) { setStatus('insecure'); return }
      if (!navigator.wakeLock?.request) { setStatus('unsupported'); return }
      requesting = true
      setStatus('requesting')
      try {
        const held = await navigator.wakeLock.request('screen')
        if (disposed || document.visibilityState !== 'visible') {
          if (!held.released) await held.release()
          return
        }
        if (held.released) { setStatus('released'); return }
        sentinel = held
        held.addEventListener('release', () => {
          if (!disposed && sentinel === held) {
            sentinel = null
            setStatus('released')
          }
        }, { once: true })
        setStatus('held')
      } catch {
        if (!disposed) setStatus('blocked')
      } finally {
        requesting = false
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire()
      else { release(); setStatus('idle') }
    }
    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      release()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, enabled, attempt])

  return {
    enabled,
    status: active && enabled ? status : 'idle' as WakeLockStatus,
    setEnabled: (next: boolean) => { setStatus('idle'); setEnabled(next) },
    retry: () => setAttempt((value) => value + 1),
  }
}
