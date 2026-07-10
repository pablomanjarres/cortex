import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Target,
  Goal,
  Rocket,
  GraduationCap,
  Wallet,
  Users,
  Library,
  LibraryBig,
  FolderKanban,
  Radar,
  Settings,
  Dumbbell,
  Cpu,
} from 'lucide-react'

/**
 * THE route config — single source of truth for navigation.
 * Sidebar nav groups and the Header page title both consume this.
 * Routed pages must NOT repeat the topbar title (see DESIGN-SYSTEM.md).
 */
export interface AppRoute {
  /** Router path, e.g. '/daily' */
  path: string
  /** Topbar page title (serif italic in Header) */
  title: string
  /** Sidebar nav label (short) */
  navLabel: string
  /** Sidebar group; '' renders without a group heading */
  group: 'Core' | 'Roles' | 'Life' | ''
  icon: LucideIcon
  /** Optional one-line subtitle for future use (Header/PageHeader) */
  subtitle?: string
}

export const ROUTES: AppRoute[] = [
  // ── Core ──────────────────────────────────────────────────────────────────
  { path: '/daily', title: 'Execute', navLabel: 'Daily', group: 'Core', icon: LayoutDashboard },
  { path: '/habits', title: 'Habit Tracking', navLabel: 'Habits', group: 'Core', icon: Target },
  { path: '/goals', title: 'Goals', navLabel: 'Goals', group: 'Core', icon: Goal },
  { path: '/system', title: 'System', navLabel: 'System', group: 'Core', icon: Cpu },
  // ── Roles ─────────────────────────────────────────────────────────────────
  { path: '/founder', title: 'Founder Mode', navLabel: 'Founder', group: 'Roles', icon: Rocket },
  { path: '/student', title: 'Student Mode', navLabel: 'Student', group: 'Roles', icon: GraduationCap },
  { path: '/projects', title: 'Projects', navLabel: 'Projects', group: 'Roles', icon: FolderKanban },
  { path: '/opportunities', title: 'Opportunities', navLabel: 'Opportunities', group: 'Roles', icon: Radar },
  // ── Life ──────────────────────────────────────────────────────────────────
  { path: '/finance', title: 'Financial Pulse', navLabel: 'Finance', group: 'Life', icon: Wallet },
  { path: '/gym', title: 'Gym', navLabel: 'Gym', group: 'Life', icon: Dumbbell },
  { path: '/social', title: 'Contacts', navLabel: 'Social', group: 'Life', icon: Users },
  { path: '/books', title: 'Books', navLabel: 'Books', group: 'Life', icon: Library },
  { path: '/library', title: 'Library', navLabel: 'Library', group: 'Life', icon: LibraryBig },
  // ── Ungrouped ─────────────────────────────────────────────────────────────
  { path: '/settings', title: 'Settings', navLabel: 'Settings', group: '', icon: Settings },
]

export interface NavGroup {
  label: string
  routes: AppRoute[]
}

/** Sidebar groups derived from ROUTES, order preserved. */
export const NAV_GROUPS: NavGroup[] = ROUTES.reduce<NavGroup[]>((groups, route) => {
  const last = groups[groups.length - 1]
  if (last && last.label === route.group) {
    last.routes.push(route)
  } else {
    groups.push({ label: route.group, routes: [route] })
  }
  return groups
}, [])

/** Resolve the route for a pathname (exact or nested, e.g. '/gym/history'). */
export function routeForPath(pathname: string): AppRoute | undefined {
  return (
    ROUTES.find((r) => r.path === pathname) ??
    ROUTES.find((r) => pathname.startsWith(`${r.path}/`))
  )
}

/** Topbar title for a pathname; falls back to 'Dashboard' for unknown paths. */
export function titleForPath(pathname: string): string {
  return routeForPath(pathname)?.title ?? 'Dashboard'
}
