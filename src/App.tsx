import { Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DailyPage } from '@/features/daily/DailyPage'
import { HabitsSection } from '@/features/habits/HabitsSection'
import { GoalsPage } from '@/features/goals/GoalsPage'
import { FounderPage } from '@/features/founder/FounderPage'
import { StudentPage } from '@/features/student/StudentPage'
import { FinancePage } from '@/features/finance/FinancePage'
import { SocialSection } from '@/features/social/SocialSection'
import { BooksPage } from '@/features/books/BooksPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { OpportunitiesPage } from '@/features/opportunities/OpportunitiesPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { GymPage } from '@/features/gym/GymPage'
import { SystemPage } from '@/features/system/SystemPage'

export function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Navigate to="/daily" replace />} />
        <Route path="daily" element={<DailyPage />} />
        <Route path="habits" element={<HabitsSection />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="system" element={<SystemPage />} />
        <Route path="founder" element={<FounderPage />} />
        <Route path="student" element={<StudentPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="gym" element={<GymPage />} />
        <Route path="social" element={<SocialSection />} />
        <Route path="opportunities" element={<OpportunitiesPage />} />
        <Route path="books" element={<BooksPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* Reorg redirects — pages that moved into a parent section as tabs */}
        <Route path="stats" element={<Navigate to="/habits" replace />} />
        <Route path="automations" element={<Navigate to="/system" replace />} />
        <Route path="crm" element={<Navigate to="/social" replace />} />
        <Route path="courses" element={<Navigate to="/library" replace />} />
        <Route path="captures" element={<Navigate to="/library" replace />} />
        <Route path="thoughts" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  )
}
