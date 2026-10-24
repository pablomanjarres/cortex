import { useState, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { FilterChips } from '@/components/shared/FilterChips'
import { SearchInput } from '@/components/shared/SearchInput'
import { RefreshButton } from '@/components/shared/RefreshButton'
import { timeAgo } from '@/lib/date-utils'
import { useStore } from '@/lib/store'
import { WorkHoursPanel } from './WorkHoursPanel'
import { ProjectCard } from './ProjectCard'
import { useProjectScan } from './use-project-scan'
import { FILTER_TYPES, filterProjects, typeConfig, type ProjectMeta, type ProjectType } from './project-model'
import type { ProjectInfo } from '@/types/electron'
import { Power, Archive, Zap } from 'lucide-react'

const EMPTY_PROJECTS: ProjectInfo[] = []

export function ProjectsPage() {
  const { projects: scannedProjects, loading, rescan } = useProjectScan()
  const [meta] = useStore<Record<string, ProjectMeta>>('cortex-project-meta', {})
  const [cachedProjects] = useStore<{ data: ProjectInfo[]; lastUpdated: string } | null>('cortex-cache-projects', null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ProjectType | null>(null)
  const [statusFilter, setStatusFilter] = useState<'archived' | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const isElectron = !!window.electronAPI?.projects

  const projects = scannedProjects ?? (!isElectron && cachedProjects ? cachedProjects.data : EMPTY_PROJECTS)

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const filtered = useMemo(
    () => filterProjects(projects, meta, { type: typeFilter, status: statusFilter, search }),
    [projects, meta, typeFilter, statusFilter, search],
  )

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
        <RefreshButton onClick={() => { void rescan() }} busy={loading} disabled={!isElectron} label="Scan" />
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
              <FilterChips label="Filter by type" value={typeFilter} onChange={setTypeFilter}
                options={FILTER_TYPES.filter((t) => typeCounts[t]).map((t) => ({ value: t, label: `${typeConfig[t].label} (${typeCounts[t]})` }))} />
              <FilterChips label="Filter by status" value={statusFilter} onChange={setStatusFilter}
                options={[{ value: 'archived', label: <><Archive /> Archived</> }]} />
            </div>
          </div>

          {/* Project cards */}
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            {filtered.map((project) => (
              <ProjectCard
                key={project.name}
                project={project}
                meta={meta[project.name]}
                expanded={expanded.has(project.name)}
                onToggle={() => toggleExpand(project.name)}
              />
            ))}
          </div>

          {filtered.length === 0 && projects.length > 0 && (
            <EmptyState message="No projects match your filters." />
          )}
        </>
      )}
    </PageShell>
  )
}
