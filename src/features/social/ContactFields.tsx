import { Field } from '@/components/shared/Field'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { ALL_CATEGORIES, ALL_FIELDS, type Contact } from './contact-model'

interface ContactFieldsProps {
  contact: Contact
  onChange: (patch: Partial<Contact>) => void
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

function ChipGroup({ legend, options, value, onChange }: {
  legend: string
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <fieldset className="col-span-2 min-w-0 space-y-1 lg:col-span-3">
      <legend className="mb-1 text-xs text-muted-foreground">{legend}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <Chip key={option} size="sm" selectable selected={value.includes(option)} onClick={() => onChange(toggle(value, option))}>
            {option}
          </Chip>
        ))}
      </div>
    </fieldset>
  )
}

/** The personal contact editor. Two columns on compact cards, three on wide table rows. */
export function ContactFields({ contact: c, onChange }: ContactFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Field label="Name" className="col-span-2 lg:col-span-1">
        {(id) => <Input id={id} variant="inline" value={c.name} onChange={(e) => onChange({ name: e.target.value })} className="text-sm font-semibold" />}
      </Field>
      <Field label="Title">
        {(id) => <Input id={id} variant="inline" value={c.title} onChange={(e) => onChange({ title: e.target.value })} />}
      </Field>
      <Field label="Nickname">
        {(id) => <Input id={id} variant="inline" value={c.nickname} onChange={(e) => onChange({ nickname: e.target.value })} />}
      </Field>
      <Field label="Birthday">
        {(id) => <Input id={id} variant="inline" type="date" value={c.birthday} onChange={(e) => onChange({ birthday: e.target.value })} className="cursor-pointer font-mono" />}
      </Field>
      <Field label="Interval (days)">
        {(id) => <Input id={id} variant="inline" type="number" value={c.interval || ''} onChange={(e) => onChange({ interval: parseInt(e.target.value) || 0 })} className="font-mono tabular-nums" />}
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
      <Field label="Social profiles">
        {(id) => <Input id={id} variant="inline" value={c.socialProfiles} onChange={(e) => onChange({ socialProfiles: e.target.value })} />}
      </Field>
      <Field label="Address" className="col-span-2 lg:col-span-3">
        {(id) => <Input id={id} variant="inline" value={c.address} onChange={(e) => onChange({ address: e.target.value })} />}
      </Field>
      <ChipGroup legend="Categories" options={ALL_CATEGORIES} value={c.categories} onChange={(categories) => onChange({ categories })} />
      <ChipGroup legend="Fields" options={ALL_FIELDS} value={c.fields} onChange={(fields) => onChange({ fields })} />
    </div>
  )
}
