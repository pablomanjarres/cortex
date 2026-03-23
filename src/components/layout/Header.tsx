import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'

const pageTitles: Record<string, string> = {
  '/daily': 'Execute',
  '/habits': 'Habit Tracking',
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
  const title = pageTitles[location.pathname] || 'Dashboard'

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 md:px-6 backdrop-blur-md [-webkit-app-region:drag]">
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
      <div className="flex items-center gap-3">
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
