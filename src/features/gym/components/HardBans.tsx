import { useState, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Flame, Plus, X, Pencil, Check, ChevronDown, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/shared/PageHeader'
import { useStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import type { HardBan, BanViolation } from '@/types/gym'
import { DEFAULT_HARD_BANS } from '@/types/gym'

const CATEGORIES: HardBan['category'][] = ['food', 'digital', 'lifestyle']
const EPOCH = '2026-04-07'

function daysBetween(a: string, b: string): number {
  const msA = new Date(a + 'T00:00:00').getTime()
  const msB = new Date(b + 'T00:00:00').getTime()
  return Math.floor(Math.abs(msB - msA) / 86400000)
}

export function HardBans() {
  const reduceMotion = useReducedMotion()
  const [bans, setBans] = useStore<HardBan[]>('cortex-hard-bans', DEFAULT_HARD_BANS)
  const [violations, setViolations] = useStore<BanViolation[]>('cortex-ban-violations', [])
  const [editing, setEditing] = useState(false)
  const [expandedBanId, setExpandedBanId] = useState<string | null>(null)
  const [violationNotes, setViolationNotes] = useState('')
  const [showRecent, setShowRecent] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<HardBan['category']>('food')

  const today = localDate()

  const streakMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const ban of bans) {
      const banViolations = violations.filter(v => v.banId === ban.id)
      if (banViolations.length === 0) {
        map[ban.id] = daysBetween(EPOCH, today)
      } else {
        const latest = banViolations.reduce((a, b) => (a.date > b.date ? a : b))
        map[ban.id] = daysBetween(latest.date, today)
      }
    }
    return map
  }, [bans, violations, today])

  const recentViolations = useMemo(() =>
    [...violations]
      .sort((a, b) => b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp))
      .slice(0, 10),
    [violations]
  )

  function logViolation(banId: string) {
    const v: BanViolation = {
      id: `${banId}-${Date.now()}`,
      banId,
      date: today,
      timestamp: new Date().toISOString(),
      notes: violationNotes.trim() || undefined,
    }
    setViolations(prev => [...prev, v])
    setViolationNotes('')
    setExpandedBanId(null)
  }

  function removeBan(id: string) {
    setBans(prev => prev.filter(b => b.id !== id))
  }

  function addBan() {
    const name = newName.trim()
    if (!name) return
    const ban: HardBan = { id: `ban-${Date.now()}`, name, category: newCategory }
    setBans(prev => [...prev, ban])
    setNewName('')
  }

  function getBanName(banId: string): string {
    return bans.find(b => b.id === banId)?.name ?? banId
  }

  return (
    <div className="mt-4 space-y-4">
      <PageHeader
        kicker="Discipline"
        title="Hard bans"
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditing(e => !e)}
            aria-label={editing ? 'Done editing' : 'Edit bans'}
          >
            {editing ? <Check /> : <Pencil />}
          </Button>
        }
      />

      {/* Bans grouped by category */}
      {CATEGORIES.map(cat => {
        const catBans = bans.filter(b => b.category === cat)
        if (catBans.length === 0 && !editing) return null
        return (
          <div key={cat}>
            <p className="mb-1.5 font-mono text-2xs uppercase tracking-widest text-foreground-faint">
              {cat}
            </p>
            <div className="surface divide-y divide-border/60 rounded-xl">
              {catBans.map(ban => (
                <div key={ban.id}>
                  <div
                    className="flex cursor-pointer items-center justify-between px-4 py-2.5 transition-colors hover:bg-muted/40"
                    onClick={() => {
                      if (editing) return
                      setExpandedBanId(prev => prev === ban.id ? null : ban.id)
                      setViolationNotes('')
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {editing && (
                        <Button
                          variant="destructive"
                          size="icon-xs"
                          className="rounded-full"
                          onClick={(e) => { e.stopPropagation(); removeBan(ban.id) }}
                          aria-label={`Remove ban ${ban.name}`}
                        >
                          <X />
                        </Button>
                      )}
                      <span className="text-sm text-foreground">{ban.name}</span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-xs tabular-nums">
                      <Flame size={12} className={streakMap[ban.id] > 7 ? 'text-success' : 'text-foreground-faint'} />
                      <span className={streakMap[ban.id] > 7 ? 'font-medium text-success' : 'text-muted-foreground'}>
                        {streakMap[ban.id]}d
                      </span>
                    </div>
                  </div>

                  {/* Inline violation logger */}
                  <AnimatePresence>
                    {expandedBanId === ban.id && !editing && (
                      <motion.div
                        initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.15 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2 px-4 pb-3">
                          <textarea
                            value={violationNotes}
                            onChange={e => setViolationNotes(e.target.value)}
                            placeholder="What happened?"
                            rows={2}
                            className="w-full resize-none rounded-md border border-input bg-input/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground-faint"
                          />
                          <Button variant="destructive" size="sm" onClick={() => logViolation(ban.id)}>
                            <AlertTriangle />
                            Log Violation
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Add ban row (edit mode only) */}
      {editing && (
        <div className="surface space-y-2 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New ban name"
              className="flex-1"
              onKeyDown={e => e.key === 'Enter' && addBan()}
            />
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value as HardBan['category'])}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <Button variant="secondary" size="icon-sm" onClick={addBan} aria-label="Add ban">
              <Plus />
            </Button>
          </div>
        </div>
      )}

      {/* Recent Violations */}
      {recentViolations.length > 0 && (
        <div>
          <Button variant="ghost" size="xs" onClick={() => setShowRecent(v => !v)}>
            <ChevronDown className={`transition-transform ${showRecent ? 'rotate-0' : '-rotate-90'}`} />
            Recent Violations ({recentViolations.length})
          </Button>
          <AnimatePresence>
            {showRecent && (
              <motion.div
                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.15 }}
                className="overflow-hidden"
              >
                <div className="surface mt-2 divide-y divide-border/60 rounded-xl">
                  {recentViolations.map(v => (
                    <div key={v.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{getBanName(v.banId)}</p>
                        {v.notes && <p className="mt-0.5 truncate text-xs text-muted-foreground">{v.notes}</p>}
                      </div>
                      <span className="shrink-0 whitespace-nowrap font-mono text-2xs tabular-nums text-foreground-faint">
                        {v.date}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
