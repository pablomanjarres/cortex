interface CalendarEvent {
  title: string
  startTime: string
  endTime: string
  startISO: string
  endISO: string
  calendar: string
  isAllDay: boolean
}

interface ElectronAPI {
  platform: string
  calendar: {
    getTodayEvents: () => Promise<CalendarEvent[]>
  }
  tray: {
    updateStats: (stats: { tasks: string; habits: string; score: string }) => void
  }
  onNavigate: (callback: (route: string) => void) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
