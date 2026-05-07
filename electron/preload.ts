import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  calendar: {
    getTodayEvents: () => ipcRenderer.invoke('calendar:getTodayEvents'),
    syncBirthdays: (birthdays: { name: string; birthday: string }[]) => ipcRenderer.invoke('calendar:syncBirthdays', birthdays),
    createEvent: (payload: { title: string; startDate: string; endDate?: string; isAllDay: boolean; calendar?: string; notes?: string; recurrence?: string }) => ipcRenderer.invoke('calendar:createEvent', payload),
    updateEvent: (eventId: string, payload: Record<string, unknown>) => ipcRenderer.invoke('calendar:updateEvent', eventId, payload),
    deleteEvent: (eventId: string) => ipcRenderer.invoke('calendar:deleteEvent', eventId),
    getEventsInRange: (start: string, end: string) => ipcRenderer.invoke('calendar:getEventsInRange', start, end),
    getEvent: (eventId: string) => ipcRenderer.invoke('calendar:getEvent', eventId),
  },

  tray: {
    updateStats: (stats: { tasks: string; habits: string; score: string }) =>
      ipcRenderer.send('tray:updateStats', stats),
    sprintSync: (data: { active: boolean; endTimeMs?: number; task?: string }) =>
      ipcRenderer.send('sprint:sync', data),
  },

  onSprintAction: (callback: (action: string, data?: { duration?: number }) => void) => {
    ipcRenderer.on('sprint:action', (_event, action, data) => callback(action, data))
  },

  keychain: {
    save: (service: string, value: string) => ipcRenderer.invoke('keychain:save', service, value),
    get: (service: string) => ipcRenderer.invoke('keychain:get', service),
    delete: (service: string) => ipcRenderer.invoke('keychain:delete', service),
    has: (service: string) => ipcRenderer.invoke('keychain:has', service),
    list: () => ipcRenderer.invoke('keychain:list'),
  },

  integrations: {
    github: () => ipcRenderer.invoke('github:getStats'),
    lemon: () => ipcRenderer.invoke('lemon:getStats'),
    vercel: () => ipcRenderer.invoke('vercel:getStats'),
    supabase: () => ipcRenderer.invoke('supabase:getStats'),
  },

  projects: {
    scan: () => ipcRenderer.invoke('projects:scan'),
  },

  media: {
    save: (id: string, base64: string) => ipcRenderer.invoke('media:save', id, base64),
    load: (id: string) => ipcRenderer.invoke('media:load', id),
    delete: (id: string) => ipcRenderer.invoke('media:delete', id),
  },

  notify: {
    pushover: (category: string, message: string) => ipcRenderer.invoke('notify:pushover', category, message),
  },

  data: {
    read: (key: string) => ipcRenderer.invoke('data:read', key),
    write: (key: string, data: unknown) => ipcRenderer.invoke('data:write', key, data),
    listKeys: () => ipcRenderer.invoke('data:listKeys'),
    exportAll: () => ipcRenderer.invoke('data:exportAll'),
    importAll: (json: string) => ipcRenderer.invoke('data:importAll', json),
    getPath: () => ipcRenderer.invoke('data:getPath'),
    getStats: () => ipcRenderer.invoke('data:getStats'),
  },

  onNavigate: (callback: (route: string) => void) => {
    ipcRenderer.on('navigate', (_event, route) => callback(route))
  },
})
