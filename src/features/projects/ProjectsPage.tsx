import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchInput } from '@/components/shared/SearchInput'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { useStore } from '@/lib/store'
import { WorkHoursPanel } from './WorkHoursPanel'
import { KnowledgeLink } from '@/components/shared/KnowledgeLink'
import { recordRefs } from '@/lib/knowledge'
import { useUrlParam } from '@/lib/use-url-param'
import { projectRefId } from '../../../electron/knowledge/refs'
import { projectPriorityRank } from '../../../electron/project-priority'
import { scanProjects } from './project-api'
import type { ProjectInfo } from '@/types/electron'
import {
  RefreshCw,
  GitBranch,
  ExternalLink,
  Clock,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Bot,
  Package,
  Image,
  Monitor,
  Layers,
  FileCode,
  Workflow,
  Plug,
  Power,
  AlertTriangle,
  Star,
  Archive,
  Info,
  Zap,
  type LucideIcon,
} from 'lucide-react'

type ProjectType = ProjectInfo['type']

const EMPTY_PROJECTS: ProjectInfo[] = []

interface ProjectMeta {
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
const typeConfig: Record<ProjectType, { label: string; icon: typeof Monitor }> = {
  app: { label: 'App', icon: Monitor },
  monorepo: { label: 'Monorepo', icon: Layers },
  library: { label: 'Library', icon: Package },
  skill: { label: 'Skill', icon: Bot },
  assets: { label: 'Assets', icon: Image },
  unknown: { label: 'Other', icon: FolderKanban },
}

// Project STATUS is a status — semantic Chip variants.
const statusConfig: Record<ProjectMeta['status'], { label: string; chip: 'success' | 'warning' | 'neutral' }> = {
  active: { label: 'Active', chip: 'success' },
  archived: { label: 'Archived', chip: 'neutral' },
  wip: { label: 'WIP', chip: 'warning' },
}

function getGitHubUrl(remote: string): string | null {
  const sshMatch = remote.match(/git@github\.com:(.+?)(?:\.git)?$/)
  if (sshMatch) return `https://github.com/${sshMatch[1]}`
  const httpsMatch = remote.match(/https:\/\/github\.com\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return `https://github.com/${httpsMatch[1]}`
  return null
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function daysAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 30) return `${diff}d ago`
  return `${Math.floor(diff / 30)}mo ago`
}

const detailTitleClassName = 'flex items-center gap-1 font-mono text-2xs uppercase tracking-wider text-foreground-faint'

/** A titled, tinted callout for the project's written context. */
function DetailNote({ icon: Icon, title, className, children }: { icon: LucideIcon; title: string; className?: string; children: ReactNode }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2.5">
      <p className={`mb-1 ${detailTitleClassName}`}><Icon className="h-3 w-3" /> {title}</p>
      <p className={`text-xs ${className ?? 'text-muted-foreground'}`}>{children}</p>
    </div>
  )
}

/** A labelled fact in the expanded project grid. */
function DetailField({ icon: Icon, title, className, children }: { icon?: LucideIcon; title: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <p className={`${Icon ? 'mb-1' : 'mb-0.5'} ${detailTitleClassName}`}>{Icon && <Icon className="h-3 w-3" />}{title}</p>
      {children}
    </div>
  )
}

export function ProjectsPage() {
  const [scannedProjects, setProjects] = useState<ProjectInfo[] | null>(null)
  const [meta] = useStore<Record<string, ProjectMeta>>('cortex-project-meta', {})
  const [cachedProjects] = useStore<{ data: ProjectInfo[]; lastUpdated: string } | null>('cortex-cache-projects', null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ProjectType | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const isElectron = !!window.electronAPI?.projects

  const fetchProjects = async () => {
    setLoading(true)
    try {
      setProjects(await scanProjects())
    } catch (e) {
      console.error('Failed to scan projects:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void scanProjects()
      .then((result) => { if (active) setProjects(result) })
      .catch((error) => { if (active) console.error('Failed to scan projects:', error) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const projects = scannedProjects ?? (!isElectron && cachedProjects ? cachedProjects.data : EMPTY_PROJECTS)

  // `?project=<ref id>` (see projectRefId) expands that project and scrolls to it.
  const [linkedProject] = useUrlParam('project', '')
  const linkedMatch = linkedProject ? projects.find((p) => projectRefId(p.name) === linkedProject) : undefined
  const [openedProject, setOpenedProject] = useState<string | null>(null)
  if (linkedMatch && linkedProject !== openedProject) { setOpenedProject(linkedProject); setExpanded((prev) => new Set(prev).add(linkedMatch.name)) }
  useEffect(() => {
    if (openedProject) requestAnimationFrame(() => document.getElementById(`project-${openedProject}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [openedProject])

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const filtered = useMemo(() => {
    const lowerSearch = search.toLowerCase()
    return projects
      .filter((p) => {
        const m = meta[p.name]
        if (typeFilter && p.type !== typeFilter) return false
        if (statusFilter && m?.status !== statusFilter) return false
        if (search) {
          const searchable = `${p.name} ${p.description || ''} ${m?.displayName || ''} ${m?.tagline || ''} ${m?.description || ''} ${m?.why || ''}`.toLowerCase()
          if (!searchable.includes(lowerSearch)) return false
        }
        return true
      })
      .sort((a, b) => {
        const pa = projectPriorityRank(meta[a.name]?.priority)
        const pb = projectPriorityRank(meta[b.name]?.priority)
        return pa - pb
      })
  }, [projects, meta, typeFilter, statusFilter, search])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of projects) counts[p.type] = (counts[p.type] || 0) + 1
    return counts
  }, [projects])

  const activeCount = projects.filter((p) => meta[p.name]?.status === 'active').length
  const loginCount = projects.filter((p) => meta[p.name]?.runsOnLogin).length
  const alwaysOnCount = projects.filter((p) => meta[p.name]?.alwaysActive).length

  return (
    <PageShell>
      <WorkHoursPanel />
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 font-mono text-2xs tabular-nums">
          <p className="text-muted-foreground">{projects.length} projects{scannedProjects === null && !isElectron && cachedProjects?.lastUpdated ? ` · cached ${timeAgo(cachedProjects.lastUpdated)}` : ''}</p>
          {activeCount > 0 && <p className="text-success">{activeCount} active</p>}
          {loginCount > 0 && <p className="text-muted-foreground"><Power className="-mt-px mr-0.5 inline h-3 w-3" />{loginCount} on login</p>}
          {alwaysOnCount > 0 && <p className="text-muted-foreground"><Zap className="-mt-px mr-0.5 inline h-3 w-3" />{alwaysOnCount} always on</p>}
        </div>
        <Button variant="secondary" size="sm" onClick={fetchProjects} disabled={loading || !isElectron}>
          <RefreshCw /> Scan
        </Button>
      </div>

      {!isElectron && projects.length === 0 ? (
        <WidgetCard title="Projects" delay={0}>
          <EmptyState
            message={scannedProjects === null ? 'No cached data yet.' : 'No projects found.'}
            hint={scannedProjects === null ? 'Open the desktop app to scan your Projects directory.' : undefined}
          />
        </WidgetCard>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              label="Search projects"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              containerClassName="max-w-xs flex-1"
              className="h-8 text-xs"
            />
            <div className="flex flex-wrap gap-1.5">
              {(['app', 'monorepo', 'library', 'skill', 'assets'] as ProjectType[]).map((t) => {
                const cfg = typeConfig[t]
                const count = typeCounts[t] || 0
                if (count === 0) return null
                return (
                  <Chip key={t} selectable size="sm" selected={typeFilter === t}
                    onClick={() => setTypeFilter(typeFilter === t ? null : t)}>
                    {cfg.label} ({count})
                  </Chip>
                )
              })}
              <Chip selectable size="sm" selected={statusFilter === 'archived'}
                onClick={() => setStatusFilter(statusFilter === 'archived' ? null : 'archived')}>
                <Archive /> Archived
              </Chip>
            </div>
          </div>

          {/* Project cards */}
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            {filtered.map((project) => {
              const cfg = typeConfig[project.type]
              const TypeIcon = cfg.icon
              const isExpanded = expanded.has(project.name)
              const ghUrl = project.gitRemote ? getGitHubUrl(project.gitRemote) : null
              const m = meta[project.name]
              const stCfg = m ? statusConfig[m.status] : null

              return (
                <div key={project.name} id={`project-${projectRefId(project.name)}`} className="surface rounded-xl transition-colors hover:bg-secondary/20">
                  {/* Card header */}
                  <div className="relative">
                    {ghUrl && (
                      <a href={ghUrl} target="_blank" rel="noopener noreferrer"
                        aria-label={`Open ${m?.displayName || project.name} on GitHub`}
                        className="absolute right-10 top-3 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground">
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Details for ${m?.displayName || project.name}`}
                    aria-expanded={isExpanded}
                    aria-controls={isExpanded ? `project-details-${projectRefId(project.name)}` : undefined}
                    onClick={() => toggleExpand(project.name)}
                    className="h-auto w-full items-start justify-start gap-3 whitespace-normal px-4 py-3 text-left text-foreground"
                  >
                    <TypeIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold">{m?.displayName || project.name}</span>
                        <Chip size="sm">{cfg.label}</Chip>
                        {stCfg && <Chip size="sm" variant={stCfg.chip}>{stCfg.label}</Chip>}
                        {m?.runsOnLogin && <Chip size="sm"><Power /> Login</Chip>}
                        {m?.alwaysActive && <Chip size="sm"><Zap /> Always on</Chip>}
                        {project.hasClaude && <Chip size="sm">claude</Chip>}
                        {m?.priority === 1 && <Star className="h-3 w-3 shrink-0 text-accent" aria-label="Top priority" />}
                      </div>

                      {/* Tagline */}
                      {m?.tagline && (
                        <p className="mt-0.5 text-xs font-medium text-muted-foreground">{m.tagline}</p>
                      )}

                      {/* Description */}
                      <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">
                        {m?.description || project.description || 'No description'}
                      </p>

                      {/* Tech + connections */}
                      {(project.techStack.length > 0 || project.connections.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {project.techStack.map((t) => (
                            <Chip key={t} size="sm">{t}</Chip>
                          ))}
                          {project.connections.map((c) => (
                            <Chip key={c} size="sm"><Plug /> {c}</Chip>
                          ))}
                        </div>
                      )}

                      {/* Workflows */}
                      {project.workflows.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {project.workflows.map((wf) => (
                            <Chip key={wf.name} size="sm" variant={wf.scheduled ? 'warning' : 'neutral'}>
                              <Workflow /> {wf.name}
                              {wf.cron && <span className="ml-1 opacity-60">{wf.cron}</span>}
                            </Chip>
                          ))}
                        </div>
                      )}

                      {/* Latest commit */}
                      {project.latestCommit && (
                        <div className="mt-2 flex items-center gap-1.5 text-2xs text-foreground-faint">
                          <GitBranch className="h-3 w-3 shrink-0" />
                          <span className="truncate">{project.latestCommit.message}</span>
                          <span className="shrink-0 font-mono">· {daysAgo(project.latestCommit.date)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-foreground-faint" /> : <ChevronRight className="h-4 w-4 text-foreground-faint" />}
                    </div>
                  </Button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div id={`project-details-${projectRefId(project.name)}`} className="ml-8 space-y-3 border-t border-border/60 px-4 pb-4 pt-3">
                      <KnowledgeLink cortexRef={recordRefs.project(project.name)} />
                      {/* Why it exists */}
                      {m?.why && <DetailNote icon={AlertTriangle} title="Why this exists" className="text-foreground">{m.why}</DetailNote>}

                      {/* Operational notes */}
                      {m?.notes && <DetailNote icon={Info} title="Notes">{m.notes}</DetailNote>}

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <DetailField title="Path">
                          <p className="truncate font-mono text-2xs text-muted-foreground">{project.path}</p>
                        </DetailField>
                        {project.gitRemote && (
                          <DetailField title="Remote">
                            <p className="truncate font-mono text-2xs text-muted-foreground">{project.gitRemote}</p>
                          </DetailField>
                        )}
                        {project.scripts.length > 0 && (
                          <DetailField icon={FileCode} title={`Scripts (${project.scripts.length})`} className="col-span-2">
                            <div className="flex flex-wrap gap-1">
                              {project.scripts.map((s) => (
                                <Chip key={s} size="sm">{s}</Chip>
                              ))}
                            </div>
                          </DetailField>
                        )}
                        {project.workflows.length > 0 && (
                          <DetailField icon={Clock} title="Workflows" className="col-span-2">
                            {project.workflows.map((wf) => (
                              <div key={wf.name} className="flex items-center gap-2 py-0.5">
                                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${wf.scheduled ? 'bg-warning' : 'bg-muted-foreground/30'}`} />
                                <span className="text-muted-foreground">{wf.name}</span>
                                {wf.cron && <span className="font-mono text-3xs text-warning">{wf.cron}</span>}
                              </div>
                            ))}
                          </DetailField>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {filtered.length === 0 && projects.length > 0 && (
            <EmptyState message="No projects match your filters." />
          )}
        </>
      )}
    </PageShell>
  )
}
