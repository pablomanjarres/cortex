import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { MobileBottomNav, Sidebar, MobileSidebar } from './Sidebar'
import { Header } from './Header'
import { useCalendarSync } from '@/lib/use-calendar-sync'
import { SprintProvider } from '@/lib/sprint-context'
import { seedStudentDefaults } from '@/features/student/student-defaults'

export function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  useCalendarSync()
  // Seed never-written student store keys so out-of-renderer consumers (MCP
  // server, Materials/Notes tabs) see the same courses the Student page shows.
  useEffect(() => { void seedStudentDefaults() }, [])

  return (
    <SprintProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <MobileSidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <MobileBottomNav />
        <div className="ml-0 flex min-w-0 flex-1 flex-col md:ml-[244px]">
          <Header onMenuToggle={() => setMobileNavOpen((p) => !p)} />
          <main className="flex-1 overflow-x-hidden p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SprintProvider>
  )
}
