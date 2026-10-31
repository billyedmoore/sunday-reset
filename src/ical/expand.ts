import { londonDay, midnightOf, zonedParts } from './dates'
import type { StoredEvent } from './parse'
import { occurrenceStarts } from './recur'

export interface Occurrence {
  id: string
  title: string
  location: string
  calendar: string
  start: number
  end: number
  allDay: boolean
}

/** Every occurrence overlapping [winStart, winEnd), with recurrence overrides and EXDATEs applied. */
export function eventsBetween(events: StoredEvent[], winStart: number, winEnd: number): Occurrence[] {
  const overridden = new Set<string>()
  for (const ev of events) {
    if (ev.recurrenceId !== undefined) overridden.add(`${ev.calendar}|${ev.uid}|${ev.recurrenceId}`)
  }

  const endDay = londonDay(winEnd)
  const out: Occurrence[] = []
  for (const ev of events) {
    const exdates = new Set(ev.exdates)
    const isOverride = ev.recurrenceId !== undefined
    for (const s of occurrenceStarts(ev, endDay)) {
      if (exdates.has(s) || (!isOverride && overridden.has(`${ev.calendar}|${ev.uid}|${s}`))) continue
      const e = ev.allDay ? midnightOf(londonDay(s) + ev.days) : s + ev.durMs
      if (s < winEnd && (e > s ? e > winStart : s >= winStart)) {
        out.push({ id: `${ev.calendar}|${ev.uid}|${s}`, title: ev.title, location: ev.location, calendar: ev.calendar, start: s, end: e, allDay: ev.allDay })
      }
    }
  }
  return out.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title))
}

/** One occurrence's slice on a single day; minutes are wall-clock minutes from midnight. */
export interface Segment {
  occ: Occurrence
  /** London day number. */
  day: number
  startMin: number
  endMin: number
  /** Covers the whole day (all-day events and middle days of a multi-day event). */
  wholeDay: boolean
  continuesBefore: boolean
  continuesAfter: boolean
}

const minutesOf = (ms: number) => {
  const p = zonedParts(ms)
  return p.h * 60 + p.mi
}

/** Split occurrences into per-day segments for days in [firstDay, firstDay + nDays). */
export function splitByDay(occs: Occurrence[], firstDay: number, nDays: number): Segment[] {
  const segs: Segment[] = []
  for (const occ of occs) {
    const first = londonDay(occ.start)
    const last = londonDay(occ.end > occ.start ? occ.end - 1 : occ.start)
    for (let day = Math.max(first, firstDay); day <= last && day < firstDay + nDays; day++) {
      if (occ.allDay) {
        segs.push({ occ, day, startMin: 0, endMin: 1440, wholeDay: true, continuesBefore: day > first, continuesAfter: day < last })
        continue
      }
      const startMin = day === first ? minutesOf(occ.start) : 0
      let endMin = day === last ? (occ.end > occ.start ? minutesOf(occ.end - 1) + 1 : startMin + 30) : 1440
      endMin = Math.min(1440, Math.max(endMin, startMin + 15))
      segs.push({ occ, day, startMin, endMin, wholeDay: startMin === 0 && endMin === 1440, continuesBefore: day > first, continuesAfter: day < last })
    }
  }
  return segs
}
