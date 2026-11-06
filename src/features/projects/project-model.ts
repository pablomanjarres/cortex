import { projectPriorityRank } from '../../../electron/project-priority'
import { Bot, FolderKanban, Image, Layers, Monitor, Package, type LucideIcon } from 'lucide-react'
import type { ProjectInfo } from '@/types/electron'

export type ProjectType = ProjectInfo['type']

/** Hand-written context for a scanned project, stored under `cortex-project-meta` by name. */
export interface ProjectMeta {
  displayName: string
  tagline: string
  description: string
  status: 'active' | 'archived' | 'wip'
  runsOnLogin: boolean
  alwaysActive: boolean
  why: string
  notes: string
  priority: number
}

// Project TYPE is a category — neutral Chips, never per-type hues.
export const typeConfig: Record<ProjectType, { label: string; icon: LucideIcon }> = {
  app: { label: 'App', icon: Monitor },
  monorepo: { label: 'Monorepo', icon: Layers },
  library: { label: 'Library', icon: Package },
  skill: { label: 'Skill', icon: Bot },
  assets: { label: 'Assets', icon: Image },
  unknown: { label: 'Other', icon: FolderKanban },
}
/** Types offered as filters, in display order. */
export const FILTER_TYPES: ProjectType[] = ['app', 'monorepo', 'library', 'skill', 'assets']

// Project STATUS is a status — semantic Chip variants.
export const statusConfig: Record<ProjectMeta['status'], { label: string; chip: 'success' | 'warning' | 'neutral' }> = {
  active: { label: 'Active', chip: 'success' },
  archived: { label: 'Archived', chip: 'neutral' },
  wip: { label: 'WIP', chip: 'warning' },
}

export const projectTitle = (project: ProjectInfo, meta?: ProjectMeta) => meta?.displayName || project.name

export function getGitHubUrl(remote: string): string | null {
  const sshMatch = remote.match(/git@github\.com:(.+?)(?:\.git)?$/)
  if (sshMatch) return `https://github.com/${sshMatch[1]}`
  const httpsMatch = remote.match(/https:\/\/github\.com\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return `https://github.com/${httpsMatch[1]}`
  return null
}

export function daysAgo(dateStr: string, now = Date.now()): string {
  const diff = Math.floor((now - new Date(dateStr).getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 30) return `${diff}d ago`
  return `${Math.floor(diff / 30)}mo ago`
}

/** Projects ordered by their meta priority (unranked last), narrowed by type, status and text. */
export function filterProjects(projects: ProjectInfo[], meta: Record<string, ProjectMeta>, filters: {
  type: ProjectType | null
  status: string | null
  search: string
}): ProjectInfo[] {
  const query = filters.search.toLowerCase()
  return projects
    .filter((p) => {
      const m = meta[p.name]
      if (filters.type && p.type !== filters.type) return false
      if (filters.status && m?.status !== filters.status) return false
      if (query) {
        const searchable = `${p.name} ${p.description || ''} ${m?.displayName || ''} ${m?.tagline || ''} ${m?.description || ''} ${m?.why || ''}`.toLowerCase()
        if (!searchable.includes(query)) return false
      }
      return true
    })
    .sort((a, b) => projectPriorityRank(meta[a.name]?.priority) - projectPriorityRank(meta[b.name]?.priority))
}
