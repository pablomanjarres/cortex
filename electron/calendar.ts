import { execFile, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id?: string
  title: string
  startTime: string
  endTime: string
  calendar: string
  isAllDay: boolean
}

export interface CalendarEventFull {
  id: string
  title: string
  startDate: string   // ISO8601
  endDate: string     // ISO8601
  calendar: string
  isAllDay: boolean
  notes: string
  lastModified: string // ISO8601
  recurrence: string
}

export interface CreateEventPayload {
  title: string
  startDate: string   // ISO8601 or YYYY-MM-DD for all-day
  endDate?: string     // ISO8601 or YYYY-MM-DD for all-day
  isAllDay: boolean
  calendar?: string    // calendar title to target
  notes?: string
  recurrence?: string  // e.g. "FREQ=YEARLY"
}

export interface BirthdayEntry {
  name: string
  birthday: string // YYYY-MM-DD
}

// ─── Swift-based calendar helper (EventKit CRUD) ──────────────────────────────

const SWIFT_SOURCE = `
import EventKit
import Foundation

// ─── Helpers ──────────────────────────────────────────────────────

let store = EKEventStore()
let sem = DispatchSemaphore(value: 0)

if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { _, _ in sem.signal() }
} else {
    store.requestAccess(to: .event) { _, _ in sem.signal() }
}
sem.wait()

let isoFmt = ISO8601DateFormatter()
isoFmt.formatOptions = [.withInternetDateTime]

let dayFmt = DateFormatter()
dayFmt.dateFormat = "yyyy-MM-dd"
dayFmt.timeZone = TimeZone.current

let timeFmt = DateFormatter()
timeFmt.dateFormat = "HH:mm"

func parseDate(_ s: String) -> Date? {
    return isoFmt.date(from: s) ?? dayFmt.date(from: s)
}

func jsonString(_ s: String) -> String {
    let escaped = s
        .replacingOccurrences(of: "\\\\", with: "\\\\\\\\")
        .replacingOccurrences(of: "\\"", with: "\\\\\\"")
        .replacingOccurrences(of: "\\n", with: "\\\\n")
        .replacingOccurrences(of: "\\r", with: "\\\\r")
        .replacingOccurrences(of: "\\t", with: "\\\\t")
    return "\\"\\(escaped)\\""
}

func eventToJson(_ e: EKEvent) -> String {
    let id = e.calendarItemIdentifier ?? ""
    let title = e.title ?? "Untitled"
    let startISO = isoFmt.string(from: e.startDate)
    let endISO = isoFmt.string(from: e.endDate)
    let cal = e.calendar.title
    let notes = e.notes ?? ""
    let lastMod = e.lastModifiedDate != nil ? isoFmt.string(from: e.lastModifiedDate!) : ""
    var recur = ""
    if let rules = e.recurrenceRules, let rule = rules.first {
        switch rule.frequency {
        case .daily: recur = "FREQ=DAILY"
        case .weekly: recur = "FREQ=WEEKLY"
        case .monthly: recur = "FREQ=MONTHLY"
        case .yearly: recur = "FREQ=YEARLY"
        @unknown default: recur = ""
        }
    }
    return "{" +
        "\\"id\\":\\(jsonString(id))," +
        "\\"title\\":\\(jsonString(title))," +
        "\\"startDate\\":\\(jsonString(startISO))," +
        "\\"endDate\\":\\(jsonString(endISO))," +
        "\\"calendar\\":\\(jsonString(cal))," +
        "\\"isAllDay\\":\\(e.isAllDay)," +
        "\\"notes\\":\\(jsonString(notes))," +
        "\\"lastModified\\":\\(jsonString(lastMod))," +
        "\\"recurrence\\":\\(jsonString(recur))" +
    "}"
}

func findCalendar(_ title: String) -> EKCalendar? {
    return store.calendars(for: .event).first { $0.title == title }
}

func readJsonFromStdin() -> [String: Any]? {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    return json
}

// ─── Commands ─────────────────────────────────────────────────────

let args = CommandLine.arguments
let command = args.count > 1 ? args[1] : "read-today"

switch command {

case "read-today":
    let cal = Calendar.current
    let start = cal.startOfDay(for: Date())
    let end = cal.date(byAdding: .day, value: 1, to: start)!
    let pred = store.predicateForEvents(withStart: start, end: end, calendars: nil)
    let events = store.events(matching: pred).sorted { $0.startDate < $1.startDate }
    // Legacy format for backward compatibility + JSON with IDs
    let jsonEvents = events.map { eventToJson($0) }
    print("[\\(jsonEvents.joined(separator: ","))]")

case "create":
    guard let input = readJsonFromStdin() else {
        print("{\\"success\\":false,\\"error\\":\\"Invalid JSON input\\"}")
        exit(1)
    }
    let title = input["title"] as? String ?? "Untitled"
    let isAllDay = input["isAllDay"] as? Bool ?? true
    let notes = input["notes"] as? String ?? ""
    let recurrence = input["recurrence"] as? String
    let calTitle = input["calendar"] as? String

    guard let startStr = input["startDate"] as? String, let startDate = parseDate(startStr) else {
        print("{\\"success\\":false,\\"error\\":\\"Invalid startDate\\"}")
        exit(1)
    }
    let endDate: Date
    if let endStr = input["endDate"] as? String, let d = parseDate(endStr) {
        endDate = d
    } else if isAllDay {
        endDate = Calendar.current.date(byAdding: .day, value: 1, to: startDate)!
    } else {
        endDate = Calendar.current.date(byAdding: .hour, value: 1, to: startDate)!
    }

    let event = EKEvent(eventStore: store)
    event.title = title
    event.startDate = startDate
    event.endDate = endDate
    event.isAllDay = isAllDay
    event.notes = notes

    if let calTitle = calTitle, let targetCal = findCalendar(calTitle) {
        event.calendar = targetCal
    } else {
        event.calendar = store.defaultCalendarForNewEvents
    }

    if let recurrence = recurrence {
        var freq: EKRecurrenceFrequency = .yearly
        if recurrence.contains("DAILY") { freq = .daily }
        else if recurrence.contains("WEEKLY") { freq = .weekly }
        else if recurrence.contains("MONTHLY") { freq = .monthly }
        event.addRecurrenceRule(EKRecurrenceRule(recurrenceWith: freq, interval: 1, end: nil))
    }

    do {
        try store.save(event, span: .thisEvent)
        let id = event.calendarItemIdentifier ?? ""
        print("{\\"success\\":true,\\"id\\":\\(jsonString(id))}")
    } catch {
        print("{\\"success\\":false,\\"error\\":\\(jsonString(error.localizedDescription))}")
        exit(1)
    }

case "update":
    guard args.count > 2 else {
        print("{\\"success\\":false,\\"error\\":\\"Missing event ID\\"}")
        exit(1)
    }
    let eventId = args[2]
    guard let event = store.calendarItem(withIdentifier: eventId) as? EKEvent else {
        print("{\\"success\\":false,\\"error\\":\\"Event not found\\"}")
        exit(1)
    }
    guard let input = readJsonFromStdin() else {
        print("{\\"success\\":false,\\"error\\":\\"Invalid JSON input\\"}")
        exit(1)
    }

    if let title = input["title"] as? String { event.title = title }
    if let notes = input["notes"] as? String { event.notes = notes }
    if let isAllDay = input["isAllDay"] as? Bool { event.isAllDay = isAllDay }
    if let startStr = input["startDate"] as? String, let d = parseDate(startStr) { event.startDate = d }
    if let endStr = input["endDate"] as? String, let d = parseDate(endStr) {
        event.endDate = d
    } else if let startStr = input["startDate"] as? String, let d = parseDate(startStr) {
        if event.isAllDay {
            event.endDate = Calendar.current.date(byAdding: .day, value: 1, to: d)!
        } else {
            event.endDate = Calendar.current.date(byAdding: .hour, value: 1, to: d)!
        }
    }

    do {
        try store.save(event, span: .thisEvent)
        print("{\\"success\\":true}")
    } catch {
        print("{\\"success\\":false,\\"error\\":\\(jsonString(error.localizedDescription))}")
        exit(1)
    }

case "delete":
    guard args.count > 2 else {
        print("{\\"success\\":false,\\"error\\":\\"Missing event ID\\"}")
        exit(1)
    }
    let eventId = args[2]
    guard let event = store.calendarItem(withIdentifier: eventId) as? EKEvent else {
        print("{\\"success\\":false,\\"error\\":\\"Event not found\\"}")
        exit(1)
    }
    do {
        try store.remove(event, span: .thisEvent)
        print("{\\"success\\":true}")
    } catch {
        print("{\\"success\\":false,\\"error\\":\\(jsonString(error.localizedDescription))}")
        exit(1)
    }

case "read-range":
    guard args.count > 3,
          let start = parseDate(args[2]),
          let end = parseDate(args[3]) else {
        print("[]")
        exit(1)
    }
    let pred = store.predicateForEvents(withStart: start, end: end, calendars: nil)
    let events = store.events(matching: pred).sorted { $0.startDate < $1.startDate }
    let jsonEvents = events.map { eventToJson($0) }
    print("[\\(jsonEvents.joined(separator: ","))]")

case "get":
    guard args.count > 2 else {
        print("{\\"error\\":\\"Missing event ID\\"}")
        exit(1)
    }
    let eventId = args[2]
    if let event = store.calendarItem(withIdentifier: eventId) as? EKEvent {
        print(eventToJson(event))
    } else {
        print("{\\"error\\":\\"Event not found\\"}")
        exit(1)
    }

default:
    print("{\\"error\\":\\"Unknown command: \\(command)\\"}")
    exit(1)
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
      execSync(`swiftc -O "${src}" -o "${bin}" -framework EventKit -framework Foundation`, { timeout: 60000 })
    } catch (e) {
      console.error('[Cortex] Failed to compile calendar helper:', e)
      return ''
    }
  }

  binaryPath = bin
  return bin
}

// ─── Helper: run binary with command + optional stdin ─────────────────────────

function runCalHelper(args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = ensureBinary()
    if (!bin) { reject(new Error('Calendar helper not available')); return }

    const child = execFile(bin, args, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Cortex] Calendar helper error (${args[0]}):`, error.message, stderr)
        reject(error)
        return
      }
      resolve(stdout.trim())
    })

    if (stdin && child.stdin) {
      child.stdin.write(stdin)
      child.stdin.end()
    }
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getTodayEvents(): Promise<CalendarEvent[]> {
  return runCalHelper(['read-today']).then((stdout) => {
    try {
      const events: CalendarEventFull[] = JSON.parse(stdout)
      return events.map((e) => ({
        id: e.id,
        title: e.title,
        startTime: e.startDate.includes('T') ? e.startDate.slice(11, 16) : '00:00',
        endTime: e.endDate.includes('T') ? e.endDate.slice(11, 16) : '00:00',
        calendar: e.calendar,
        isAllDay: e.isAllDay,
      }))
    } catch (e) {
      console.error('[Cortex] Calendar parse error:', e)
      return []
    }
  }).catch(() => [])
}

export function createCalendarEvent(payload: CreateEventPayload): Promise<{ id: string; success: boolean }> {
  const input = JSON.stringify(payload)
  return runCalHelper(['create'], input).then((stdout) => {
    const result = JSON.parse(stdout)
    return { id: result.id || '', success: result.success === true }
  }).catch((e) => {
    console.error('[Cortex] Create event error:', e)
    return { id: '', success: false }
  })
}

export function updateCalendarEvent(eventId: string, payload: Partial<CreateEventPayload>): Promise<{ success: boolean }> {
  const input = JSON.stringify(payload)
  return runCalHelper(['update', eventId], input).then((stdout) => {
    const result = JSON.parse(stdout)
    return { success: result.success === true }
  }).catch((e) => {
    console.error('[Cortex] Update event error:', e)
    return { success: false }
  })
}

export function deleteCalendarEvent(eventId: string): Promise<{ success: boolean }> {
  return runCalHelper(['delete', eventId]).then((stdout) => {
    const result = JSON.parse(stdout)
    return { success: result.success === true }
  }).catch((e) => {
    console.error('[Cortex] Delete event error:', e)
    return { success: false }
  })
}

export function getEventsInRange(start: string, end: string): Promise<CalendarEventFull[]> {
  return runCalHelper(['read-range', start, end]).then((stdout) => {
    return JSON.parse(stdout) as CalendarEventFull[]
  }).catch((e) => {
    console.error('[Cortex] Read range error:', e)
    return []
  })
}

export function getCalendarEvent(eventId: string): Promise<CalendarEventFull | null> {
  return runCalHelper(['get', eventId]).then((stdout) => {
    const result = JSON.parse(stdout)
    if (result.error) return null
    return result as CalendarEventFull
  }).catch(() => null)
}

// ─── Birthday sync (legacy AppleScript — kept for fallback) ───────────────────

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
