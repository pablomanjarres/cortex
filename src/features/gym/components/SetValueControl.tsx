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
    <label className="block min-w-0 flex-1">
      <span className="mb-2 block text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-lg" className="h-14 w-11 shrink-0" onClick={() => { setEditing(null); onDec() }} aria-label={`Decrease ${unit}`}><Minus /></Button>
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
          className="h-16 min-w-0 px-1 text-center font-mono text-3xl font-medium tabular-nums"
        />
        <Button variant="outline" size="icon-lg" className="h-14 w-11 shrink-0" onClick={() => { setEditing(null); onInc() }} aria-label={`Increase ${unit}`}><Plus /></Button>
      </div>
    </label>
  )
}
