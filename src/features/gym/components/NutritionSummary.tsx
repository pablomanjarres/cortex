import { Droplets, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NutritionTargets } from '@/types/gym'

function NutritionMeter({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const progress = target > 0 ? Math.min(100, value / target * 100) : 0
  return (
    <div className="min-w-0 rounded-xl bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-2xl tabular-nums text-foreground">{Math.round(value)}<span className="ml-1 text-sm">{unit}</span></p>
      <p className="mt-1 text-sm text-muted-foreground">of {target} {unit}</p>
      <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={Math.max(value, target)} className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

export function NutritionSummary({ protein, calories, water, targets, onAdjustWater }: {
  protein: number; calories: number; water: number; targets: NutritionTargets; onAdjustWater: (delta: number) => void
}) {
  return (
    <section className="rounded-3xl border border-border bg-focus-surface p-4 sm:p-5" aria-label="Daily nutrition">
      <h2 className="text-lg font-semibold text-foreground">Daily nutrition</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <NutritionMeter label="Protein" value={protein} target={targets.protein} unit="g" />
        <NutritionMeter label="Calories" value={calories} target={targets.calories} unit="kcal" />
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Droplets className="size-5 text-primary" />
          <div><p className="text-sm text-muted-foreground">Water</p><p className="font-mono text-xl tabular-nums">{water} <span className="text-sm text-muted-foreground">/ {targets.water} L</span></p></div>
        </div>
        <Button variant="secondary" size="icon-lg" aria-label="Remove 0.25 liters" onClick={() => onAdjustWater(-0.25)}><Minus /></Button>
      </div>
      <Button className="mt-4 h-12 w-full text-base" onClick={() => onAdjustWater(0.25)}><Plus />Add a glass of water</Button>
      <p className="mt-2 text-center text-sm text-muted-foreground">250 ml per glass</p>
    </section>
  )
}
