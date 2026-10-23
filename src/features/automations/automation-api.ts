import { parseRunLog, parseScheduledTasks, type AutomationRun, type ScheduledTask } from './automation-runs'

/** Run log from the local API, falling back to the desktop data store. */
export async function loadRunLog(): Promise<AutomationRun[]> {
  try {
    const res = await fetch('/api/data?key=cortex-automations', { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const data: unknown = await res.json()
      if (data) return parseRunLog(data)
    }
  } catch { /* try IPC */ }
  try {
    if (window.electronAPI?.data) return parseRunLog(await window.electronAPI.data.read('cortex-automations'))
  } catch { /* no source available */ }
  return []
}

/** Claude scheduled-tasks discovered live from ~/.claude/scheduled-tasks/. */
export async function loadScheduledTasks(): Promise<ScheduledTask[]> {
  try {
    const res = await fetch('/api/automation/scheduled-tasks', { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const list: unknown = await res.json()
      if (list) return parseScheduledTasks(list)
    }
  } catch { /* try IPC */ }
  try {
    if (window.electronAPI?.automation) return parseScheduledTasks(await window.electronAPI.automation.scheduledTasks())
  } catch { /* no source available */ }
  return []
}
