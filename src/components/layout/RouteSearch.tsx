import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { searchNavigation } from '@/lib/routes'
import { cn } from '@/lib/utils'

export function RouteSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const items = useMemo(() => searchNavigation(query).slice(0, 6), [query])
  const selected = items[0]

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function openItem(href: string) {
    navigate(href)
    close()
  }

  return (
    <div className="relative min-w-[10rem] flex-1 lg:max-w-[420px] [-webkit-app-region:no-drag]">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left text-sm text-muted-foreground shadow-card transition-colors hover:border-accent/30 hover:text-foreground"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Search className="h-5 w-5 text-sidebar-primary" />
        <span className="min-w-0 flex-1 truncate">Search anything...</span>
        <kbd className="hidden rounded-lg bg-secondary px-2 py-1 font-mono text-2xs text-muted-foreground sm:inline">
          ⌘ K
        </kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Route search"
          className="absolute left-0 top-14 z-50 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-lift"
        >
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 text-sidebar-primary" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') close()
                if (event.key === 'Enter' && selected) openItem(selected.href)
              }}
              placeholder="Find a route or action"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {items.length > 0 ? (
              items.map((item, index) => (
                <button
                  key={`${item.kind}-${item.href}`}
                  type="button"
                  onClick={() => openItem(item.href)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors',
                    index === 0 ? 'bg-focus-surface text-sidebar-accent-foreground' : 'hover:bg-secondary'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {'navLabel' in item ? item.navLabel : item.label}
                  </span>
                  <span className="font-mono text-2xs uppercase text-muted-foreground">{item.kind}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-4 text-sm text-muted-foreground">No route or action found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
