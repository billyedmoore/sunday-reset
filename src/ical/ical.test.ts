import { describe, expect, it } from 'vitest'
import { dayNum, midnightOf, zonedParts } from './dates'
import { eventsBetween, splitByDay } from './expand'
import { parseIcs, type StoredEvent } from './parse'
import { readZip } from './zip'

// All data here is synthetic. Never add real calendar exports to the repo.

const ics = (events: string, extra = '') =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Test', extra, events, 'END:VCALENDAR'].join('\r\n')

const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')

const parse = (text: string) => parseIcs(text, 'Test').events

const win = (y: number, m: number, d: number, days: number) => ({
  start: midnightOf(dayNum(y, m, d)),
  end: midnightOf(dayNum(y, m, d) + days),
})

/** Occurrences that start inside the window. */
const startsIn = (events: StoredEvent[], w: { start: number; end: number }) =>
  eventsBetween(events, w.start, w.end).filter((o) => o.start >= w.start)

const utc = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi)

describe('parsing', () => {
  it('unfolds long lines and unescapes text', () => {
    const [ev] = parse(
      ics(
        vevent(
          'UID:a@example.com',
          'DTSTART:20261101T070000Z',
          'DTEND:20261101T081500Z',
          'SUMMARY:Lunch with a very long',
          '  name\\, with comma',
          'LOCATION:Cafe\\; Main St',
        ),
      ),
    )
    expect(ev.title).toBe('Lunch with a very long name, with comma')
    expect(ev.location).toBe('Cafe; Main St')
  })

  it('ignores VTIMEZONE rules and VALARM contents', () => {
    const tz = [
      'BEGIN:VTIMEZONE',
      'TZID:Europe/London',
      'BEGIN:DAYLIGHT',
      'DTSTART:19700329T010000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      'END:DAYLIGHT',
      'END:VTIMEZONE',
    ].join('\r\n')
    const evs = parse(
      ics(
        vevent(
          'UID:a@example.com',
          'DTSTART:20261101T070000Z',
          'SUMMARY:Real title',
          'BEGIN:VALARM',
          'SUMMARY:alarm should be ignored',
          'END:VALARM',
        ),
        tz,
      ),
    )
    expect(evs).toHaveLength(1)
    expect(evs[0].title).toBe('Real title')
    expect(evs[0].rrule).toBeUndefined()
  })

  it('handles UTC, TZID, all-day and floating start times', () => {
    const evs = parse(
      ics(
        [
          vevent('UID:1', 'DTSTART:20261101T070000Z', 'SUMMARY:utc'),
          vevent('UID:2', 'DTSTART;TZID=Europe/London:20260701T090000', 'SUMMARY:summer'),
          vevent('UID:3', 'DTSTART;VALUE=DATE:20261103', 'DTEND;VALUE=DATE:20261104', 'SUMMARY:allday'),
          vevent('UID:4', 'DTSTART:20261101T120000', 'SUMMARY:floating'),
        ].join('\r\n'),
      ),
    )
    const by = Object.fromEntries(evs.map((e) => [e.title, e]))
    expect(by.utc.start).toBe(utc(2026, 11, 1, 7))
    expect(by.summer.start).toBe(utc(2026, 7, 1, 8)) // BST is UTC+1
    expect(by.allday.allDay).toBe(true)
    expect(by.allday.days).toBe(1)
    expect(by.floating.start).toBe(utc(2026, 11, 1, 12))
  })
})

describe('recurrence', () => {
  it('weekly BYDAY with COUNT, EXDATE and a moved RECURRENCE-ID instance', () => {
    const evs = parse(
      ics(
        [
          vevent(
            'UID:class@example.com',
            'DTSTART;TZID=Europe/London:20261103T180000',
            'DTEND;TZID=Europe/London:20261103T190000',
            'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6',
            'EXDATE;TZID=Europe/London:20261112T180000',
            'SUMMARY:Class',
          ),
          vevent(
            'UID:class@example.com',
            'RECURRENCE-ID;TZID=Europe/London:20261110T180000',
            'DTSTART;TZID=Europe/London:20261111T190000',
            'DTEND;TZID=Europe/London:20261111T200000',
            'SUMMARY:Class (moved)',
          ),
        ].join('\r\n'),
      ),
    )
    const w = win(2026, 11, 2, 21)
    const got = startsIn(evs, w).map((o) => [o.title, zonedParts(o.start).d])
    expect(got).toEqual([
      ['Class', 3],
      ['Class', 5],
      ['Class (moved)', 11],
      ['Class', 17],
      ['Class', 19],
    ])
  })

  it('keeps the wall-clock time across a DST change', () => {
    const evs = parse(
      ics(vevent('UID:a', 'DTSTART;TZID=Europe/London:20261019T180000', 'RRULE:FREQ=WEEKLY;COUNT=2', 'SUMMARY:Evening')),
    )
    const w = win(2026, 10, 19, 14)
    expect(startsIn(evs, w).map((o) => o.start)).toEqual([utc(2026, 10, 19, 17), utc(2026, 10, 26, 18)])
  })

  it('every other week with an inclusive date UNTIL', () => {
    const evs = parse(
      ics(
        vevent(
          'UID:a',
          'DTSTART;VALUE=DATE:20261102',
          'DTEND;VALUE=DATE:20261103',
          'RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261130',
          'SUMMARY:Bins',
        ),
      ),
    )
    const days = startsIn(evs, win(2026, 11, 1, 38)).map((o) => zonedParts(o.start).d)
    expect(days).toEqual([2, 16, 30])
  })

  it('monthly BYMONTHDAY and plain yearly', () => {
    const evs = parse(
      ics(
        [
          vevent('UID:m', 'DTSTART;VALUE=DATE:20260915', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=15', 'SUMMARY:Rent'),
          vevent('UID:y', 'DTSTART;VALUE=DATE:19900520', 'RRULE:FREQ=YEARLY', 'SUMMARY:Anniversary'),
        ].join('\r\n'),
      ),
    )
    expect(startsIn(evs, win(2026, 10, 1, 92)).filter((o) => o.title === 'Rent')).toHaveLength(3)
    expect(startsIn(evs, win(2026, 5, 18, 7)).map((o) => o.title)).toEqual(['Anniversary'])
  })
})

describe('multi-day events', () => {
  it('splits a Tue 09:00 to Fri 17:00 event into four day segments', () => {
    const evs = parse(
      ics(vevent('UID:a', 'DTSTART:20261103T090000Z', 'DTEND:20261106T170000Z', 'SUMMARY:Away')),
    )
    const monday = dayNum(2026, 11, 2)
    const w = win(2026, 11, 2, 7)
    const segs = splitByDay(eventsBetween(evs, w.start, w.end), monday, 7)
    expect(segs.map((s) => s.day - monday)).toEqual([1, 2, 3, 4])
    expect(segs.map((s) => s.wholeDay)).toEqual([false, true, true, false])
    expect([segs[0].startMin, segs[3].endMin]).toEqual([9 * 60, 17 * 60])
  })
})

describe('zip reading', () => {
  const crcless = (name: string, data: Uint8Array, method: 0 | 8) => ({ name, data, method })

  async function buildZip(files: { name: string; text: string; deflate: boolean }[]): Promise<ArrayBuffer> {
    const enc = new TextEncoder()
    const parts: Uint8Array[] = []
    const central: Uint8Array[] = []
    let offset = 0
    for (const f of files) {
      const raw = enc.encode(f.text)
      let data: Uint8Array = raw
      if (f.deflate) {
        const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))
        data = new Uint8Array(await new Response(stream).arrayBuffer())
      }
      const { name, method } = crcless(f.name, data, f.deflate ? 8 : 0)
      const nameBytes = enc.encode(name)

      const local = new DataView(new ArrayBuffer(30))
      local.setUint32(0, 0x04034b50, true)
      local.setUint16(4, 20, true)
      local.setUint16(8, method, true)
      local.setUint32(18, data.length, true)
      local.setUint32(22, raw.length, true)
      local.setUint16(26, nameBytes.length, true)
      parts.push(new Uint8Array(local.buffer), nameBytes, data)

      const cd = new DataView(new ArrayBuffer(46))
      cd.setUint32(0, 0x02014b50, true)
      cd.setUint16(4, 20, true)
      cd.setUint16(6, 20, true)
      cd.setUint16(10, method, true)
      cd.setUint32(20, data.length, true)
      cd.setUint32(24, raw.length, true)
      cd.setUint16(28, nameBytes.length, true)
      cd.setUint32(42, offset, true)
      central.push(new Uint8Array(cd.buffer), nameBytes)
      offset += 30 + nameBytes.length + data.length
    }
    const cdSize = central.reduce((n, p) => n + p.length, 0)
    const eocd = new DataView(new ArrayBuffer(22))
    eocd.setUint32(0, 0x06054b50, true)
    eocd.setUint16(8, files.length, true)
    eocd.setUint16(10, files.length, true)
    eocd.setUint32(12, cdSize, true)
    eocd.setUint32(16, offset, true)

    const all = [...parts, ...central, new Uint8Array(eocd.buffer)]
    const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
    let at = 0
    for (const p of all) {
      out.set(p, at)
      at += p.length
    }
    return out.buffer
  }

  it('reads stored and deflated entries', async () => {
    const a = ics(vevent('UID:1', 'DTSTART:20261101T070000Z', 'SUMMARY:One'))
    const b = ics(vevent('UID:2', 'DTSTART:20261102T070000Z', 'SUMMARY:Two'))
    const entries = await readZip(
      await buildZip([
        { name: 'Work_abc@group.calendar.example.com.ics', text: a, deflate: false },
        { name: 'Home_def@example.com.ics', text: b, deflate: true },
      ]),
    )
    expect(entries.map((e) => e.name)).toEqual(['Work_abc@group.calendar.example.com.ics', 'Home_def@example.com.ics'])
    const dec = new TextDecoder()
    expect(entries.map((e) => dec.decode(e.data))).toEqual([a, b])
  })

  it('names calendars from the filename when asked', () => {
    // Google can reuse one X-WR-CALNAME for different calendars, so zips use filenames.
    const { name } = parseIcs(ics(vevent('UID:1', 'DTSTART:20261101T070000Z')), 'Birthdays', true)
    expect(name).toBe('Birthdays')
  })

  it('rejects non-zip data', async () => {
    await expect(readZip(new TextEncoder().encode('not a zip at all, just some text').buffer as ArrayBuffer)).rejects.toThrow()
  })
})
