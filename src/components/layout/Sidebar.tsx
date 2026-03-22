import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard,
  Target,
  Rocket,
  GraduationCap,
  Heart,
  Timer,
  Wallet,
  BookOpen,
  Users,
  BarChart3,
  ClipboardList,
  Video,
  Settings,
  Library,
  Lightbulb,
} from 'lucide-react'

const navGroups = [
  {
    label: 'Core',
    items: [
      { to: '/daily', icon: LayoutDashboard, label: 'Daily' },
      { to: '/habits', icon: Target, label: 'Habits' },
    ],
  },
  {
    label: 'Roles',
    items: [
      { to: '/founder', icon: Rocket, label: 'Founder' },
      { to: '/student', icon: GraduationCap, label: 'Student' },
      { to: '/content', icon: Video, label: 'Content' },
    ],
  },
  {
    label: 'Life',
    items: [
      { to: '/health', icon: Heart, label: 'Health' },
      { to: '/focus', icon: Timer, label: 'Focus' },
      { to: '/finance', icon: Wallet, label: 'Finance' },
      { to: '/journal', icon: BookOpen, label: 'Journal' },
      { to: '/social', icon: Users, label: 'Social' },
      { to: '/books', icon: Library, label: 'Books' },
      { to: '/thoughts', icon: Lightbulb, label: 'Thoughts' },
      { to: '/admin', icon: ClipboardList, label: 'Admin' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    ],
  },
  {
    label: '',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-[220px] border-r border-sidebar-border bg-sidebar flex flex-col">
      {/* Spacer for macOS traffic light buttons */}
      <div className="h-[38px] shrink-0 [-webkit-app-region:drag]" />
      <div className="flex items-center gap-3 px-5 pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground">
          <span className="text-sm font-bold text-background">C</span>
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

      <div className="px-5 py-4">
        <p className="text-xs text-sidebar-muted">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </p>
      </div>
    </aside>
  )
}
