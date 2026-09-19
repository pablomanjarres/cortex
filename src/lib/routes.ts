import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
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
  Cloud,
  Workflow,
  Plus,
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
  group: 'Today' | 'Build' | 'Study' | 'Life' | 'System'
  icon: LucideIcon
  /** Optional one-line subtitle for future use (Header/PageHeader) */
  subtitle?: string
}

export const ROUTES: AppRoute[] = [
  // ── Today ─────────────────────────────────────────────────────────────────
  { path: '/daily', title: 'Home', navLabel: 'Home', group: 'Today', icon: LayoutDashboard },
  { path: '/calendar', title: 'Calendar', navLabel: 'Calendar', group: 'Today', icon: CalendarDays },
  { path: '/habits', title: 'Habits', navLabel: 'Habits', group: 'Today', icon: Target },
  { path: '/goals', title: 'Goals', navLabel: 'Goals', group: 'Today', icon: Goal },
  // ── Build ─────────────────────────────────────────────────────────────────
  { path: '/founder', title: 'Founder', navLabel: 'Founder', group: 'Build', icon: Rocket },
  { path: '/projects', title: 'Projects', navLabel: 'Projects', group: 'Build', icon: FolderKanban },
  { path: '/opportunities', title: 'Opportunities', navLabel: 'Opportunities', group: 'Build', icon: Radar },
  { path: '/cloud-costs', title: 'Cloud Spend', navLabel: 'Cloud Spend', group: 'Build', icon: Cloud },
  // ── Study ─────────────────────────────────────────────────────────────────
  { path: '/student', title: 'Student', navLabel: 'Student', group: 'Study', icon: GraduationCap },
  { path: '/library', title: 'Library', navLabel: 'Library', group: 'Study', icon: LibraryBig },
  { path: '/books', title: 'Books', navLabel: 'Books', group: 'Study', icon: Library },
  // ── Life ──────────────────────────────────────────────────────────────────
  { path: '/finance', title: 'Financial Pulse', navLabel: 'Finance', group: 'Life', icon: Wallet },
  { path: '/gym', title: 'Gym', navLabel: 'Gym', group: 'Life', icon: Dumbbell },
  { path: '/social', title: 'Contacts', navLabel: 'Social', group: 'Life', icon: Users },
  // ── System ────────────────────────────────────────────────────────────────
  { path: '/system', title: 'System', navLabel: 'System', group: 'System', icon: Cpu },
  { path: '/automations', title: 'Automations', navLabel: 'Automations', group: 'System', icon: Workflow },
  { path: '/settings', title: 'Settings', navLabel: 'Settings', group: 'System', icon: Settings },
]

export interface NavAction {
  id: string
  label: string
  href: string
  group: 'Action'
  icon: LucideIcon
  keywords?: string[]
}

export type NavigationSearchItem =
  | (AppRoute & { kind: 'route'; href: string })
  | (NavAction & { kind: 'action' })

export const NAV_ACTIONS: NavAction[] = [
  {
    id: 'capture',
    label: 'Capture',
    href: '/library?kind=captures',
    group: 'Action',
    icon: Plus,
    keywords: ['screenshot', 'clip', 'library', 'captures'],
  },
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

export function searchNavigation(query: string): NavigationSearchItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const routeMatches = ROUTES.filter((route) =>
    [route.navLabel, route.title, route.path, route.group].some((value) =>
      value.toLowerCase().includes(q)
    )
  ).map((route) => ({ ...route, kind: 'route' as const, href: route.path }))

  const actionMatches = NAV_ACTIONS.filter((action) =>
    [action.label, action.href, action.group, ...(action.keywords ?? [])].some((value) =>
      value.toLowerCase().includes(q)
    )
  ).map((action) => ({ ...action, kind: 'action' as const }))

  return [...routeMatches, ...actionMatches]
}
