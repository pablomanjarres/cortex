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
  onNavigate: (callback: (route: string) => void) => {
    ipcRenderer.on('navigate', (_event, route) => callback(route))
  },
})
