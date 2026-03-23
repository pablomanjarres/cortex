import { execFile, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface CalendarEvent {
  title: string
  startTime: string
  endTime: string
  calendar: string
  isAllDay: boolean
}

export interface BirthdayEntry {
  name: string
  birthday: string // YYYY-MM-DD
}

// ─── Swift-based calendar reader (fast, uses EventKit) ─────

const SWIFT_SOURCE = `
import EventKit
import Foundation

let store = EKEventStore()
let sem = DispatchSemaphore(value: 0)

if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { _, _ in sem.signal() }
} else {
    store.requestAccess(to: .event) { _, _ in sem.signal() }
}
sem.wait()

let cal = Calendar.current
let start = cal.startOfDay(for: Date())
let end = cal.date(byAdding: .day, value: 1, to: start)!
let pred = store.predicateForEvents(withStart: start, end: end, calendars: nil)
let events = store.events(matching: pred)

let fmt = DateFormatter()
fmt.dateFormat = "HH:mm"

for e in events.sorted(by: { $0.startDate < $1.startDate }) {
    let s = fmt.string(from: e.startDate)
    let f = fmt.string(from: e.endDate)
    let t = (e.title ?? "Untitled").replacingOccurrences(of: "|||", with: " ")
    let c = e.calendar.title.replacingOccurrences(of: "|||", with: " ")
    let a = e.isAllDay
    print("\\(t)|||\\(s)|||\\(f)|||\\(c)|||\\(a)")
}
`

let binaryPath: string | null = null

function ensureBinary(): string {
  if (binaryPath && fs.existsSync(binaryPath)) return binaryPath

  const dir = app.getPath('userData')
  const src = path.join(dir, 'cal-helper.swift')
  const bin = path.join(dir, 'cal-helper')

  // Recompile if source changed
  const existing = fs.existsSync(src) ? fs.readFileSync(src, 'utf-8') : ''
  if (existing !== SWIFT_SOURCE || !fs.existsSync(bin)) {
    fs.writeFileSync(src, SWIFT_SOURCE)
    try {
      execSync(`swiftc -O "${src}" -o "${bin}" -framework EventKit -framework Foundation`, { timeout: 30000 })
    } catch (e) {
      console.error('[Cortex] Failed to compile calendar helper:', e)
      return ''
    }
  }

  binaryPath = bin
  return bin
}

export function getTodayEvents(): Promise<CalendarEvent[]> {
  return new Promise((resolve) => {
    const bin = ensureBinary()
    if (!bin) { resolve([]); return }

    execFile(bin, [], { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[Cortex] Calendar error:', error.message, stderr)
        resolve([])
        return
      }

      try {
        const lines = stdout.trim().split('\n').filter(Boolean)
        const events: CalendarEvent[] = lines.map((line) => {
          const [title, startTime, endTime, calendar, isAllDayStr] = line.split('|||')
          return {
            title: title?.trim() || 'Untitled',
            startTime: startTime?.trim() || '00:00',
            endTime: endTime?.trim() || '00:00',
            calendar: calendar?.trim() || '',
            isAllDay: isAllDayStr?.trim() === 'true',
          }
        })
        resolve(events)
      } catch (e) {
        console.error('[Cortex] Calendar parse error:', e)
        resolve([])
      }
    })
  })
}

// ─── Birthday sync (still uses AppleScript for write operations) ─────

export function syncBirthdays(birthdays: BirthdayEntry[], calendarEmail?: string): Promise<{ created: number; skipped: number }> {
  if (birthdays.length === 0) return Promise.resolve({ created: 0, skipped: 0 })

  const eventBlocks = birthdays.map((b) => {
    const [year, month, day] = b.birthday.split('-').map(Number)
    const title = `Birthday: ${b.name}`
    return `
      set eventTitle to "${title.replace(/"/g, '\\"')}"
      set alreadyExists to false
      repeat with evt in (every event of targetCal whose summary is eventTitle)
        set alreadyExists to true
        exit repeat
      end repeat
      if not alreadyExists then
        set bdayDate to current date
        set year of bdayDate to ${year}
        set month of bdayDate to ${month}
        set day of bdayDate to ${day}
        set hours of bdayDate to 0
        set minutes of bdayDate to 0
        set seconds of bdayDate to 0
        set newEvent to make new event at end of events of targetCal with properties {summary:eventTitle, start date:bdayDate, allday event:true}
        set recurrence of newEvent to "FREQ=YEARLY"
        set createdCount to createdCount + 1
      else
        set skippedCount to skippedCount + 1
      end if`
  }).join('\n')

  const script = `
tell application "Calendar"
  set targetCal to missing value
  try
    set targetCal to calendar "${(calendarEmail || 'user@example.com').replace(/"/g, '\\"')}"
  end try
  if targetCal is missing value then
    set calNames to name of every calendar
    if "Birthdays (Cortex)" is not in calNames then
      set targetCal to make new calendar with properties {name:"Birthdays (Cortex)"}
    else
      set targetCal to calendar "Birthdays (Cortex)"
    end if
  end if
  set createdCount to 0
  set skippedCount to 0
${eventBlocks}
  return (createdCount as text) & "," & (skippedCount as text)
end tell`

  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Birthday sync error:', error.message, stderr)
        resolve({ created: 0, skipped: 0 })
        return
      }
      const [created, skipped] = stdout.trim().split(',').map(Number)
      console.log(`[Cortex] Birthday sync: ${created} created, ${skipped} skipped`)
      resolve({ created: created || 0, skipped: skipped || 0 })
    })
  })
}
