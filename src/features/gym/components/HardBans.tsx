import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, Plus, X, Pencil, Check, ChevronDown, AlertTriangle } from 'lucide-react'
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Hard Bans</h3>
        <button
          onClick={() => setEditing(e => !e)}
          className="p-1.5 rounded-lg hover:bg-foreground/10 text-muted-foreground transition-colors"
        >
          {editing ? <Check size={16} /> : <Pencil size={16} />}
        </button>
      </div>

      {/* Bans grouped by category */}
      {CATEGORIES.map(cat => {
        const catBans = bans.filter(b => b.category === cat)
        if (catBans.length === 0 && !editing) return null
        return (
          <div key={cat}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">
              {cat}
            </p>
            <div className="rounded-xl border border-border bg-card divide-y divide-border/30">
              {catBans.map(ban => (
                <div key={ban.id}>
                  <div
                    className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-foreground/5 transition-colors"
                    onClick={() => {
                      if (editing) return
                      setExpandedBanId(prev => prev === ban.id ? null : ban.id)
                      setViolationNotes('')
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {editing && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeBan(ban.id) }}
                          className="p-0.5 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      )}
                      <span className="text-sm text-foreground">{ban.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs tabular-nums">
                      <Flame size={12} className={streakMap[ban.id] > 7 ? 'text-orange-400' : 'text-muted-foreground/50'} />
                      <span className={streakMap[ban.id] > 7 ? 'text-orange-400 font-medium' : 'text-muted-foreground'}>
                        {streakMap[ban.id]}d
                      </span>
                    </div>
                  </div>

                  {/* Inline violation logger */}
                  <AnimatePresence>
                    {expandedBanId === ban.id && !editing && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-3 space-y-2">
                          <textarea
                            value={violationNotes}
                            onChange={e => setViolationNotes(e.target.value)}
                            placeholder="What happened?"
                            rows={2}
                            className="w-full resize-none rounded-lg border border-border/30 bg-foreground/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border"
                          />
                          <button
                            onClick={() => logViolation(ban.id)}
                            className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30 transition-colors"
                          >
                            <AlertTriangle size={12} />
                            Log Violation
                          </button>
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
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New ban name"
              className="flex-1 rounded-lg border border-border/30 bg-foreground/5 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border"
              onKeyDown={e => e.key === 'Enter' && addBan()}
            />
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value as HardBan['category'])}
              className="rounded-lg border border-border/30 bg-foreground/5 px-2 py-1.5 text-xs text-foreground focus:outline-none"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={addBan}
              className="p-1.5 rounded-lg bg-foreground/10 text-foreground hover:bg-foreground/20 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Recent Violations */}
      {recentViolations.length > 0 && (
        <div>
          <button
            onClick={() => setShowRecent(v => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown size={14} className={`transition-transform ${showRecent ? 'rotate-0' : '-rotate-90'}`} />
            Recent Violations ({recentViolations.length})
          </button>
          <AnimatePresence>
            {showRecent && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="mt-2 rounded-xl border border-border bg-card divide-y divide-border/30">
                  {recentViolations.map(v => (
                    <div key={v.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{getBanName(v.banId)}</p>
                        {v.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{v.notes}</p>}
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums whitespace-nowrap">
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
