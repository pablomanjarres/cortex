import type { GitHubStats, LemonStats, VercelStats, SupabaseStats } from './metrics'

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
  keychain: {
    save: (service: string, value: string) => Promise<boolean>
    get: (service: string) => Promise<string | null>
    delete: (service: string) => Promise<boolean>
    has: (service: string) => Promise<boolean>
    list: () => Promise<string[]>
  }
  integrations: {
    github: () => Promise<GitHubStats | null>
    lemon: () => Promise<LemonStats | null>
    vercel: () => Promise<VercelStats | null>
    supabase: () => Promise<SupabaseStats | null>
  }
  onNavigate: (callback: (route: string) => void) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
