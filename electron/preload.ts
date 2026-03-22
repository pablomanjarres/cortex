import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  calendar: {
    getTodayEvents: () => ipcRenderer.invoke('calendar:getTodayEvents'),
  },

  tray: {
    updateStats: (stats: { tasks: string; habits: string; score: string }) =>
      ipcRenderer.send('tray:updateStats', stats),
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

  data: {
    read: (key: string) => ipcRenderer.invoke('data:read', key),
    write: (key: string, data: unknown) => ipcRenderer.invoke('data:write', key, data),
    listKeys: () => ipcRenderer.invoke('data:listKeys'),
    exportAll: () => ipcRenderer.invoke('data:exportAll'),
    importAll: (json: string) => ipcRenderer.invoke('data:importAll', json),
    getPath: () => ipcRenderer.invoke('data:getPath'),
  },

  onNavigate: (callback: (route: string) => void) => {
    ipcRenderer.on('navigate', (_event, route) => callback(route))
  },
})
