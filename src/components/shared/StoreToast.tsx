import { useEffect, useState } from 'react'

interface Toast {
  id: number
  key: string
}

const TOAST_MS = 6000
let toastSeq = 0

/**
 * Minimal fixed bottom-right toast for store write failures. Listens for the
 * window `cortex:store-error` CustomEvent dispatched by src/lib/store.ts and
 * auto-dismisses each toast after 6s. Mounted once in App.tsx.
 */
export function StoreToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const onError = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key ?? 'unknown'
      setToasts((prev) => {
        if (prev.some((t) => t.key === key)) return prev // one toast per key at a time
        const id = ++toastSeq
        timers.push(setTimeout(() => {
          setToasts((cur) => cur.filter((t) => t.id !== id))
        }, TOAST_MS))
        return [...prev, { id, key }]
      })
    }
    window.addEventListener('cortex:store-error', onError)
    return () => {
      window.removeEventListener('cortex:store-error', onError)
      for (const t of timers) clearTimeout(t)
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-xl border border-destructive/40 bg-card/95 px-4 py-3 text-xs shadow-lift backdrop-blur-sm"
        >
          <span className="font-semibold text-destructive">Save failed</span>
          <span className="ml-2 text-muted-foreground">
            Could not persist &ldquo;{t.key}&rdquo; — the latest change may not be saved.
          </span>
        </div>
      ))}
    </div>
  )
}
