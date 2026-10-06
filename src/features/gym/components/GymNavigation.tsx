import { useState } from 'react'
import { ChartNoAxesColumn, Dumbbell, Ellipsis, ShieldCheck, ShoppingBag, Utensils } from 'lucide-react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/shared/Modal'

const sections = [
  { value: 'training', label: 'Training', icon: Dumbbell },
  { value: 'nutrition', label: 'Nutrition', icon: Utensils },
  { value: 'analytics', label: 'Progress', icon: ChartNoAxesColumn },
  { value: 'market', label: 'Market', icon: ShoppingBag, secondary: true },
  { value: 'discipline', label: 'Discipline', icon: ShieldCheck, secondary: true },
]

export function GymNavigation({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const secondary = sections.find(section => section.value === value && section.secondary)
  return (
    <div className="mb-3 flex min-w-0 items-center gap-2 border-b border-border pb-2">
      <TabsList variant="line" aria-label="Gym sections" className="w-full min-w-0 flex-1 justify-start sm:w-auto sm:flex-none">
        {sections.map(section => (
          <TabsTrigger key={section.value} value={section.value} className={`min-h-11 gap-2 px-2 text-sm font-semibold sm:px-4 ${section.secondary ? 'hidden sm:inline-flex' : ''}`}><section.icon className="hidden sm:block" />{section.label}</TabsTrigger>
        ))}
      </TabsList>
      <Button variant={secondary ? 'accent-outline' : 'secondary'} size="icon-lg" className="shrink-0 sm:hidden" aria-label={secondary ? `${secondary.label}: more gym sections` : 'More gym sections'} onClick={() => setMoreOpen(true)}><Ellipsis /></Button>
      <Modal open={moreOpen} onOpenChange={setMoreOpen} title="More in Gym">
        <div className="space-y-3">
          {sections.filter(section => section.secondary).map(section => (
            <Button key={section.value} variant={value === section.value ? 'accent-outline' : 'secondary'} className="h-14 w-full text-base" onClick={() => { onChange(section.value); setMoreOpen(false) }}>{section.label}</Button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
