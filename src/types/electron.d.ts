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
    github: () => Promise<(GitHubStats & { error?: undefined }) | { error: string } | null>
    lemon: () => Promise<(LemonStats & { error?: undefined }) | { error: string } | null>
    vercel: () => Promise<(VercelStats & { error?: undefined }) | { error: string } | null>
    supabase: () => Promise<(SupabaseStats & { error?: undefined }) | { error: string } | null>
  }
  data: {
    read: (key: string) => Promise<unknown | null>
    write: (key: string, data: unknown) => Promise<boolean>
    listKeys: () => Promise<string[]>
    exportAll: () => Promise<string | null>
    importAll: (json: string) => Promise<{ success: boolean; count?: number; error?: string }>
    getPath: () => Promise<string>
  }
  onNavigate: (callback: (route: string) => void) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
