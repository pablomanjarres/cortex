import { WidgetCard } from '@/components/widgets/WidgetCard'
import { PHASES } from '../phases'

interface TimeBlockScheduleProps {
  currentPhase: number
}

export function TimeBlockSchedule({ currentPhase }: TimeBlockScheduleProps) {
  const phase = PHASES.find((p) => p.id === currentPhase)

  if (!phase) return null

  return (
    <WidgetCard title="TODAY'S SCHEDULE" description={phase.name} compact>
      <div className="space-y-2">
        {phase.timeBlocks.map((block, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="w-20 shrink-0 rounded bg-secondary/50 px-2 py-1 text-center text-[11px] font-medium tabular-nums">
              {block.duration}
            </span>
            <span className="text-sm">{block.task}</span>
          </div>
        ))}
      </div>
    </WidgetCard>
  )
}
