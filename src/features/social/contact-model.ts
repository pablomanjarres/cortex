// Personal contact model shared by the Social page and its record editor.

// ── Types ────────────────────────────────────────────────────────────────────

export type SortKey = 'name' | 'title' | 'birthday' | 'lastContact'

export interface Contact {
  id: string
  name: string
  title: string
  nickname: string
  categories: string[]
  fields: string[]
  followUp: boolean
  birthday: string
  phone: string
  lastContact: string
  interval: number
  email: string
  socialProfiles: string
  address: string
}

// ── Data ─────────────────────────────────────────────────────────────────────

export const DEFAULT_CONTACTS: Contact[] = []

export function withContactDefaults(contact: Partial<Contact> & Pick<Contact, 'id' | 'name'>): Contact {
  const savedFields = Object.fromEntries(Object.entries(contact).filter(([, value]) => value != null))
  return {
    title: '', nickname: '', followUp: false, birthday: '', phone: '',
    lastContact: '', interval: 0, email: '', socialProfiles: '', address: '',
    ...savedFields,
    id: contact.id,
    name: contact.name,
    categories: Array.isArray(contact.categories) ? contact.categories : [],
    fields: Array.isArray(contact.fields) ? contact.fields : [],
  } as Contact
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const ALL_CATEGORIES = ['Relative 👨‍👩‍👦', 'High Potential 🚀', 'Ally 🤝', 'Connector 🧠', 'Friend 😊', 'Acquaintance 👋', 'Routine Contact 🧺', 'Dormant 💤', 'Positive Rival 🥊', 'Mentor 🧓', 'Close Friend 🫂']

export const ALL_FIELDS = ['Tech', 'Business', 'Education', 'Health', 'Design', 'Law', 'Gastronomy', 'Music', 'Industry', 'Media', 'Construction', 'Fin']

export function daysUntilBirthday(bday: string, today = new Date()): number | null {
  if (!bday) return null
  const birth = new Date(bday)
  const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
  if (next < today) next.setFullYear(next.getFullYear() + 1)
  return Math.ceil((next.getTime() - today.getTime()) / 86_400_000)
}

export function calcAge(bday: string, today = new Date()): number | null {
  if (!bday) return null
  const birth = new Date(bday)
  let age = today.getFullYear() - birth.getFullYear()
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--
  return age
}

export function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Contacts whose birthday falls within the next `withinDays` days, soonest first. */
export function upcomingBirthdays(contacts: Contact[], withinDays = 30, today = new Date()): Contact[] {
  return contacts
    .filter((c) => c.birthday && daysUntilBirthday(c.birthday, today)! <= withinDays)
    .sort((a, b) => daysUntilBirthday(a.birthday, today)! - daysUntilBirthday(b.birthday, today)!)
}

/** Days past the contact's follow-up interval; null when no interval or last contact is set. */
export function daysOverdue(contact: Contact, now: number): number | null {
  if (!contact.lastContact || !contact.interval) return null
  return Math.ceil((now - new Date(contact.lastContact).getTime()) / 86_400_000) - contact.interval
}

/** Contacts past their follow-up interval, most overdue first. */
export function contactsToReachOut(contacts: Contact[], now: number): Contact[] {
  return contacts
    .filter((c) => (daysOverdue(c, now) ?? 0) > 0)
    .sort((a, b) => daysOverdue(b, now)! - daysOverdue(a, now)!)
}
