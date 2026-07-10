import { useLocation, useNavigate } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { titleForPath } from '@/lib/routes'
import { useSprintTimer } from '@/lib/sprint-context'

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const title = titleForPath(location.pathname)
  const { isRunning, isPaused, timeLeft } = useSprintTimer()
  const sprintActive = isRunning || isPaused
  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 md:px-6 backdrop-blur-md [-webkit-app-region:drag] h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            aria-label="Toggle navigation"
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors duration-150 [-webkit-app-region:no-drag]"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        {/* Page title — editorial serif italic; conveyor mask reveal on route change */}
        <span className="inline-block overflow-hidden">
          <h1
            key={location.pathname}
            className="font-serif italic text-xl md:text-2xl font-normal tracking-tight leading-none motion-safe:animate-[title-rise_0.45s_cubic-bezier(0.2,0.6,0.2,1)_both]"
          >
            {title}
          </h1>
        </span>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        {/* Sprint timer — persistent across all pages. Accent = running, amber = paused. */}
        {sprintActive && (
          <button
            onClick={() => navigate('/daily')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-xs tabular-nums transition-colors duration-150 active:scale-[0.98] [-webkit-app-region:no-drag]',
              isRunning
                ? 'bg-accent/10 text-accent hover:bg-accent/15'
                : 'bg-warning/10 text-warning hover:bg-warning/15'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full shrink-0',
                isRunning ? 'bg-accent motion-safe:animate-pulse' : 'bg-warning'
              )}
            />
            <span className="font-medium">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
          </button>
        )}
        {/* Date chip — one of the two sanctioned .liquid-glass roles */}
        <div className="liquid-glass rounded-full px-3 py-1.5">
          <span className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
            {new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>
    </header>
  )
}
