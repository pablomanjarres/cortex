import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard,
  Target,
  Rocket,
  GraduationCap,
  Wallet,
  Users,
  Library,
  Lightbulb,
  FolderKanban,
  Briefcase,
  Timer,
  BarChart3,
  Settings,
  Globe,
  Megaphone,
  Camera,
} from 'lucide-react'

const navGroups = [
  {
    label: 'Core',
    items: [
      { to: '/daily', icon: LayoutDashboard, label: 'Daily' },
      { to: '/habits', icon: Target, label: 'Habits' },
      { to: '/stats', icon: BarChart3, label: 'Stats' },
      { to: '/automations', icon: Timer, label: 'Automations' },
    ],
  },
  {
    label: 'Roles',
    items: [
      { to: '/founder', icon: Rocket, label: 'Founder' },
      { to: '/gtm', icon: Megaphone, label: 'GTM' },
      { to: '/student', icon: GraduationCap, label: 'Student' },
      { to: '/projects', icon: FolderKanban, label: 'Projects' },
      { to: '/crm', icon: Briefcase, label: 'CRM' },
    ],
  },
  {
    label: 'Life',
    items: [
      { to: '/finance', icon: Wallet, label: 'Finance' },
      { to: '/social', icon: Users, label: 'Social' },
      { to: '/books', icon: Library, label: 'Books' },
      { to: '/thoughts', icon: Lightbulb, label: 'Thoughts' },
      { to: '/captures', icon: Camera, label: 'Captures' },
    ],
  },
  {
    label: '',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground">
          <span className="text-sm font-serif italic text-background">C</span>
        </div>
        <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">
          <span className="font-serif italic font-normal">Cortex</span>
        </span>
      </div>

      <Separator className="bg-sidebar-border" />

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-6">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      <div className="px-5 py-4 flex flex-col gap-2">
        <a
          href="http://localhost:19100/lm"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-sidebar-muted hover:text-sidebar-foreground transition-colors"
        >
          <Globe className="h-3.5 w-3.5" />
          Localhost
        </a>
        <p className="text-xs text-sidebar-muted">
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
      {/* Backdrop */}
      <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer */}
      <aside className="md:hidden fixed left-0 top-0 z-50 h-screen w-[260px] bg-sidebar border-r border-sidebar-border flex flex-col animate-in slide-in-from-left duration-200">
        <div className="h-4 shrink-0" />
        <SidebarContent onNavigate={onClose} />
      </aside>
    </>
  )
}
