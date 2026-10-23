import { useId, type ComponentProps, type ReactNode } from 'react'
import { ExternalLink, Trash2 } from 'lucide-react'
import { Field } from '@/components/shared/Field'
import { TagInput } from '@/components/shared/TagInput'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  ALL_CATEGORIES, ALL_DEADLINE_TYPES, ALL_EFFORTS, ALL_GOALS, ALL_STATUSES,
  ageRuleOf, categoryConfig, deadlineTypeConfig, deadlineTypeOf, deadlineTypePatch,
  effortConfig, eligibilityConfig, goalConfig, modalityConfig, modalityOf,
  parseAmountUsd, priorityConfig, requires18PlusFor, sourceOf, statusConfig,
  type AgeRule, type DeadlineType, type Effort, type Eligibility, type Goal,
  type Modality, type Opportunity, type OpportunityCategory, type OppStatus,
} from './opportunity-model'

type Option = { value: string; label: string }
const options = <K extends string>(keys: readonly K[], label: (key: K) => string): Option[] =>
  keys.map((value) => ({ value, label: label(value) }))

const CATEGORY_OPTIONS = options(ALL_CATEGORIES, (c) => categoryConfig[c].label)
const MODALITY_OPTIONS = options(Object.keys(modalityConfig) as Modality[], (m) => modalityConfig[m].label)
const ELIGIBILITY_OPTIONS = options(Object.keys(eligibilityConfig) as Eligibility[], (e) => eligibilityConfig[e])
const EFFORT_OPTIONS = [{ value: '', label: 'Unknown' }, ...options(ALL_EFFORTS, (e) => effortConfig[e])]
const STATUS_OPTIONS = options(ALL_STATUSES, (s) => statusConfig[s].label)
const PRIORITY_OPTIONS = options(['high', 'medium', 'low'] as const, (p) => priorityConfig[p].label)
const DEADLINE_TYPE_OPTIONS = options(ALL_DEADLINE_TYPES, (d) => deadlineTypeConfig[d].label)
const AGE_RULE_OPTIONS: Option[] = [
  { value: '', label: 'Unstated' },
  { value: 'yes', label: 'Requires 18+' },
  { value: 'no', label: 'Minors OK' },
]

const control = 'h-7 text-xs'

function TextField({ label, className, ...input }: { label: string } & ComponentProps<typeof Input>) {
  return <Field label={label}>{(id) => <Input id={id} {...input} className={cn(control, className)} />}</Field>
}

function SelectField({ label, value, choices, onChange }: {
  label: string
  value: string
  choices: Option[]
  onChange: (value: string) => void
}) {
  return (
    <Field label={label}>
      {(id) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(control, 'cursor-pointer px-2')}>
          {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
      )}
    </Field>
  )
}

const Pair = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-2">{children}</div>

/** Inline editor for one opportunity: identity, deadline intelligence + money, goals/notes/tags. */
export function OpportunityEditor({ o, setField, toggleGoal, onDelete }: {
  o: Opportunity
  setField: (id: string, f: Partial<Opportunity>) => void
  toggleGoal: (id: string, g: Goal) => void
  onDelete: () => void
}) {
  const set = (f: Partial<Opportunity>) => setField(o.id, f)
  const goalsLabel = useId()

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Identity */}
      <div className="flex flex-col gap-2">
        <TextField label="Title" value={o.title} onChange={(e) => set({ title: e.target.value })} className="font-medium" />
        <Pair>
          <TextField label="Host" value={o.host} onChange={(e) => set({ host: e.target.value })} />
          <TextField label="Location" value={o.location} onChange={(e) => set({ location: e.target.value })} />
        </Pair>
        <Pair>
          <SelectField label="Category" value={categoryConfig[o.category] ? o.category : 'other'} choices={CATEGORY_OPTIONS}
            onChange={(v) => set({ category: v as OpportunityCategory })} />
          <SelectField label="Modality" value={modalityOf(o)} choices={MODALITY_OPTIONS}
            onChange={(v) => set({ modality: v as Modality })} />
          <SelectField label="Eligibility" value={eligibilityConfig[o.eligibility] ? o.eligibility : 'unknown'} choices={ELIGIBILITY_OPTIONS}
            onChange={(v) => set({ eligibility: v as Eligibility })} />
          <SelectField label="Effort to apply" value={o.effort && effortConfig[o.effort] ? o.effort : ''} choices={EFFORT_OPTIONS}
            onChange={(v) => set({ effort: (v || null) as Effort | null })} />
        </Pair>
        <TextField label="Apply / discovery link" value={o.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" className="font-mono" />
        <TextField label="Official program page" value={o.officialUrl ?? ''} onChange={(e) => set({ officialUrl: e.target.value })} placeholder="https://…" className="font-mono" />
      </div>

      {/* Status · deadline intelligence · money */}
      <div className="flex flex-col gap-2">
        <Pair>
          <SelectField label="Status" value={statusConfig[o.status] ? o.status : 'new'} choices={STATUS_OPTIONS}
            onChange={(v) => set({ status: v as OppStatus })} />
          <SelectField label="Priority" value={priorityConfig[o.priority] ? o.priority : 'medium'} choices={PRIORITY_OPTIONS}
            onChange={(v) => set({ priority: v as Opportunity['priority'] })} />
        </Pair>
        <Pair>
          <SelectField label="Deadline type" value={deadlineTypeOf(o)} choices={DEADLINE_TYPE_OPTIONS}
            onChange={(v) => set(deadlineTypePatch(v as DeadlineType))} />
          <TextField label="Deadline" type="date" value={o.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || null })} className="cursor-pointer font-mono" />
        </Pair>
        <Pair>
          <TextField label="Recurrence" value={o.recurrence ?? ''} onChange={(e) => set({ recurrence: e.target.value || null })} placeholder="annual, 2 batches/yr…" />
          <TextField label="Next window expected" value={o.nextWindowExpected ?? ''} onChange={(e) => set({ nextWindowExpected: e.target.value || null })} placeholder="~Sep 2026 (estimate)" />
        </Pair>
        <Pair>
          <TextField label="Amount (USD)" type="number" min={0} value={o.amountUsd ?? ''} onChange={(e) => set({ amountUsd: parseAmountUsd(e.target.value) })} placeholder="50000" className="font-mono tabular-nums" />
          <SelectField label="Age rule" value={ageRuleOf(o)} choices={AGE_RULE_OPTIONS}
            onChange={(v) => set({ requires18Plus: requires18PlusFor(v as AgeRule) })} />
        </Pair>
        <TextField label="Reward / prize" value={o.reward} onChange={(e) => set({ reward: e.target.value })} placeholder="$5k, stipend, credits…" />
        <Field label={`Leverage: ${o.leverageScore}/5`}>
          {(id) => (
            <input
              id={id}
              type="range"
              min={1}
              max={5}
              step={1}
              value={o.leverageScore}
              onChange={(e) => set({ leverageScore: parseInt(e.target.value) })}
              className="w-full cursor-pointer accent-accent"
            />
          )}
        </Field>
        <TextField label="Leverage note (what it unlocks)" value={o.leverageNote} onChange={(e) => set({ leverageNote: e.target.value })} placeholder="e.g. funding + press + investor intros" />
      </div>

      {/* Goals · notes · tags */}
      <div className="flex flex-col gap-2">
        <div role="group" aria-labelledby={goalsLabel} className="space-y-1">
          <p id={goalsLabel} className="text-xs text-muted-foreground">Goals it serves</p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_GOALS.map((g) => (
              <Chip key={g} selectable selected={o.goals.includes(g)} onClick={() => toggleGoal(o.id, g)}>
                {goalConfig[g]}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="Notes">
          {(id) => (
            <Textarea id={id} value={o.notes} onChange={(e) => set({ notes: e.target.value })} rows={4}
              placeholder="Why it matters, what to prepare, source excerpt…" className="w-full resize-none px-2.5 py-2 text-xs" />
          )}
        </Field>
        <Field label="Tags (comma-separated)">
          {(id) => (
            <TagInput id={id} value={o.tags || []} onChange={(tags) => set({ tags })} placeholder="remote, ai, latam…" className={cn(control, 'font-mono')} />
          )}
        </Field>
        <div className="mt-1 flex items-center gap-2">
          <Chip size="sm" title="Where the radar found it">{sourceOf(o).label}</Chip>
          {o.sourceRef && (
            <a href={o.sourceRef} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-2xs text-muted-foreground transition-colors hover:text-foreground">
              <ExternalLink className="size-3" /> Source post
            </a>
          )}
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>
    </div>
  )
}
