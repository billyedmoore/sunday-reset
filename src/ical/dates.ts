// Date helpers. Everything is shown in Europe/London; events carry UTC instants (ms).
export const TZ = 'Europe/London'
export const DAY_MS = 86_400_000

export interface Parts {
  y: number
  m: number
  d: number
  h: number
  mi: number
  s: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(tz, f)
  }
  return f
}

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(ms: number, tz = TZ): Parts {
  const p: Record<string, number> = {}
  for (const { type, value } of formatter(tz).formatToParts(ms)) {
    if (type !== 'literal') p[type] = Number(value)
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second }
}

function offsetMs(ms: number, tz: string): number {
  const p = zonedParts(ms, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000
}

/** The instant at which a zone's wall clock reads the given time. */
export function wallToInstant(y: number, m: number, d: number, h = 0, mi = 0, s = 0, tz = TZ): number {
  const guess = Date.UTC(y, m - 1, d, h, mi, s)
  const first = guess - offsetMs(guess, tz)
  return guess - offsetMs(first, tz)
}

// Calendar days are integers (days since 1970-01-01) so day arithmetic ignores DST.
export const dayNum = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)

export function fromDayNum(n: number): { y: number; m: number; d: number } {
  const dt = new Date(n * DAY_MS)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

/** 0 = Monday … 6 = Sunday. */
export const weekdayOf = (n: number) => (((n + 3) % 7) + 7) % 7

export function londonDay(ms: number): number {
  const p = zonedParts(ms)
  return dayNum(p.y, p.m, p.d)
}

/** The next Monday strictly after `ms` (London): the start of the upcoming Mon–Sun week. */
export function upcomingMonday(ms: number): number {
  const n = londonDay(ms)
  return n + 7 - weekdayOf(n)
}

export function midnightOf(n: number): number {
  const { y, m, d } = fromDayNum(n)
  return wallToInstant(y, m, d)
}

export interface ParsedDate {
  ms: number
  allDay: boolean
}

/** Parse an iCal DATE / DATE-TIME value: all-day, UTC (`Z`), `TZID=` wall time, or floating. */
export function parseDt(params: Record<string, string>, value: string): ParsedDate {
  if (params.VALUE === 'DATE' || value.length === 8) {
    const y = Number(value.slice(0, 4))
    const m = Number(value.slice(4, 6))
    const d = Number(value.slice(6, 8))
    return { ms: wallToInstant(y, m, d), allDay: true }
  }
  const y = Number(value.slice(0, 4))
  const m = Number(value.slice(4, 6))
  const d = Number(value.slice(6, 8))
  const h = Number(value.slice(9, 11))
  const mi = Number(value.slice(11, 13))
  const s = Number(value.slice(13, 15))
  if (value.endsWith('Z')) return { ms: Date.UTC(y, m - 1, d, h, mi, s), allDay: false }
  let zone = TZ
  if (params.TZID) {
    try {
      formatter(params.TZID)
      zone = params.TZID
    } catch {
      // unknown zone: fall back to London, like the Python reference
    }
  }
  return { ms: wallToInstant(y, m, d, h, mi, s, zone), allDay: false }
}
