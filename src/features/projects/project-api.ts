import type { ProjectInfo } from '@/types/electron'

/** Scan through the desktop bridge or the same endpoint used by web clients. */
export async function scanProjects(): Promise<ProjectInfo[]> {
  if (window.electronAPI?.projects) return window.electronAPI.projects.scan()
  const response = await fetch('/api/projects/scan', { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Project scan failed (${response.status})`)
  return response.json()
}
