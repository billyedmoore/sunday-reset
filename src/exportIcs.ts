import { fromDayNum, wallToInstant } from './ical/dates'
import { GROUP_LABEL, groupOf, type Group } from './settings'
import { formatDuration, type Task } from './tasks'

export interface IcsOptions {
  calendarName: string
  /** Hex colour, written as `X-APPLE-CALENDAR-COLOR` (Google ignores colour in imports; this is for Apple). */
  color: string
  /** London day number of the week's Monday. */
  weekStart: number
  reminderMins: number
  busy: boolean
  /** Export time in ms; a parameter so output is reproducible in tests. */
  now?: number
}

/** Tasks that have a place on the calendar, split by the calendar they'll be imported into. */
export function exportableTasks(tasks: Task[], group: Group): Task[] {
  return tasks.filter((t) => t.slot && groupOf(t) === group)
}

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

const encoder = new TextEncoder()

/** RFC 5545 line folding: at most 75 octets a line, never splitting a multi-byte character. */
export function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let bytes = 0
  let limit = 75
  for (const ch of line) {
    const n = encoder.encode(ch).length
    if (bytes + n > limit) {
      parts.push(cur)
      cur = ''
      bytes = 0
      limit = 74 // continuation lines start with a space
    }
    cur += ch
    bytes += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

/**
 * Build an iCalendar file for tasks that have a slot. Times are written in UTC, so no timezone block is
 * needed. Each event has a stable UID (the task id) and an increasing SEQUENCE, so importing the same
 * week again should update the events rather than add copies.
 */
export function buildIcs(tasks: Task[], o: IcsOptions): string {
  const now = o.now ?? Date.now()
  const sequence = Math.floor((now - Date.UTC(2020, 0, 1)) / 1000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sunday Reset//Weekly planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(o.calendarName)}`,
    `X-APPLE-CALENDAR-COLOR:${o.color.toUpperCase()}`,
  ]

  for (const t of tasks) {
    if (!t.slot) continue
    const { y, m, d } = fromDayNum(o.weekStart + t.slot.day)
    const start = wallToInstant(y, m, d, Math.floor(t.slot.startMin / 60), t.slot.startMin % 60)
    const end = start + t.mins * 60_000
    const note = `${formatDuration(t.mins)} · planned with Sunday Reset${t.slot.forced ? '\nOverlaps another event.' : ''}`
    lines.push(
      'BEGIN:VEVENT',
      `UID:sr-${t.id}@sundayreset`,
      `DTSTAMP:${stamp(now)}`,
      `LAST-MODIFIED:${stamp(now)}`,
      `SEQUENCE:${sequence}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(t.title)}`,
      `DESCRIPTION:${escapeText(note)}`,
      'STATUS:CONFIRMED',
      `TRANSP:${o.busy ? 'OPAQUE' : 'TRANSPARENT'}`,
    )
    if (o.reminderMins > 0) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${o.reminderMins}M`, 'DESCRIPTION:Reminder', 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function icsFilename(group: Group, weekStart: number): string {
  const { y, m, d } = fromDayNum(weekStart)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `sunday-reset-${GROUP_LABEL[group].toLowerCase().replace(/ /g, '-')}-${y}-${pad(m)}-${pad(d)}.ics`
}
