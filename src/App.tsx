import { Suspense, lazy, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { RouteErrorBoundary } from '@/components/shared/RouteErrorBoundary'
import { StoreToast } from '@/components/shared/StoreToast'

// Route-level code splitting: each page loads on first visit.
const DailyPage = lazy(() => import('@/features/daily/DailyPage').then((m) => ({ default: m.DailyPage })))
const HabitsSection = lazy(() => import('@/features/habits/HabitsSection').then((m) => ({ default: m.HabitsSection })))
const GoalsPage = lazy(() => import('@/features/goals/GoalsPage').then((m) => ({ default: m.GoalsPage })))
const FounderPage = lazy(() => import('@/features/founder/FounderPage').then((m) => ({ default: m.FounderPage })))
const StudentPage = lazy(() => import('@/features/student/StudentPage').then((m) => ({ default: m.StudentPage })))
const FinancePage = lazy(() => import('@/features/finance/FinancePage').then((m) => ({ default: m.FinancePage })))
const SocialSection = lazy(() => import('@/features/social/SocialSection').then((m) => ({ default: m.SocialSection })))
const BooksPage = lazy(() => import('@/features/books/BooksPage').then((m) => ({ default: m.BooksPage })))
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })))
const OpportunitiesPage = lazy(() => import('@/features/opportunities/OpportunitiesPage').then((m) => ({ default: m.OpportunitiesPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const LibraryPage = lazy(() => import('@/features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })))
const GymPage = lazy(() => import('@/features/gym/GymPage').then((m) => ({ default: m.GymPage })))
const SystemPage = lazy(() => import('@/features/system/SystemPage').then((m) => ({ default: m.SystemPage })))

function page(name: string, node: ReactNode) {
  return (
    <RouteErrorBoundary name={name}>
      <Suspense
        fallback={
          <div className="flex h-full min-h-[50vh] items-center justify-center text-sm text-neutral-500">
            Loading…
          </div>
        }
      >
        {node}
      </Suspense>
    </RouteErrorBoundary>
  )
}

export function App() {
  return (
    <>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route index element={<Navigate to="/daily" replace />} />
          <Route path="daily" element={page('Daily', <DailyPage />)} />
          <Route path="habits" element={page('Habits', <HabitsSection />)} />
          <Route path="goals" element={page('Goals', <GoalsPage />)} />
          <Route path="system" element={page('System', <SystemPage />)} />
          <Route path="founder" element={page('Founder', <FounderPage />)} />
          <Route path="student" element={page('Student', <StudentPage />)} />
          <Route path="projects" element={page('Projects', <ProjectsPage />)} />
          <Route path="finance" element={page('Finance', <FinancePage />)} />
          <Route path="gym" element={page('Gym', <GymPage />)} />
          <Route path="social" element={page('Social', <SocialSection />)} />
          <Route path="opportunities" element={page('Opportunities', <OpportunitiesPage />)} />
          <Route path="books" element={page('Books', <BooksPage />)} />
          <Route path="library" element={page('Library', <LibraryPage />)} />
          <Route path="settings" element={page('Settings', <SettingsPage />)} />
          {/* Reorg redirects — pages that moved into a parent section as tabs */}
          <Route path="stats" element={<Navigate to="/habits" replace />} />
          <Route path="automations" element={<Navigate to="/system" replace />} />
          <Route path="crm" element={<Navigate to="/social" replace />} />
          <Route path="courses" element={<Navigate to="/library" replace />} />
          <Route path="captures" element={<Navigate to="/library" replace />} />
          <Route path="thoughts" element={<Navigate to="/library" replace />} />
        </Route>
      </Routes>
      <StoreToast />
    </>
  )
}
