import { useLocation } from 'react-router-dom'

const pageTitles: Record<string, string> = {
  '/daily': 'Daily Command Center',
  '/habits': 'Habit Tracking',
  '/founder': 'Founder Mode',
  '/student': 'Student Mode',
  '/health': 'Health & Energy',
  '/focus': 'Time & Focus',
  '/finance': 'Financial Pulse',
  '/journal': 'Journal & Notes',
  '/social': 'Social & Relationships',
  '/analytics': 'Analytics',
  '/admin': 'Life Admin',
  '/content': 'Content Hub',
}

export function Header() {
  const location = useLocation()
  const title = pageTitles[location.pathname] || 'Dashboard'

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-md [-webkit-app-region:drag]">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="liquid-glass rounded-lg px-3 py-1.5">
          <span className="text-sm font-medium text-muted-foreground">
            {new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>
    </header>
  )
}
