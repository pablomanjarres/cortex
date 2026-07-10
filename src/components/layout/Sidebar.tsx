import { NavLink } from 'react-router-dom'
import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { NAV_GROUPS } from '@/lib/routes'

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {/* Wordmark — the serif italic C is the brand mark. Do not restyle. */}
      <div className="flex items-center gap-3 px-5 pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground">
          <span className="text-sm font-serif italic text-background">C</span>
        </div>
        <span className="text-lg tracking-tight text-sidebar-foreground">
          <span className="font-serif italic">Cortex</span>
        </span>
      </div>

      <Separator className="bg-sidebar-border" />

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-6">
          {NAV_GROUPS.map((group, i) => (
            <div key={group.label || `group-${i}`}>
              {group.label && (
                <p className="mb-2 px-2 font-mono text-2xs uppercase tracking-widest text-sidebar-muted">
                  {group.label}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {group.routes.map((route) => (
                  <NavLink
                    key={route.path}
                    to={route.path}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                        isActive
                          ? 'text-accent before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-0.5 before:rounded-full before:bg-accent'
                          : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                      )
                    }
                  >
                    <route.icon className="h-4 w-4 shrink-0" />
                    {route.navLabel}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

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
    <aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-[220px] border-r border-sidebar-border bg-sidebar flex-col">
      {/* Spacer for macOS traffic light buttons */}
      <div className="h-[38px] shrink-0 [-webkit-app-region:drag]" />
      <SidebarContent />
    </aside>
  )
}

// Mobile sidebar overlay
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <>
      {/* Scrim — matches the app-wide overlay rule (bg-black/70 + blur) */}
      <div className="md:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer */}
      <aside className="md:hidden fixed left-0 top-0 z-50 h-screen w-[260px] bg-sidebar border-r border-sidebar-border flex flex-col motion-safe:animate-in motion-safe:slide-in-from-left motion-safe:duration-200 pt-[env(safe-area-inset-top)]">
        <div className="h-4 shrink-0" />
        <SidebarContent onNavigate={onClose} />
      </aside>
    </>
  )
}
