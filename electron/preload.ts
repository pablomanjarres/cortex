import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  calendar: {
    getTodayEvents: () => ipcRenderer.invoke('calendar:getTodayEvents'),
  },
})
