import { useState, useEffect, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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

const typeConfig: Record<ProjectType, { label: string; color: string; icon: typeof Monitor }> = {
  app: { label: 'App', color: 'bg-blue-500/15 text-blue-400', icon: Monitor },
  monorepo: { label: 'Monorepo', color: 'bg-purple-500/15 text-purple-400', icon: Layers },
  library: { label: 'Library', color: 'bg-yellow-500/15 text-yellow-400', icon: Package },
  skill: { label: 'Skill', color: 'bg-green-500/15 text-green-400', icon: Bot },
  assets: { label: 'Assets', color: 'bg-orange-500/15 text-orange-400', icon: Image },
  unknown: { label: 'Other', color: 'bg-secondary text-muted-foreground', icon: FolderKanban },
}

function getGitHubUrl(remote: string): string | null {
  // Convert git@github.com:user/repo.git or https://github.com/user/repo.git to https://github.com/user/repo
  const sshMatch = remote.match(/git@github\.com:(.+?)(?:\.git)?$/)
  if (sshMatch) return `https://github.com/${sshMatch[1]}`
  const httpsMatch = remote.match(/https:\/\/github\.com\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return `https://github.com/${httpsMatch[1]}`
  return null
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
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ProjectType | null>(null)
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
    return projects.filter((p) =>
      (!typeFilter || p.type === typeFilter) &&
      (!search || p.name.toLowerCase().includes(lowerSearch) || p.description?.toLowerCase().includes(lowerSearch))
    )
  }, [projects, typeFilter, search])

  // Stats
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of projects) counts[p.type] = (counts[p.type] || 0) + 1
    return counts
  }, [projects])

  const scheduledCount = projects.filter((p) => p.workflows.some((w) => w.scheduled)).length
  const withClaude = projects.filter((p) => p.hasClaude).length

  return (
    <PageShell>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            {projects.length} projects {scheduledCount > 0 && `· ${scheduledCount} with schedules`} {withClaude > 0 && `· ${withClaude} with CLAUDE.md`}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchProjects} disabled={loading || !isElectron}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Scan
        </Button>
      </div>

      {!isElectron ? (
        <WidgetCard title="PROJECTS" delay={0}>
          <p className="text-sm text-muted-foreground py-6 text-center">
            Open in the desktop app to scan your Projects directory.
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
                  <button
                    key={t}
                    onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                    className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                      typeFilter === t ? `${cfg.color} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'
                    }`}
                  >
                    {cfg.label} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          {/* Project cards */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filtered.map((project) => {
              const cfg = typeConfig[project.type]
              const TypeIcon = cfg.icon
              const isExpanded = expanded.has(project.name)
              const ghUrl = project.gitRemote ? getGitHubUrl(project.gitRemote) : null

              return (
                <div
                  key={project.name}
                  className="rounded-xl border border-border bg-card transition-colors hover:bg-secondary/20"
                >
                  {/* Card header — always visible */}
                  <button
                    onClick={() => toggleExpand(project.name)}
                    className="cursor-pointer w-full text-left px-4 py-3 flex items-start gap-3"
                  >
                    <TypeIcon className={`h-5 w-5 shrink-0 mt-0.5 ${cfg.color.split(' ')[1]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{project.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                        {project.hasClaude && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-foreground/10 text-foreground">CLAUDE</span>
                        )}
                      </div>
                      {project.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{project.description}</p>
                      )}

                      {/* Tech stack + connections */}
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

                      {/* Workflows with schedule badges */}
                      {project.workflows.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {project.workflows.map((wf) => (
                            <span
                              key={wf.name}
                              className={`text-[9px] px-1.5 py-0.5 rounded ${
                                wf.scheduled ? 'bg-yellow-500/10 text-yellow-400' : 'bg-secondary text-muted-foreground'
                              }`}
                            >
                              <Workflow className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />
                              {wf.name}
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
                        <a
                          href={ghUrl}
                          onClick={(e) => e.stopPropagation()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground/30" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                      )}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-3 border-t border-border/30 pt-3 ml-8">
                      <div className="grid grid-cols-2 gap-3 text-[11px]">
                        {/* Path */}
                        <div>
                          <p className="text-muted-foreground/50 text-[9px] uppercase tracking-wider mb-0.5">Path</p>
                          <p className="text-muted-foreground font-mono text-[10px] truncate">{project.path}</p>
                        </div>

                        {/* Git remote */}
                        {project.gitRemote && (
                          <div>
                            <p className="text-muted-foreground/50 text-[9px] uppercase tracking-wider mb-0.5">Remote</p>
                            <p className="text-muted-foreground font-mono text-[10px] truncate">{project.gitRemote}</p>
                          </div>
                        )}

                        {/* Scripts */}
                        {project.scripts.length > 0 && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground/50 text-[9px] uppercase tracking-wider mb-1">
                              <FileCode className="inline h-3 w-3 mr-0.5 -mt-px" />
                              Scripts ({project.scripts.length})
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {project.scripts.map((s) => (
                                <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary font-mono text-muted-foreground">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Workflows detail */}
                        {project.workflows.length > 0 && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground/50 text-[9px] uppercase tracking-wider mb-1">
                              <Clock className="inline h-3 w-3 mr-0.5 -mt-px" />
                              Workflows
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
