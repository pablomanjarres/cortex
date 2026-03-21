import { execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export interface CalendarEvent {
  title: string
  startTime: string
  endTime: string
  calendar: string
  isAllDay: boolean
}

// Swift helper that properly handles EventKit permissions
const SWIFT_HELPER = `
import EventKit
import Foundation

let store = EKEventStore()
let semaphore = DispatchSemaphore(value: 0)
var accessGranted = false

if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { granted, error in
        accessGranted = granted
        semaphore.signal()
    }
} else {
    store.requestAccess(to: .event) { granted, error in
        accessGranted = granted
        semaphore.signal()
    }
}

semaphore.wait()

guard accessGranted else {
    print("[]")
    exit(0)
}

let calendar = Calendar.current
let startOfDay = calendar.startOfDay(for: Date())
let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!

let predicate = store.predicateForEvents(withStart: startOfDay, end: endOfDay, calendars: nil)
let events = store.events(matching: predicate)

let formatter = DateFormatter()
formatter.dateFormat = "HH:mm"

var results: [[String: Any]] = []
for event in events {
    results.append([
        "title": event.title ?? "Untitled",
        "startTime": formatter.string(from: event.startDate),
        "endTime": formatter.string(from: event.endDate),
        "calendar": event.calendar.title,
        "isAllDay": event.isAllDay
    ])
}

results.sort { ($0["startTime"] as? String ?? "") < ($1["startTime"] as? String ?? "") }

if let data = try? JSONSerialization.data(withJSONObject: results),
   let json = String(data: data, encoding: .utf8) {
    print(json)
} else {
    print("[]")
}
`

let helperPath: string | null = null

function getHelperPath(): string {
  if (helperPath && fs.existsSync(helperPath)) return helperPath

  const userDataPath = app.getPath('userData')
  const swiftFile = path.join(userDataPath, 'calendar-helper.swift')
  const binaryFile = path.join(userDataPath, 'calendar-helper')

  // Write swift source if not exists or outdated
  const currentSource = fs.existsSync(swiftFile) ? fs.readFileSync(swiftFile, 'utf-8') : ''
  if (currentSource !== SWIFT_HELPER) {
    fs.writeFileSync(swiftFile, SWIFT_HELPER)
    // Compile
    try {
      require('child_process').execSync(
        `swiftc -O "${swiftFile}" -o "${binaryFile}" -framework EventKit -framework Foundation`,
        { timeout: 30000 }
      )
    } catch (e) {
      console.error('Failed to compile calendar helper:', e)
      return ''
    }
  }

  if (fs.existsSync(binaryFile)) {
    helperPath = binaryFile
    return binaryFile
  }

  return ''
}

export function getTodayEvents(): Promise<CalendarEvent[]> {
  return new Promise((resolve) => {
    const binary = getHelperPath()
    if (!binary) {
      resolve([])
      return
    }

    execFile(binary, [], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Calendar helper error:', error.message, stderr)
        resolve([])
        return
      }

      try {
        const raw = stdout.trim()
        if (!raw) { resolve([]); return }
        const events: CalendarEvent[] = JSON.parse(raw)
        resolve(events)
      } catch (e) {
        console.error('Calendar parse error:', e)
        resolve([])
      }
    })
  })
}
