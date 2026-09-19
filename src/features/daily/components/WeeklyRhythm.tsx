import { BarChart3 } from 'lucide-react'
import { dayName, formatMinutes } from './homePanelUtils'

export function WeeklyRhythm({ days, minutes }: { days: string[]; minutes: number[] }) {
  const max = Math.max(60, ...minutes)
  const total = minutes.reduce((sum, value) => sum + value, 0)

  return (
    <section className="flex h-full flex-col rounded-[1.75rem] border border-success/20 bg-progress-surface p-5 text-[#17280E] shadow-card dark:border-lime-200/30 dark:bg-[#CFEF87] dark:text-[#18220A] md:p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="size-5" />
            Weekly rhythm
          </div>
          <p className="mt-1 text-sm text-[#486039] dark:text-[#405719]">
            {total > 0 ? `${formatMinutes(total)} logged this week` : 'No focus sessions logged this week'}
          </p>
        </div>
        <span className="rounded-full bg-white/45 px-3 py-1 text-xs font-semibold dark:bg-white/35">Focus time</span>
      </div>
      <div className="flex min-h-48 flex-1 items-end gap-3 border-b border-[#76945E]/25 pb-2">
        {days.map((day, index) => {
          const height = minutes[index] > 0 ? Math.max(10, (minutes[index] / max) * 100) : 4
          return (
            <div key={day} className="flex h-full flex-1 flex-col justify-end gap-2">
              <div className="relative flex flex-1 items-end rounded-t-xl bg-white/18 dark:bg-white/8">
                <div
                  className="w-full rounded-t-xl bg-accent shadow-[0_10px_22px_rgba(98,74,181,0.24)]"
                  style={{ height: `${height}%` }}
                />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold">{dayName(day)}</p>
                <p className="font-mono text-[0.68rem] text-[#486039] dark:text-[#405719]">{formatMinutes(minutes[index])}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
