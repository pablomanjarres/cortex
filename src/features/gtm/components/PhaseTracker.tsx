import { Check, ChevronRight, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { localDate } from '@/lib/date-utils'
import type { GtmPhaseState } from '@/types/gtm'
import { PHASES } from '../phases'

export function PhaseTracker({
  phaseState,
  onUpdate,
}: {
  phaseState: GtmPhaseState
  onUpdate: (state: GtmPhaseState) => void
}) {
  const { currentPhase } = phaseState
  const currentDef = PHASES.find((p) => p.id === currentPhase)!

  const allCriteriaComplete = currentDef.exitCriteria.every(
    (c) => phaseState.exitCriteria[currentPhase]?.[c.key],
  )

  const toggleCriteria = (key: string) => {
    const phaseCriteria = { ...phaseState.exitCriteria[currentPhase] }
    phaseCriteria[key] = !phaseCriteria[key]
    onUpdate({
      ...phaseState,
      exitCriteria: { ...phaseState.exitCriteria, [currentPhase]: phaseCriteria },
    })
  }

  const advancePhase = () => {
    if (currentPhase >= 5 || !allCriteriaComplete) return
    const nextPhase = (currentPhase + 1) as GtmPhaseState['currentPhase']
    onUpdate({
      ...phaseState,
      currentPhase: nextPhase,
      phaseStartDates: {
        ...phaseState.phaseStartDates,
        [nextPhase]: localDate(),
      },
    })
  }

  return (
    <WidgetCard title="PHASE PROGRESS" delay={0}>
      {/* Horizontal stepper */}
      <div className="flex items-center justify-between px-2">
        {PHASES.map((phase, i) => {
          const isCompleted = phase.id < currentPhase
          const isCurrent = phase.id === currentPhase
          const isFuture = phase.id > currentPhase

          return (
            <div key={phase.id} className="flex items-center flex-1 last:flex-none">
              {/* Phase node */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                    isCompleted
                      ? 'border-green-500 bg-green-500/20'
                      : isCurrent
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-muted-foreground/30 bg-muted/30'
                  }`}
                >
                  {isCompleted && <Check className="h-4 w-4 text-green-400" />}
                  {isCurrent && (
                    <>
                      <Circle className="h-3 w-3 fill-blue-400 text-blue-400" />
                      <span className="absolute inset-0 animate-ping rounded-full border-2 border-blue-400/40" />
                    </>
                  )}
                  {isFuture && <Circle className="h-3 w-3 text-muted-foreground/40" />}
                </div>
                <span
                  className={`text-[10px] font-medium ${
                    isCompleted
                      ? 'text-green-400'
                      : isCurrent
                        ? 'text-blue-400'
                        : 'text-muted-foreground/50'
                  }`}
                >
                  {phase.shortName}
                </span>
              </div>

              {/* Connector line */}
              {i < PHASES.length - 1 && (
                <div
                  className={`mx-1 h-0.5 flex-1 rounded-full transition-colors ${
                    phase.id < currentPhase ? 'bg-green-500/40' : 'bg-muted-foreground/15'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Current phase details */}
      <div className="mt-5 rounded-lg bg-secondary/30 px-4 py-3">
        <div className="mb-3 flex items-baseline gap-2">
          <h4 className="text-sm font-semibold">{currentDef.name}</h4>
          <span className="text-[10px] text-muted-foreground">{currentDef.duration}</span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{currentDef.description}</p>

        {/* Exit criteria checkboxes */}
        <div className="flex flex-col gap-2">
          {currentDef.exitCriteria.map((c) => {
            const checked = !!phaseState.exitCriteria[currentPhase]?.[c.key]
            return (
              <label
                key={c.key}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCriteria(c.key)}
                  className="h-3.5 w-3.5 rounded border-muted-foreground/40 accent-green-500"
                />
                <span className={`text-xs ${checked ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                  {c.label}
                </span>
              </label>
            )
          })}
        </div>

        {/* Advance button */}
        <div className="mt-4">
          <Button
            variant="default"
            size="sm"
            disabled={!allCriteriaComplete || currentPhase >= 5}
            onClick={advancePhase}
          >
            Advance to next phase
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </WidgetCard>
  )
}
