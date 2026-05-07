import { useLocation, useNavigate } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useSprintTimer } from '@/lib/sprint-context'

const pageTitles: Record<string, string> = {
  '/daily': 'Execute',
  '/habits': 'Habit Tracking',
  '/stats': 'Stats & Audits',
  '/automations': 'Automations',
  '/founder': 'Founder Mode',
  '/student': 'Student Mode',
  '/projects': 'Projects',
  '/crm': 'Business CRM',
  '/finance': 'Financial Pulse',
  '/social': 'Contacts',
  '/books': 'Books',
  '/thoughts': 'Thoughts',
  '/settings': 'Settings',
}

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const title = pageTitles[location.pathname] || 'Dashboard'
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
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors [-webkit-app-region:no-drag]"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-base md:text-lg font-semibold tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        {/* Sprint timer — persistent across all pages */}
        {sprintActive && (
          <button
            onClick={() => navigate('/daily')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-xs tabular-nums transition-colors [-webkit-app-region:no-drag] ${
              isRunning
                ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
              isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'
            }`} />
            <span className="font-semibold">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
          </button>
        )}
        <div className="liquid-glass rounded-lg px-2 md:px-3 py-1.5">
          <span className="text-xs md:text-sm font-medium text-muted-foreground">
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
