import { useLocation, useNavigate } from 'react-router-dom'
import { Activity, Menu, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { titleForPath } from '@/lib/routes'
import { useSprintTimer } from '@/lib/sprint-context'
import { RouteSearch } from './RouteSearch'

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const title = titleForPath(location.pathname)
  const { isRunning, isPaused, timeLeft } = useSprintTimer()
  const sprintActive = isRunning || isPaused
  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60

  return (
    <header className="sticky top-0 z-30 flex min-h-[calc(4.75rem+env(safe-area-inset-top))] items-center gap-3 border-b border-border/70 bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl [-webkit-app-region:drag] md:px-6">
      <div className="flex min-w-0 items-center gap-3 md:min-w-[7rem] lg:w-[220px]">
        {/* Hamburger — mobile only */}
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            aria-label="Toggle navigation"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-card text-muted-foreground shadow-card transition-colors duration-150 hover:bg-focus-surface hover:text-sidebar-accent-foreground md:hidden [-webkit-app-region:no-drag]"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <span className="inline-block overflow-hidden">
          <h1
            key={location.pathname}
            className="truncate text-2xl font-bold leading-none tracking-tight motion-safe:animate-[title-rise_0.45s_cubic-bezier(0.2,0.6,0.2,1)_both] md:text-3xl"
          >
            {title}
          </h1>
        </span>
      </div>
      <div className="ml-auto md:ml-0 md:min-w-0 md:flex-1">
        <RouteSearch />
      </div>
      <div className="flex items-center gap-2 md:hidden">
        <button
          onClick={() => navigate('/library?kind=captures')}
          aria-label="Capture"
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_14px_32px_rgba(98,74,181,0.28)] transition-colors hover:bg-primary/90 [-webkit-app-region:no-drag]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="hidden shrink-0 items-center gap-2 md:flex lg:gap-4">
        <div className="flex shrink-0 items-center gap-2 lg:gap-3">
          <button
            onClick={() => navigate('/system')}
            aria-label="Open system status"
            className="flex h-11 items-center gap-2 rounded-full bg-card px-3 text-sm font-semibold text-foreground shadow-card transition-colors hover:bg-secondary lg:px-4 [-webkit-app-region:no-drag]"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
            <span className="hidden xl:inline">System</span>
          </button>
          <button
            onClick={() => navigate('/daily')}
            aria-label={sprintActive ? `Open active focus sprint, ${mins} minutes ${secs} seconds left` : 'Open focus sprint, idle'}
            className={cn(
              'flex h-11 items-center gap-2 rounded-full px-3 font-mono text-xs font-medium tabular-nums shadow-card transition-colors active:scale-[0.98] lg:px-4 [-webkit-app-region:no-drag]',
              sprintActive
                ? isRunning
                  ? 'bg-focus-surface text-sidebar-accent-foreground hover:bg-focus-surface/80'
                  : 'bg-warning/10 text-warning hover:bg-warning/15'
                : 'bg-card text-muted-foreground hover:bg-secondary'
            )}
          >
            <Activity className="h-4 w-4" />
            <span className="hidden xl:inline">
              {sprintActive ? `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : 'Focus idle'}
            </span>
          </button>
          <button
            onClick={() => navigate('/library?kind=captures')}
            aria-label="Capture"
            className="flex h-11 items-center gap-2 rounded-2xl bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-[0_14px_32px_rgba(98,74,181,0.28)] transition-colors hover:bg-primary/90 lg:px-5 [-webkit-app-region:no-drag]"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden lg:inline">Capture</span>
          </button>
        </div>
      </div>
    </header>
  )
}
