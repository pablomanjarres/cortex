import { KnowledgeLink } from '@/components/shared/KnowledgeLink'
import { recordRefs } from '@/lib/knowledge'
import { projectRefId } from '../../../electron/knowledge/refs'
import type { ReactNode } from 'react'
import {
  AlertTriangle, ChevronDown, ChevronRight, Clock, ExternalLink, FileCode, GitBranch, Info, Plug, Power,
  Star, Workflow, Zap, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import type { ProjectInfo } from '@/types/electron'
import { daysAgo, getGitHubUrl, projectTitle, statusConfig, typeConfig, type ProjectMeta } from './project-model'

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

/** One scanned project: the summary toggles its details; the repository link stays a separate control. */
export function ProjectCard({ project, meta: m, expanded, onToggle }: {
  project: ProjectInfo
  meta?: ProjectMeta
  expanded: boolean
  onToggle: () => void
}) {
  const cfg = typeConfig[project.type]
  const TypeIcon = cfg.icon
  const title = projectTitle(project, m)
  const ghUrl = project.gitRemote ? getGitHubUrl(project.gitRemote) : null
  const stCfg = m ? statusConfig[m.status] : null
  const slug = projectRefId(project.name)
  const detailsId = `project-details-${slug}`

  return (
    <div id={`project-${slug}`} className="surface rounded-xl transition-colors hover:bg-secondary/20">
      <div className="relative">
        {ghUrl && (
          <a href={ghUrl} target="_blank" rel="noopener noreferrer"
            aria-label={`Open ${title} on GitHub`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-xs' }), 'absolute right-10 top-3 z-10')}>
            <ExternalLink />
          </a>
        )}
        <Button
          type="button"
          variant="ghost"
          aria-label={`Details for ${title}`}
          aria-expanded={expanded}
          aria-controls={expanded ? detailsId : undefined}
          onClick={onToggle}
          className="h-auto w-full items-start justify-start gap-3 whitespace-normal px-4 py-3 text-left text-foreground"
        >
          <TypeIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold">{title}</span>
              <Chip size="sm">{cfg.label}</Chip>
              {stCfg && <Chip size="sm" variant={stCfg.chip}>{stCfg.label}</Chip>}
              {m?.runsOnLogin && <Chip size="sm"><Power /> Login</Chip>}
              {m?.alwaysActive && <Chip size="sm"><Zap /> Always on</Chip>}
              {project.hasClaude && <Chip size="sm">claude</Chip>}
              {m?.priority === 1 && <Star className="h-3 w-3 shrink-0 text-accent" aria-label="Top priority" />}
            </div>

            {m?.tagline && (
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">{m.tagline}</p>
            )}

            <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">
              {m?.description || project.description || 'No description'}
            </p>

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

            {project.latestCommit && (
              <div className="mt-2 flex items-center gap-1.5 text-2xs text-foreground-faint">
                <GitBranch className="h-3 w-3 shrink-0" />
                <span className="truncate">{project.latestCommit.message}</span>
                <span className="shrink-0 font-mono">· {daysAgo(project.latestCommit.date)}</span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {expanded ? <ChevronDown className="h-4 w-4 text-foreground-faint" /> : <ChevronRight className="h-4 w-4 text-foreground-faint" />}
          </div>
        </Button>
      </div>

      {expanded && (
        <div id={detailsId} className="ml-8 space-y-3 border-t border-border/60 px-4 pb-4 pt-3">
          <div className="flex justify-end"><KnowledgeLink cortexRef={recordRefs.project(project.name)} /></div>
          {m?.why && <DetailNote icon={AlertTriangle} title="Why this exists" className="text-foreground">{m.why}</DetailNote>}
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
}
