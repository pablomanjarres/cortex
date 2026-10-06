import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface SetValueControlProps {
  value: number
  unit: string
  onDec: () => void
  onInc: () => void
  onChange: (value: number) => void
}

export function SetValueControl({ value, unit, onDec, onInc, onChange }: SetValueControlProps) {
  const [editing, setEditing] = useState<{ value: number; text: string } | null>(null)
  const label = unit === 'kg' ? 'Weight (kg)' : 'Reps'
  return (
    <label className="block min-w-0 flex-1 rounded-lg bg-focus-surface/60 p-2 sm:p-3">
      <span className="block text-center text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-2">
        <Input type="text" inputMode={unit === 'kg' ? 'decimal' : 'numeric'} aria-label={label}
          value={editing?.value === value ? editing.text : String(value)}
          onChange={(event) => {
            const text = event.target.value.replace(',', '.')
            if (!/^\d*(?:\.\d*)?$/.test(text) || (unit !== 'kg' && text.includes('.'))) return
            const parsed = Number(text)
            if (!Number.isFinite(parsed)) return
            setEditing({ value: parsed, text })
            onChange(parsed)
          }}
          onFocus={(event) => event.target.select()} onBlur={() => setEditing(null)}
          className="h-20 min-w-0 border-transparent bg-transparent px-1 text-center font-mono text-3xl font-medium tabular-nums shadow-none min-[375px]:text-4xl sm:text-5xl"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" size="icon-lg" className="w-full bg-card/50 text-foreground" onClick={() => { setEditing(null); onDec() }} aria-label={`Decrease ${unit}`}><Minus /></Button>
          <Button variant="ghost" size="icon-lg" className="w-full bg-card/50 text-foreground" onClick={() => { setEditing(null); onInc() }} aria-label={`Increase ${unit}`}><Plus /></Button>
        </div>
      </div>
    </label>
  )
}
