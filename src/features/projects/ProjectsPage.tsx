import { useState, useEffect, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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

const typeConfig: Record<ProjectType, { label: string; color: string; icon: typeof Monitor }> = {
  app: { label: 'App', color: 'bg-blue-500/15 text-blue-400', icon: Monitor },
  monorepo: { label: 'Monorepo', color: 'bg-purple-500/15 text-purple-400', icon: Layers },
  library: { label: 'Library', color: 'bg-yellow-500/15 text-yellow-400', icon: Package },
  skill: { label: 'Skill', color: 'bg-green-500/15 text-green-400', icon: Bot },
  assets: { label: 'Assets', color: 'bg-orange-500/15 text-orange-400', icon: Image },
  unknown: { label: 'Other', color: 'bg-secondary text-muted-foreground', icon: FolderKanban },
}

const statusConfig = {
  active: { label: 'Active', color: 'bg-green-500/15 text-green-400' },
  archived: { label: 'Archived', color: 'bg-muted text-muted-foreground' },
  wip: { label: 'WIP', color: 'bg-yellow-500/15 text-yellow-400' },
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
    if (!window.electronAPI?.projects) return
    setLoading(true)
    try {
      const data = await window.electronAPI.projects.scan()
      setProjects(data)
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
        <div className="flex items-center gap-4">
          <p className="text-xs text-muted-foreground">{projects.length} projects{!isElectron && cachedProjects?.lastUpdated ? ` · cached ${timeAgo(cachedProjects.lastUpdated)}` : ''}</p>
          {activeCount > 0 && <p className="text-xs text-green-400">{activeCount} active</p>}
          {loginCount > 0 && <p className="text-xs text-blue-400"><Power className="inline h-3 w-3 -mt-px mr-0.5" />{loginCount} on login</p>}
          {alwaysOnCount > 0 && <p className="text-xs text-orange-400"><Zap className="inline h-3 w-3 -mt-px mr-0.5" />{alwaysOnCount} always on</p>}
        </div>
        <Button variant="secondary" size="sm" onClick={fetchProjects} disabled={loading || !isElectron}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Scan
        </Button>
      </div>

      {!isElectron && projects.length === 0 ? (
        <WidgetCard title="PROJECTS" delay={0}>
          <p className="text-sm text-muted-foreground py-6 text-center">
            No cached data. Open the desktop app to scan your Projects directory.
          </p>
        </WidgetCard>
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(['app', 'monorepo', 'library', 'skill', 'assets'] as ProjectType[]).map((t) => {
                const cfg = typeConfig[t]
                const count = typeCounts[t] || 0
                if (count === 0) return null
                return (
                  <button key={t} onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                    className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${typeFilter === t ? `${cfg.color} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
                    {cfg.label} ({count})
                  </button>
                )
              })}
              <button onClick={() => setStatusFilter(statusFilter === 'archived' ? null : 'archived')}
                className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${statusFilter === 'archived' ? 'bg-muted text-foreground border-foreground/20' : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
                <Archive className="inline h-3 w-3 -mt-px mr-0.5" />Archived
              </button>
            </div>
          </div>

          {/* Project cards */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 items-start">
            {filtered.map((project) => {
              const cfg = typeConfig[project.type]
              const TypeIcon = cfg.icon
              const isExpanded = expanded.has(project.name)
              const ghUrl = project.gitRemote ? getGitHubUrl(project.gitRemote) : null
              const m = meta[project.name]
              const stCfg = m ? statusConfig[m.status] : null

              return (
                <div
                  key={project.name}
                  className={`rounded-xl border bg-card transition-colors hover:bg-secondary/20 ${
                    m?.alwaysActive ? 'border-orange-500/20' : m?.runsOnLogin ? 'border-blue-500/20' : 'border-border'
                  }`}
                >
                  {/* Card header */}
                  <button
                    onClick={() => toggleExpand(project.name)}
                    className="cursor-pointer w-full text-left px-4 py-3 flex items-start gap-3"
                  >
                    <TypeIcon className={`h-5 w-5 shrink-0 mt-0.5 ${cfg.color.split(' ')[1]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{m?.displayName || project.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                        {stCfg && <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${stCfg.color}`}>{stCfg.label}</span>}
                        {m?.runsOnLogin && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400"><Power className="inline h-2.5 w-2.5 -mt-px mr-0.5" />Login</span>}
                        {m?.alwaysActive && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400"><Zap className="inline h-2.5 w-2.5 -mt-px mr-0.5" />Always on</span>}
                        {project.hasClaude && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-foreground/10 text-foreground">CLAUDE</span>}
                        {m?.priority === 1 && <Star className="h-3 w-3 text-yellow-400 shrink-0" />}
                      </div>

                      {/* Tagline */}
                      {m?.tagline && (
                        <p className="text-xs text-foreground/70 mt-0.5 font-medium">{m.tagline}</p>
                      )}

                      {/* Description */}
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {m?.description || project.description || 'No description'}
                      </p>

                      {/* Tech + connections */}
                      {(project.techStack.length > 0 || project.connections.length > 0) && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {project.techStack.map((t) => (
                            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{t}</span>
                          ))}
                          {project.connections.map((c) => (
                            <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                              <Plug className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />{c}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Workflows */}
                      {project.workflows.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {project.workflows.map((wf) => (
                            <span key={wf.name} className={`text-[9px] px-1.5 py-0.5 rounded ${wf.scheduled ? 'bg-yellow-500/10 text-yellow-400' : 'bg-secondary text-muted-foreground'}`}>
                              <Workflow className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />{wf.name}
                              {wf.cron && <span className="ml-1 opacity-60">{wf.cron}</span>}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Latest commit */}
                      {project.latestCommit && (
                        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground/60">
                          <GitBranch className="h-3 w-3 shrink-0" />
                          <span className="truncate">{project.latestCommit.message}</span>
                          <span className="shrink-0">· {daysAgo(project.latestCommit.date)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {ghUrl && (
                        <a href={ghUrl} onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer"
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground hover:bg-secondary transition-colors">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground/30" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/30" />}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border/30 pt-3 ml-8 space-y-3">
                      {/* Why it exists */}
                      {m?.why && (
                        <div className="rounded-lg bg-secondary/30 px-3 py-2.5">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Why this exists
                          </p>
                          <p className="text-xs text-foreground/80">{m.why}</p>
                        </div>
                      )}

                      {/* Operational notes */}
                      {m?.notes && (
                        <div className="rounded-lg bg-secondary/30 px-3 py-2.5">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-1 flex items-center gap-1">
                            <Info className="h-3 w-3" /> Notes
                          </p>
                          <p className="text-[11px] text-muted-foreground">{m.notes}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 text-[11px]">
                        <div>
                          <p className="text-muted-foreground/50 text-[9px] uppercase tracking-wider mb-0.5">Path</p>
                          <p className="text-muted-foreground font-mono text-[10px] truncate">{project.path}</p>
                        </div>
                        {project.gitRemote && (
                          <div>
                            <p className="text-muted-foreground/50 text-[9px] uppercase tracking-wider mb-0.5">Remote</p>
                            <p className="text-muted-foreground font-mono text-[10px] truncate">{project.gitRemote}</p>
                          </div>
                        )}
                        {project.scripts.length > 0 && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground/50 text-[9px] uppercase tracking-wider mb-1">
                              <FileCode className="inline h-3 w-3 mr-0.5 -mt-px" />Scripts ({project.scripts.length})
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {project.scripts.map((s) => (
                                <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary font-mono text-muted-foreground">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {project.workflows.length > 0 && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground/50 text-[9px] uppercase tracking-wider mb-1">
                              <Clock className="inline h-3 w-3 mr-0.5 -mt-px" />Workflows
                            </p>
                            {project.workflows.map((wf) => (
                              <div key={wf.name} className="flex items-center gap-2 py-0.5">
                                <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${wf.scheduled ? 'bg-yellow-400' : 'bg-muted-foreground/30'}`} />
                                <span className="text-muted-foreground">{wf.name}</span>
                                {wf.cron && <span className="font-mono text-[9px] text-yellow-400/60">{wf.cron}</span>}
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
            <p className="text-sm text-muted-foreground text-center py-8">No projects match your filters.</p>
          )}
        </>
      )}
    </PageShell>
  )
}
