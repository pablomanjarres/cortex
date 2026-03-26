import type { GitHubStats, LemonStats, VercelStats, SupabaseStats } from './metrics'

interface ProjectInfo {
  name: string
  path: string
  description: string | null
  type: 'app' | 'monorepo' | 'library' | 'skill' | 'assets' | 'unknown'
  hasPackageJson: boolean
  hasClaude: boolean
  gitRemote: string | null
  latestCommit: { message: string; date: string } | null
  workflows: { name: string; scheduled: boolean; cron?: string }[]
  techStack: string[]
  scripts: string[]
  connections: string[]
}

interface CalendarEvent {
  id?: string
  title: string
  startTime: string
  endTime: string
  startISO?: string
  endISO?: string
  calendar: string
  isAllDay: boolean
}

interface CalendarEventFull {
  id: string
  title: string
  startDate: string
  endDate: string
  calendar: string
  isAllDay: boolean
  notes: string
  lastModified: string
  recurrence: string
}

interface CreateEventPayload {
  title: string
  startDate: string
  endDate?: string
  isAllDay: boolean
  calendar?: string
  notes?: string
  recurrence?: string
}

interface ElectronAPI {
  platform: string
  calendar: {
    getTodayEvents: () => Promise<CalendarEvent[]>
    syncBirthdays: (birthdays: { name: string; birthday: string }[]) => Promise<{ created: number; skipped: number }>
    createEvent: (payload: CreateEventPayload) => Promise<{ id: string; success: boolean }>
    updateEvent: (eventId: string, payload: Partial<CreateEventPayload>) => Promise<{ success: boolean }>
    deleteEvent: (eventId: string) => Promise<{ success: boolean }>
    getEventsInRange: (start: string, end: string) => Promise<CalendarEventFull[]>
    getEvent: (eventId: string) => Promise<CalendarEventFull | null>
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
    getStats: () => Promise<{ key: string; size: number }[]>
  }
  projects: {
    scan: () => Promise<ProjectInfo[]>
  }
  onNavigate: (callback: (route: string) => void) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
