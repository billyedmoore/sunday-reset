import { describe, expect, it } from 'vitest'
import { buildIcs, exportableTasks, fold, icsFilename } from './exportIcs'
import { dayNum } from './ical/dates'
import { parseIcs } from './ical/parse'
import type { Task } from './tasks'

const monday = dayNum(2026, 11, 2) // GMT week
const summer = dayNum(2026, 7, 6) // BST week
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0)

const task = (id: string, title: string, mins: number, day: number | null, slot?: Task['slot']): Task => ({
  id,
  title,
  mins,
  day,
  slot,
})

const opts = { calendarName: 'Sunday Reset – Weekly', color: '#b565c9', weekStart: monday, reminderMins: 0, busy: true, now: NOW }

describe('buildIcs', () => {
  it('writes events in UTC for the right day and time', () => {
    const ics = buildIcs([task('a', 'Laundry', 90, 1, { day: 1, startMin: 9 * 60 + 30 })], opts)
    expect(ics).toContain('DTSTART:20261103T093000Z') // Tuesday, GMT so same as London
    expect(ics).toContain('DTEND:20261103T110000Z')
    expect(ics).toContain('SUMMARY:Laundry')
  })

  it('converts London summer time to UTC', () => {
    const ics = buildIcs([task('a', 'Run', 60, 0, { day: 0, startMin: 8 * 60 })], { ...opts, weekStart: summer })
    expect(ics).toContain('DTSTART:20260706T070000Z') // 08:00 BST
  })

  it('uses the slot day for "any time" tasks', () => {
    const ics = buildIcs([task('a', 'Tax', 60, null, { day: 4, startMin: 600 })], opts)
    expect(ics).toContain('DTSTART:20261106T100000Z')
  })

  it('skips tasks without a slot', () => {
    expect(buildIcs([task('a', 'Not placed', 30, 2)], opts)).not.toContain('BEGIN:VEVENT')
  })

  it('keeps UIDs stable between exports and raises SEQUENCE so re-importing updates them', () => {
    const tasks = [task('abc', 'x', 30, 1, { day: 1, startMin: 600 })]
    const first = buildIcs(tasks, opts)
    const later = buildIcs(tasks, { ...opts, now: NOW + 60_000 })
    expect(first).toContain('UID:sr-abc@sundayreset')
    expect(later).toContain('UID:sr-abc@sundayreset')
    const seq = (s: string) => Number(/SEQUENCE:(\d+)/.exec(s)![1])
    expect(seq(later)).toBeGreaterThan(seq(first))
  })

  it('escapes text, folds long lines and uses CRLF', () => {
    const ics = buildIcs([task('a', 'Buy milk, eggs; bread\\more', 30, 0, { day: 0, startMin: 600 })], opts)
    expect(ics).toContain('SUMMARY:Buy milk\\, eggs\\; bread\\\\more')
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false)
  })

  it('adds a reminder and the busy/free setting when asked', () => {
    const t = [task('a', 'x', 30, 0, { day: 0, startMin: 600 })]
    const withAlarm = buildIcs(t, { ...opts, reminderMins: 10, busy: false })
    expect(withAlarm).toContain('TRIGGER:-PT10M')
    expect(withAlarm).toContain('TRANSP:TRANSPARENT')
    const plain = buildIcs(t, opts)
    expect(plain).not.toContain('VALARM')
    expect(plain).toContain('TRANSP:OPAQUE')
  })

  it('notes a forced overlap in the description', () => {
    const ics = buildIcs([task('a', 'x', 30, 0, { day: 0, startMin: 600, forced: true })], opts)
    expect(ics.replace(/\r\n /g, '')).toContain('Overlaps another event.')
  })

  it('round-trips through the app\'s own parser', () => {
    const tasks = [
      task('a', 'Write report, draft', 180, 1, { day: 1, startMin: 13 * 60 }),
      task('b', 'Plan meals', 45, null, { day: 5, startMin: 10 * 60 + 15 }),
    ]
    const { name, events } = parseIcs(buildIcs(tasks, opts), 'x')
    expect(name).toBe('Sunday Reset – Weekly')
    expect(events.map((e) => [e.title, e.start, e.durMs / 60000])).toEqual([
      ['Write report, draft', Date.UTC(2026, 10, 3, 13), 180],
      ['Plan meals', Date.UTC(2026, 10, 7, 10, 15), 45],
    ])
  })
})

describe('helpers', () => {
  it('splits placed tasks into the two calendars', () => {
    const tasks = [
      task('d1', 'a', 30, 1, { day: 1, startMin: 600 }),
      task('w1', 'b', 30, null, { day: 2, startMin: 600 }),
      task('d2', 'unplaced', 30, 3),
    ]
    expect(exportableTasks(tasks, 'daily').map((t) => t.id)).toEqual(['d1'])
    expect(exportableTasks(tasks, 'weekly').map((t) => t.id)).toEqual(['w1'])
  })

  it('names files by group and week', () => {
    expect(icsFilename('daily', monday)).toBe('sunday-reset-day-to-day-2026-11-02.ics')
    expect(icsFilename('weekly', monday)).toBe('sunday-reset-weekly-2026-11-02.ics')
  })

  it('folds without splitting multi-byte characters', () => {
    const folded = fold('SUMMARY:' + '🩷'.repeat(40))
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe('SUMMARY:' + '🩷'.repeat(40))
  })
})
