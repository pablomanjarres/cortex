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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
