import { useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Progress } from '@/components/ui/progress'
import { Moon, Dumbbell, Zap, Droplets, Smile } from 'lucide-react'

export function HealthPage() {
  const [water, setWater] = useState(0)
  const [mood, setMood] = useState(0)
  const waterTarget = 8

  const moods = ['😫', '😟', '😐', '🙂', '😄']

  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <WidgetCard title="Sleep" description="Last night" delay={0}>
          <div className="flex items-center gap-4 py-4">
            <Moon className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-3xl font-bold tabular-nums">—h</p>
              <p className="text-xs text-muted-foreground">Quality: —/5</p>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Exercise" description="Today's activity" delay={0.1}>
          <div className="flex items-center gap-4 py-4">
            <Dumbbell className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">No workout logged</p>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Energy Levels" delay={0.2}>
          <div className="flex flex-col gap-3 py-2">
            {['Morning', 'Afternoon', 'Evening'].map((period) => (
              <div key={period} className="flex items-center gap-3">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="w-20 text-sm">{period}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      className="h-6 w-6 rounded bg-secondary text-[10px] text-muted-foreground hover:bg-secondary/80 transition-colors"
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="Water Intake" description={`${water}/${waterTarget} glasses`} delay={0.3}>
          <Progress value={(water / waterTarget) * 100} className="mb-4 h-1.5" />
          <div className="flex items-center gap-4">
            <Droplets className="h-8 w-8 text-muted-foreground" />
            <div className="flex gap-1">
              {Array.from({ length: waterTarget }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setWater(i + 1)}
                  className={`h-8 w-8 rounded-md text-xs transition-all ${
                    i < water
                      ? 'bg-foreground text-background'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  💧
                </button>
              ))}
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Mood" description="How are you feeling?" delay={0.4}>
          <div className="flex flex-col items-center gap-4 py-4">
            <span className="text-4xl">{mood > 0 ? moods[mood - 1] : '—'}</span>
            <div className="flex gap-2">
              {moods.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => setMood(i + 1)}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg transition-all ${
                    mood === i + 1
                      ? 'bg-foreground/10 ring-1 ring-foreground/20'
                      : 'hover:bg-secondary'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Mental Health" description="Check-in" delay={0.5}>
          <div className="flex items-center gap-4 py-4">
            <Smile className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Take a moment to reflect</p>
            </div>
          </div>
        </WidgetCard>
      </div>
    </PageShell>
  )
}
