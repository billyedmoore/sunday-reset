import { dayNum, fromDayNum, londonDay, midnightOf, parseDt, weekdayOf, wallToInstant, zonedParts } from './dates'
import type { StoredEvent } from './parse'

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

const list = (v: string | undefined) => (v ? v.split(',') : undefined)

/**
 * Start instants of each occurrence on or before `endDay` (a London day number).
 * Supports DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY (plain weekdays),
 * BYMONTHDAY and BYMONTH.
 */
export function* occurrenceStarts(ev: StoredEvent, endDay: number): Generator<number> {
  const r = ev.rrule
  if (!r) {
    yield ev.start
    return
  }
  const freq = r.FREQ
  const interval = Number(r.INTERVAL ?? 1)
  const count = r.COUNT ? Number(r.COUNT) : undefined
  let until: number | undefined
  if (r.UNTIL) {
    const u = parseDt({}, r.UNTIL)
    until = r.UNTIL.length === 8 ? midnightOf(londonDay(u.ms) + 1) : u.ms
  }
  const byday = list(r.BYDAY)?.map((x) => x.replace(/[-+\d]/g, ''))
  const bymonthday = list(r.BYMONTHDAY)?.map(Number)
  const bymonth = list(r.BYMONTH)?.map(Number)
  if (r.BYDAY && /\d/.test(r.BYDAY)) console.warn(`unsupported BYDAY ${r.BYDAY}`)
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) {
    console.warn(`unsupported FREQ ${freq}`)
    return
  }

  const p0 = zonedParts(ev.start)
  const d0 = dayNum(p0.y, p0.m, p0.d)
  const week0 = d0 - weekdayOf(d0)
  let n = 0

  for (let d = d0; d <= endDay; d++) {
    const { y, m, d: dom } = fromDayNum(d)
    let ok: boolean
    if (freq === 'DAILY') {
      ok = (d - d0) % interval === 0
    } else if (freq === 'WEEKLY') {
      const wk = Math.floor((d - weekdayOf(d) - week0) / 7)
      ok = wk % interval === 0 && (byday ?? [WEEKDAYS[weekdayOf(d0)]]).includes(WEEKDAYS[weekdayOf(d)])
    } else if (freq === 'MONTHLY') {
      const months = (y - p0.y) * 12 + m - p0.m
      ok = months % interval === 0 && (bymonthday ?? [p0.d]).includes(dom)
    } else {
      ok = (y - p0.y) % interval === 0 && (bymonth ?? [p0.m]).includes(m) && (bymonthday ?? [p0.d]).includes(dom)
    }
    if (!ok) continue

    const start = wallToInstant(y, m, dom, p0.h, p0.mi, p0.s)
    if (until !== undefined && start >= until) return
    if (count !== undefined && ++n > count) return
    yield start
  }
}
