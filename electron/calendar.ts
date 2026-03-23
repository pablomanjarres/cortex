import { execFile } from 'child_process'

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

const APPLESCRIPT = `
tell application "Calendar"
    set today to current date
    set hours of today to 0
    set minutes of today to 0
    set seconds of today to 0
    set tomorrow to today + (1 * days)

    set output to ""
    repeat with cal in calendars
        set calName to name of cal
        set evts to (every event of cal whose start date ≥ today and start date < tomorrow)
        repeat with evt in evts
            set evtTitle to summary of evt
            set evtStart to start date of evt
            set evtEnd to end date of evt
            set evtAllDay to allday event of evt

            set h1 to text -2 thru -1 of ("0" & (hours of evtStart))
            set m1 to text -2 thru -1 of ("0" & (minutes of evtStart))
            set h2 to text -2 thru -1 of ("0" & (hours of evtEnd))
            set m2 to text -2 thru -1 of ("0" & (minutes of evtEnd))

            set output to output & evtTitle & "|||" & h1 & ":" & m1 & "|||" & h2 & ":" & m2 & "|||" & calName & "|||" & evtAllDay & linefeed
        end repeat
    end repeat
    return output
end tell
`

/**
 * Sync birthday events to Calendar.app.
 * Creates all-day recurring yearly events on each contact's birthday.
 * Skips contacts that already have a "Birthday: Name" event.
 */
export function syncBirthdays(birthdays: BirthdayEntry[]): Promise<{ created: number; skipped: number }> {
  if (birthdays.length === 0) return Promise.resolve({ created: 0, skipped: 0 })

  // Build AppleScript that creates birthday events
  const eventBlocks = birthdays.map((b) => {
    const [year, month, day] = b.birthday.split('-').map(Number)
    const title = `Birthday: ${b.name}`
    // AppleScript uses 1-indexed months, date constructor
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

  // Target a Google-synced calendar so events appear on iPhone/iPad/all devices
  // Falls back to creating a local calendar if Google calendar not found
  const script = `
tell application "Calendar"
  set targetCal to missing value
  -- Try Google calendar first (syncs across devices)
  try
    set targetCal to calendar "andresmanjarresneg@gmail.com"
  end try
  -- Fallback to local Birthdays (Cortex) calendar
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

export function getTodayEvents(): Promise<CalendarEvent[]> {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', APPLESCRIPT], { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Calendar error:', error.message, stderr)
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
        events.sort((a, b) => a.startTime.localeCompare(b.startTime))
        resolve(events)
      } catch (e) {
        console.error('Calendar parse error:', e)
        resolve([])
      }
    })
  })
}
