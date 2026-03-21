import { execFile } from 'child_process'

export interface CalendarEvent {
  title: string
  startTime: string
  endTime: string
  calendar: string
  isAllDay: boolean
}

export function getTodayEvents(): Promise<CalendarEvent[]> {
  const script = `
    use AppleScript version "2.4"
    use scripting additions
    use framework "Foundation"
    use framework "EventKit"

    set eventStore to current application's EKEventStore's alloc()'s init()

    -- Request access synchronously via semaphore
    set sema to current application's dispatch_semaphore_create(0)
    set accessGranted to false
    eventStore's requestFullAccessToEventsWithCompletion:(do shell script "")

    -- Fallback: use requestAccessToEntityType for older macOS
    set theResult to missing value
    eventStore's requestAccessToEntityType:0 completion:(do shell script "")

    -- Use a simpler approach: just try to fetch events
    set now to current application's NSDate's |date|()
    set cal to current application's NSCalendar's currentCalendar()

    set startOfDay to cal's startOfDayForDate:now
    set endOfDay to startOfDay's dateByAddingTimeInterval:(86400)

    set predicate to eventStore's predicateForEventsWithStartDate:startOfDay endDate:endOfDay calendars:(missing value)
    set events to eventStore's eventsMatchingPredicate:predicate

    set output to ""
    repeat with i from 0 to ((events's |count|()) - 1)
      set evt to (events's objectAtIndex:i)
      set evtTitle to (evt's title()) as text
      set evtStart to ((evt's startDate())'s description()) as text
      set evtEnd to ((evt's endDate())'s description()) as text
      set evtCal to ((evt's calendar())'s title()) as text
      set evtAllDay to (evt's isAllDay()) as boolean
      set output to output & evtTitle & "|||" & evtStart & "|||" & evtEnd & "|||" & evtCal & "|||" & evtAllDay & linefeed
    end repeat

    return output
  `

  // Simpler approach: use JXA (JavaScript for Automation) which is more reliable
  const jxaScript = `
    ObjC.import('EventKit');
    ObjC.import('Foundation');

    const store = $.EKEventStore.alloc.init;

    // Request access (blocking with a run loop)
    let granted = false;
    let done = false;
    store.requestFullAccessToEventsWithCompletion((g, err) => {
      granted = g;
      done = true;
    });

    // Spin until callback fires
    const rl = $.NSRunLoop.currentRunLoop;
    while (!done) {
      rl.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));
    }

    if (!granted) {
      // Try legacy API for older macOS
      done = false;
      store.requestAccessToEntityTypeCompletion(0, (g, err) => {
        granted = g;
        done = true;
      });
      while (!done) {
        rl.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));
      }
    }

    const now = $.NSDate.date;
    const cal = $.NSCalendar.currentCalendar;
    const startOfDay = cal.startOfDayForDate(now);
    const endOfDay = startOfDay.dateByAddingTimeInterval(86400);
    const predicate = store.predicateForEventsWithStartDateEndDateCalendars(startOfDay, endOfDay, null);
    const events = store.eventsMatchingPredicate(predicate);

    const formatter = $.NSDateFormatter.alloc.init;
    formatter.dateFormat = "HH:mm";
    formatter.timeZone = $.NSTimeZone.localTimeZone;

    const isoFormatter = $.NSDateFormatter.alloc.init;
    isoFormatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZZZZZ";
    isoFormatter.timeZone = $.NSTimeZone.localTimeZone;

    const results = [];
    for (let i = 0; i < events.count; i++) {
      const evt = events.objectAtIndex(i);
      results.push({
        title: ObjC.unwrap(evt.title),
        startTime: ObjC.unwrap(formatter.stringFromDate(evt.startDate)),
        endTime: ObjC.unwrap(formatter.stringFromDate(evt.endDate)),
        startISO: ObjC.unwrap(isoFormatter.stringFromDate(evt.startDate)),
        endISO: ObjC.unwrap(isoFormatter.stringFromDate(evt.endDate)),
        calendar: ObjC.unwrap(evt.calendar.title),
        isAllDay: evt.isAllDay
      });
    }

    // Sort by start time
    results.sort((a, b) => a.startTime.localeCompare(b.startTime));

    JSON.stringify(results);
  `

  return new Promise((resolve, reject) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', jxaScript], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Calendar error:', error.message, stderr)
        resolve([])
        return
      }

      try {
        const raw = stdout.trim()
        if (!raw) {
          resolve([])
          return
        }
        const events: CalendarEvent[] = JSON.parse(raw)
        resolve(events)
      } catch (e) {
        console.error('Calendar parse error:', e)
        resolve([])
      }
    })
  })
}
