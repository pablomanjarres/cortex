import { Field } from '@/components/shared/Field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ALL_GENRES, ALL_SCORES, ALL_STATUSES, type Book, type Score, type Status } from './book-model'

interface BookFieldsProps {
  book: Book
  onChange: (patch: Partial<Book>) => void
}

/** The book editor. Two columns on compact cards, three on wide table rows. */
export function BookFields({ book, onChange }: BookFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Field label="Title" className="col-span-2 lg:col-span-1">
        {(id) => <Input id={id} variant="inline" value={book.title} onChange={(e) => onChange({ title: e.target.value })} className="text-sm font-semibold" />}
      </Field>
      <Field label="Author" className="col-span-2 lg:col-span-1">
        {(id) => <Input id={id} variant="inline" value={book.author} onChange={(e) => onChange({ author: e.target.value })} />}
      </Field>
      <Field label="Genre" className="col-span-2 lg:col-span-1">
        {(id) => (
          <Select id={id} variant="inline" value={book.genre} onChange={(e) => onChange({ genre: e.target.value })}>
            <option value="">None</option>
            {ALL_GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Status">
        {(id) => (
          <Select id={id} variant="inline" value={book.status} onChange={(e) => onChange({ status: e.target.value as Status })}>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Score">
        {(id) => (
          <Select id={id} variant="inline" value={book.score} onChange={(e) => onChange({ score: e.target.value as Score })}>
            {ALL_SCORES.map((s) => <option key={s} value={s}>{s || 'No rating'}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Start date">
        {(id) => <Input id={id} variant="inline" type="date" value={book.start} onChange={(e) => onChange({ start: e.target.value })} className="cursor-pointer font-mono" />}
      </Field>
      <Field label="Finished">
        {(id) => <Input id={id} variant="inline" type="date" value={book.finished} onChange={(e) => onChange({ finished: e.target.value })} className="cursor-pointer font-mono" />}
      </Field>
      <Field label="Notes" className="col-span-2">
        {(id) => <Textarea id={id} value={book.notes} onChange={(e) => onChange({ notes: e.target.value })} rows={3} className="min-h-0 resize-none text-xs" placeholder="Your thoughts on this book..." />}
      </Field>
    </div>
  )
}
