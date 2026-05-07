import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import type { GtmDailyLog } from '@/types/gtm'

interface DailyLogFormProps {
  log: GtmDailyLog
  onUpdate: (log: GtmDailyLog) => void
}

const NUMERIC_FIELDS: { key: keyof GtmDailyLog; label: string }[] = [
  { key: 'dmsSent', label: 'DMs Sent' },
  { key: 'dmResponses', label: 'DM Responses' },
  { key: 'demoCalls', label: 'Demo Calls' },
  { key: 'xReplies', label: 'X Replies' },
  { key: 'xFollowers', label: 'X Followers' },
  { key: 'redditComments', label: 'Reddit Comments' },
  { key: 'linkedinMessages', label: 'LinkedIn Messages' },
  { key: 'postsPublished', label: 'Posts Published' },
]

export function DailyLogForm({ log, onUpdate }: DailyLogFormProps) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const handleNumericChange = (key: keyof GtmDailyLog, raw: string) => {
    const value = raw === '' ? 0 : parseFloat(raw)
    if (isNaN(value)) return
    onUpdate({ ...log, [key]: value })
  }

  const handleTextChange = (key: keyof GtmDailyLog, value: string) => {
    onUpdate({ ...log, [key]: value })
  }

  return (
    <WidgetCard title="TODAY'S LOG" description={today} delay={0.15}>
      <div className="flex flex-col gap-4">
        {/* Numeric fields grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {NUMERIC_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-1 rounded-lg bg-secondary/50 px-3 py-2">
              <label className="text-[11px] text-muted-foreground">{label}</label>
              <Input
                type="number"
                min={0}
                step={1}
                value={log[key] || ''}
                onChange={(e) => handleNumericChange(key, e.target.value)}
                className="h-8 border-0 bg-transparent px-0 text-sm font-bold tabular-nums"
              />
            </div>
          ))}
        </div>

        {/* Channel of signup */}
        <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 px-3 py-2">
          <label className="text-[11px] text-muted-foreground">Channel of Signup</label>
          <Input
            type="text"
            placeholder="e.g. X DM, Reddit, LinkedIn, organic..."
            value={log.channelOfSignup}
            onChange={(e) => handleTextChange('channelOfSignup', e.target.value)}
            className="h-8 border-0 bg-transparent px-0 text-sm"
          />
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1 rounded-lg bg-secondary/50 px-3 py-2">
          <label className="text-[11px] text-muted-foreground">Notes</label>
          <textarea
            rows={3}
            placeholder="What worked today? What didn't? Key learnings..."
            value={log.notes}
            onChange={(e) => handleTextChange('notes', e.target.value)}
            className="w-full resize-none rounded-lg border-0 bg-transparent px-0 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
    </WidgetCard>
  )
}
