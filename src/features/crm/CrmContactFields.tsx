import { KnowledgeLink } from '@/components/shared/KnowledgeLink'
import { recordRefs } from '@/lib/knowledge'
import { Trash2 } from 'lucide-react'
import { Field } from '@/components/shared/Field'
import { TagInput } from '@/components/shared/TagInput'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ALL_STATUSES, statusConfig, type CrmContact, type CrmStatus } from './crm-model'

interface CrmContactFieldsProps {
  contact: CrmContact
  onChange: (patch: Partial<CrmContact>) => void
}

export function CrmStatusChip({ status, className }: { status: CrmStatus; className?: string }) {
  return <Chip size="sm" variant={statusConfig[status].chip} className={className}>{statusConfig[status].label}</Chip>
}

/** The expanded record on both the mobile card and the desktop row: its fields and its delete action. */
export function CrmContactEditor({ contact, onChange, onDelete }: CrmContactFieldsProps & { onDelete: () => void }) {
  return (
    <>
      <CrmContactFields contact={contact} onChange={onChange} />
      <div className="flex flex-wrap items-center justify-end gap-2 pt-4">
        <KnowledgeLink cortexRef={recordRefs.crm(contact.id)} />
        <Button variant="destructive" size="sm" className="w-full md:w-auto" onClick={onDelete}>
          <Trash2 /> Delete contact
        </Button>
      </div>
    </>
  )
}

/** The CRM contact editor. Two columns on compact cards, three on wide table rows. */
export function CrmContactFields({ contact: c, onChange }: CrmContactFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Field label="Name" className="col-span-2 lg:col-span-1">
        {(id) => <Input id={id} variant="inline" value={c.name} onChange={(e) => onChange({ name: e.target.value })} className="text-sm font-semibold" />}
      </Field>
      <Field label="Company">
        {(id) => <Input id={id} variant="inline" value={c.company} onChange={(e) => onChange({ company: e.target.value })} />}
      </Field>
      <Field label="Role">
        {(id) => <Input id={id} variant="inline" value={c.role} onChange={(e) => onChange({ role: e.target.value })} />}
      </Field>
      <Field label="Status">
        {(id) => (
          <Select id={id} variant="inline" value={c.status} onChange={(e) => onChange({ status: e.target.value as CrmStatus })}>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Deal value">
        {(id) => <Input id={id} variant="inline" type="number" value={c.value || ''} onChange={(e) => onChange({ value: parseInt(e.target.value) || 0 })} className="font-mono tabular-nums" />}
      </Field>
      <Field label="Last contact">
        {(id) => <Input id={id} variant="inline" type="date" value={c.lastContact} onChange={(e) => onChange({ lastContact: e.target.value })} className="cursor-pointer font-mono" />}
      </Field>
      <Field label="Phone">
        {(id) => <Input id={id} variant="inline" type="tel" value={c.phone} onChange={(e) => onChange({ phone: e.target.value })} className="font-mono" />}
      </Field>
      <Field label="Email">
        {(id) => <Input id={id} variant="inline" type="email" value={c.email} onChange={(e) => onChange({ email: e.target.value })} />}
      </Field>
      <Field label="Website">
        {(id) => <Input id={id} variant="inline" type="url" value={c.website} onChange={(e) => onChange({ website: e.target.value })} className="font-mono" />}
      </Field>
      <Field label="Notes" className="col-span-2">
        {(id) => <Textarea id={id} value={c.notes} onChange={(e) => onChange({ notes: e.target.value })} rows={3} className="min-h-0 resize-none text-xs" placeholder="Notes about this contact..." />}
      </Field>
      <Field label="Tags" hint="Separate tags with commas." className="col-span-2 lg:col-span-1">
        {(id) => <TagInput id={id} variant="inline" value={c.tags} onChange={(tags) => onChange({ tags })} placeholder="vip, priority, follow-up..." />}
      </Field>
    </div>
  )
}
