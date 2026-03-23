import { Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DailyPage } from '@/features/daily/DailyPage'
import { HabitsPage } from '@/features/habits/HabitsPage'
import { FounderPage } from '@/features/founder/FounderPage'
import { StudentPage } from '@/features/student/StudentPage'
import { FinancePage } from '@/features/finance/FinancePage'
import { SocialPage } from '@/features/social/SocialPage'
import { BooksPage } from '@/features/books/BooksPage'
import { ThoughtsPage } from '@/features/thoughts/ThoughtsPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { CrmPage } from '@/features/crm/CrmPage'
import { AutomationsPage } from '@/features/automations/AutomationsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

export function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Navigate to="/daily" replace />} />
        <Route path="daily" element={<DailyPage />} />
        <Route path="habits" element={<HabitsPage />} />
        <Route path="automations" element={<AutomationsPage />} />
        <Route path="founder" element={<FounderPage />} />
        <Route path="student" element={<StudentPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="social" element={<SocialPage />} />
        <Route path="crm" element={<CrmPage />} />
        <Route path="books" element={<BooksPage />} />
        <Route path="thoughts" element={<ThoughtsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
