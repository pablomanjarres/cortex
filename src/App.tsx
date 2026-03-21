import { Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DailyPage } from '@/features/daily/DailyPage'
import { HabitsPage } from '@/features/habits/HabitsPage'
import { FounderPage } from '@/features/founder/FounderPage'
import { StudentPage } from '@/features/student/StudentPage'
import { HealthPage } from '@/features/health/HealthPage'
import { FocusPage } from '@/features/focus/FocusPage'
import { FinancePage } from '@/features/finance/FinancePage'
import { JournalPage } from '@/features/journal/JournalPage'
import { SocialPage } from '@/features/social/SocialPage'
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage'
import { AdminPage } from '@/features/admin/AdminPage'
import { ContentPage } from '@/features/content/ContentPage'

export function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Navigate to="/daily" replace />} />
        <Route path="daily" element={<DailyPage />} />
        <Route path="habits" element={<HabitsPage />} />
        <Route path="founder" element={<FounderPage />} />
        <Route path="student" element={<StudentPage />} />
        <Route path="health" element={<HealthPage />} />
        <Route path="focus" element={<FocusPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="social" element={<SocialPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="content" element={<ContentPage />} />
      </Route>
    </Routes>
  )
}
