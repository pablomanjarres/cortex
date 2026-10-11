import type { ResearchAction, ResearchView } from '../../../electron/founder-research-model'

interface ResearchApi {
  read(): Promise<ResearchView>
  action(action: ResearchAction): Promise<ResearchView>
}

async function request(path: string, action?: ResearchAction): Promise<ResearchView> {
  const response = await fetch(`/api/founder-research${path}`, {
    method: action ? 'POST' : 'GET',
    headers: action ? { 'Content-Type': 'application/json' } : undefined,
    body: action ? JSON.stringify(action) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? 'Research data is unavailable')
  if (value.schemaVersion !== 1 || !Array.isArray(value.events)) throw new Error('Research data is unavailable')
  return value as ResearchView
}

export function researchApi(): ResearchApi {
  const electron = (window.electronAPI as unknown as { founderResearch?: ResearchApi } | undefined)?.founderResearch
  return electron ?? { read: () => request(''), action: action => request('/action', action) }
}

export function researchExportUrl(file: string): string {
  const origin = window.electronAPI ? 'http://127.0.0.1:3456' : ''
  return `${origin}/api/founder-research/export?file=${encodeURIComponent(file)}`
}
