import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
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
      if (event.key === 'Escape') {
        setOpen(false)
        setQuery('')
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
    <div className="relative flex-none [-webkit-app-region:no-drag] md:min-w-[10rem] md:flex-1 lg:max-w-[420px]">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search pages and actions"
        className="flex h-11 w-11 items-center justify-center gap-3 rounded-2xl border border-border bg-card text-left text-sm text-muted-foreground shadow-card transition-colors hover:border-accent/30 hover:text-foreground md:h-12 md:w-full md:justify-start md:px-4"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Search className="h-5 w-5 text-sidebar-primary" />
        <span className="hidden min-w-0 flex-1 truncate md:inline">Search pages and actions</span>
        <kbd className="hidden rounded-lg bg-secondary px-2 py-1 font-mono text-2xs text-muted-foreground md:inline">
          ⌘ K
        </kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Route search"
          className="fixed left-4 right-4 top-[calc(4.5rem+env(safe-area-inset-top))] z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-lift md:absolute md:left-0 md:right-auto md:top-14 md:w-full"
        >
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 text-sidebar-primary" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && selected) openItem(selected.href) }}
              placeholder="Find a page or action"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="button" onClick={close} aria-label="Close search" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" /></button>
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
