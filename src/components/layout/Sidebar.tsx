import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BookOpen, BriefcaseBusiness, Globe, Home, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { mobileDestinationForPath, NAV_GROUPS } from '@/lib/routes'

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 pb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-focus-surface text-sidebar-primary shadow-[inset_0_0_0_1px_rgba(98,74,181,0.16)]">
          <span className="text-xl font-black leading-none">C</span>
        </div>
        <span className="text-2xl font-bold tracking-tight text-sidebar-foreground">Cortex</span>
      </div>

      <Separator className="mx-5 bg-sidebar-border/70" />

      <ScrollArea className="min-h-0 flex-1 px-3 py-5">
        <nav className="flex flex-col gap-7">
          {NAV_GROUPS.map((group, i) => (
            <div key={group.label || `group-${i}`}>
              <p className="mb-2 px-2 text-sm font-bold text-sidebar-muted">{group.label}</p>
              <div className="flex flex-col gap-1">
                {group.routes.map((route) => (
                  <NavLink
                    key={route.path}
                    to={route.path}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'relative flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors duration-150',
                        isActive
                          ? 'bg-focus-surface text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_rgba(98,74,181,0.12)]'
                          : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                      )
                    }
                  >
                    <route.icon className="h-5 w-5 shrink-0" />
                    {route.navLabel}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      <Separator className="mx-5 bg-sidebar-border/70" />

      {/* Footer — quiet mono telemetry */}
      <div className="px-5 py-4 flex flex-col gap-2">
        <a
          href="http://localhost:19100/lm"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-sidebar-muted hover:text-sidebar-foreground transition-colors duration-150"
        >
          <Globe className="h-3 w-3" />
          Localhost
        </a>
        <p className="font-mono text-2xs uppercase tracking-wider text-sidebar-muted">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </p>
      </div>
    </>
  )
}

// Desktop sidebar — hidden on mobile
export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[244px] flex-col border-r border-sidebar-border/70 bg-sidebar md:flex">
      {/* Spacer for macOS traffic light buttons */}
      <div className="h-[34px] shrink-0 [-webkit-app-region:drag]" />
      <SidebarContent />
    </aside>
  )
}

// Mobile sidebar overlay
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null
  return (
    <>
      {/* Scrim — matches the app-wide overlay rule (bg-black/70 + blur) */}
      <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm md:hidden" onClick={onClose} />
      {/* Drawer */}
      <aside className="fixed left-0 top-0 z-50 flex h-dvh w-[300px] max-w-[86vw] flex-col border-r border-sidebar-border bg-sidebar pt-[env(safe-area-inset-top)] motion-safe:animate-in motion-safe:slide-in-from-left motion-safe:duration-200 md:hidden">
        <div className="h-5 shrink-0" />
        <SidebarContent onNavigate={onClose} />
      </aside>
    </>
  )
}

const MOBILE_DESTINATIONS = [
  { to: '/daily', label: 'Home', icon: Home },
  { to: '/student', label: 'Study', icon: BookOpen },
  { to: '/founder', label: 'Build', icon: BriefcaseBusiness },
  { to: '/finance', label: 'Life', icon: UserRound },
]

export function MobileBottomNav() {
  const location = useLocation()
  const activeDestination = mobileDestinationForPath(`${location.pathname}${location.search}`)

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="z-40 shrink-0 border-t border-border/80 bg-card/95 px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
    >
      <div className="grid grid-cols-4 gap-1">
        {MOBILE_DESTINATIONS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.label}
            className={() =>
              cn(
                'flex min-h-11 items-center justify-center gap-1.5 rounded-2xl text-xs font-semibold transition-colors',
                activeDestination === item.to
                  ? 'bg-focus-surface text-sidebar-accent-foreground'
                  : 'text-sidebar-muted hover:bg-secondary hover:text-foreground'
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
