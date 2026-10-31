import { londonDay, parseDt } from './dates'

/** A parsed VEVENT, JSON-safe so it can be persisted and expanded later for any week. */
export interface StoredEvent {
  uid: string
  calendar: string
  title: string
  location: string
  /** UTC instant (ms); all-day events use London midnight. */
  start: number
  allDay: boolean
  /** Length of a timed event. */
  durMs: number
  /** Length of an all-day event in days. */
  days: number
  rrule?: Record<string, string>
  exdates: number[]
  recurrenceId?: number
}

interface Prop {
  params: Record<string, string>
  value: string
}

const LINE_RE = /^([A-Za-z0-9-]+)((?:;[^:]*)*):(.*)$/

function unfold(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r\n|\n|\r/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1)
    else out.push(line)
  }
  return out
}

const unescapeText = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))

function parseParams(raw: string): Record<string, string> {
  const params: Record<string, string> = {}
  for (const kv of raw.split(';')) {
    const i = kv.indexOf('=')
    if (i > 0) params[kv.slice(0, i)] = kv.slice(i + 1)
  }
  return params
}

/** Parse one .ics file. Only properties directly inside VEVENT are read (not VALARM / VTIMEZONE). */
export function parseIcs(text: string, fallbackName: string, preferFallback = false): { name: string; events: StoredEvent[] } {
  let name = ''
  const raw: Record<string, Prop[]>[] = []
  const stack: string[] = []
  let cur: Record<string, Prop[]> | null = null

  for (const line of unfold(text)) {
    if (line.startsWith('BEGIN:')) {
      stack.push(line.slice(6))
      if (line === 'BEGIN:VEVENT') cur = {}
      continue
    }
    if (line.startsWith('END:')) {
      if (stack.pop() === 'VEVENT' && cur) {
        raw.push(cur)
        cur = null
      }
      continue
    }
    const m = LINE_RE.exec(line)
    if (!m) continue
    const prop = m[1].toUpperCase()
    if (stack.length === 1 && stack[0] === 'VCALENDAR' && prop === 'X-WR-CALNAME') {
      name = unescapeText(m[3])
    } else if (stack.length === 2 && stack[1] === 'VEVENT' && cur) {
      ;(cur[prop] ??= []).push({ params: parseParams(m[2]), value: m[3] })
    }
  }

  // Google exports can reuse one X-WR-CALNAME for different calendars (e.g. Birthdays), so a zip's
  // filename can take priority.
  const calendar = (preferFallback ? fallbackName : name) || fallbackName || name
  const events: StoredEvent[] = []
  for (const ev of raw) {
    const dtstart = ev.DTSTART?.[0]
    if (!dtstart) continue
    const start = parseDt(dtstart.params, dtstart.value)
    const dtend = ev.DTEND?.[0]
    const end = dtend ? parseDt(dtend.params, dtend.value) : null
    const rrule = ev.RRULE?.[0]

    events.push({
      uid: ev.UID?.[0]?.value ?? '',
      calendar,
      title: ev.SUMMARY ? unescapeText(ev.SUMMARY[0].value) : '(no title)',
      location: ev.LOCATION ? unescapeText(ev.LOCATION[0].value) : '',
      start: start.ms,
      allDay: start.allDay,
      durMs: !start.allDay && end ? end.ms - start.ms : 0,
      days: start.allDay ? (end ? Math.max(1, londonDay(end.ms) - londonDay(start.ms)) : 1) : 0,
      rrule: rrule ? Object.fromEntries(rrule.value.split(';').map((kv) => kv.split('=', 2) as [string, string])) : undefined,
      exdates: (ev.EXDATE ?? []).flatMap((p) => p.value.split(',').map((v) => parseDt(p.params, v).ms)),
      recurrenceId: ev['RECURRENCE-ID'] ? parseDt(ev['RECURRENCE-ID'][0].params, ev['RECURRENCE-ID'][0].value).ms : undefined,
    })
  }
  return { name: calendar, events }
}
