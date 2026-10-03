import { useEffect, useState } from 'react'
import { creditCardToday } from '../../../../electron/credit-card-model'

/** Date rollover only; notification scheduling belongs to the main process. */
export function useCardToday() {
  const [today, setToday] = useState(() => creditCardToday(new Date()))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      const now = new Date()
      const date = creditCardToday(now)
      setToday(date)
      clearTimeout(timer)
      timer = setTimeout(refresh, new Date(`${date}T05:00:00Z`).getTime() + 86400000 - now.getTime() + 1000)
    }
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible) }
  }, [])
  return today
}
