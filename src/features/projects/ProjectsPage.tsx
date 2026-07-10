import { useState, useEffect, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { useStore } from '@/lib/store'
import {
  RefreshCw,
  Search,
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
} from 'lucide-react'

type ProjectType = 'app' | 'monorepo' | 'library' | 'skill' | 'assets' | 'unknown'

interface ProjectInfo {
  name: string
  path: string
  description: string | null
  type: ProjectType
  hasPackageJson: boolean
  hasClaude: boolean
  gitRemote: string | null
  latestCommit: { message: string; date: string } | null
  workflows: { name: string; scheduled: boolean; cron?: string }[]
  techStack: string[]
  scripts: string[]
  connections: string[]
}

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

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [meta] = useStore<Record<string, ProjectMeta>>('cortex-project-meta', {})
  const [cachedProjects] = useStore<{ data: ProjectInfo[]; lastUpdated: string } | null>('cortex-cache-projects', null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ProjectType | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const isElectron = !!window.electronAPI?.projects

  const fetchProjects = async () => {
    setLoading(true)
    try {
      if (window.electronAPI?.projects) {
        setProjects(await window.electronAPI.projects.scan())
      } else {
        const res = await fetch('/api/projects/scan')
        if (res.ok) setProjects(await res.json())
      }
    } catch (e) {
      console.error('Failed to scan projects:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProjects() }, [])

  useEffect(() => {
    if (isElectron || !cachedProjects?.data) return
    setProjects(cachedProjects.data)
  }, [cachedProjects])

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
        const pa = meta[a.name]?.priority ?? 99
        const pb = meta[b.name]?.priority ?? 99
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
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 font-mono text-2xs tabular-nums">
          <p className="text-muted-foreground">{projects.length} projects{!isElectron && cachedProjects?.lastUpdated ? ` · cached ${timeAgo(cachedProjects.lastUpdated)}` : ''}</p>
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
            message="No cached data yet."
            hint="Open the desktop app to scan your Projects directory."
          />
        </WidgetCard>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-faint" />
              <Input
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
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
                <div key={project.name} className="surface rounded-xl transition-colors hover:bg-secondary/20">
                  {/* Card header */}
                  <button
                    onClick={() => toggleExpand(project.name)}
                    className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left"
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
                      {ghUrl && (
                        <a href={ghUrl} onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer"
                          aria-label={`Open ${m?.displayName || project.name} on GitHub`}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-foreground-faint transition-colors hover:bg-muted/60 hover:text-foreground">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-foreground-faint" /> : <ChevronRight className="h-4 w-4 text-foreground-faint" />}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="ml-8 space-y-3 border-t border-border/60 px-4 pb-4 pt-3">
                      {/* Why it exists */}
                      {m?.why && (
                        <div className="rounded-md bg-secondary/30 px-3 py-2.5">
                          <p className="mb-1 flex items-center gap-1 font-mono text-2xs uppercase tracking-wider text-foreground-faint">
                            <AlertTriangle className="h-3 w-3" /> Why this exists
                          </p>
                          <p className="text-xs text-foreground">{m.why}</p>
                        </div>
                      )}

                      {/* Operational notes */}
                      {m?.notes && (
                        <div className="rounded-md bg-secondary/30 px-3 py-2.5">
                          <p className="mb-1 flex items-center gap-1 font-mono text-2xs uppercase tracking-wider text-foreground-faint">
                            <Info className="h-3 w-3" /> Notes
                          </p>
                          <p className="text-xs text-muted-foreground">{m.notes}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="mb-0.5 font-mono text-2xs uppercase tracking-wider text-foreground-faint">Path</p>
                          <p className="truncate font-mono text-2xs text-muted-foreground">{project.path}</p>
                        </div>
                        {project.gitRemote && (
                          <div>
                            <p className="mb-0.5 font-mono text-2xs uppercase tracking-wider text-foreground-faint">Remote</p>
                            <p className="truncate font-mono text-2xs text-muted-foreground">{project.gitRemote}</p>
                          </div>
                        )}
                        {project.scripts.length > 0 && (
                          <div className="col-span-2">
                            <p className="mb-1 font-mono text-2xs uppercase tracking-wider text-foreground-faint">
                              <FileCode className="-mt-px mr-0.5 inline h-3 w-3" />Scripts ({project.scripts.length})
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {project.scripts.map((s) => (
                                <Chip key={s} size="sm">{s}</Chip>
                              ))}
                            </div>
                          </div>
                        )}
                        {project.workflows.length > 0 && (
                          <div className="col-span-2">
                            <p className="mb-1 font-mono text-2xs uppercase tracking-wider text-foreground-faint">
                              <Clock className="-mt-px mr-0.5 inline h-3 w-3" />Workflows
                            </p>
                            {project.workflows.map((wf) => (
                              <div key={wf.name} className="flex items-center gap-2 py-0.5">
                                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${wf.scheduled ? 'bg-warning' : 'bg-muted-foreground/30'}`} />
                                <span className="text-muted-foreground">{wf.name}</span>
                                {wf.cron && <span className="font-mono text-3xs text-warning">{wf.cron}</span>}
                              </div>
                            ))}
                          </div>
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
