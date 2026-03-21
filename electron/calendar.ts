import { execFile } from 'child_process'

export interface CalendarEvent {
  title: string
  startTime: string
  endTime: string
  calendar: string
  isAllDay: boolean
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
