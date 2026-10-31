import { describe, expect, it } from 'vitest'
import { dayNum } from './ical/dates'
import { parseIcs } from './ical/parse'
import { autoPlace, busyByDay, clearSlots, scheduleTasks, type Busy } from './schedule'
import type { Task } from './tasks'

const task = (id: string, mins: number, day: number | null): Task => ({ id, title: id, mins, day })
const empty = (): Busy[][] => Array.from({ length: 7 }, () => [])

describe('scheduleTasks', () => {
  const tasks = [task('a', 60, null), task('b', 90, null), task('c', 30, 2), task('d', 45, null), task('e', 120, 4)]

  it('is reproducible from its seed and varies between seeds', () => {
    const run = (seed: number) => scheduleTasks(tasks, { busy: empty(), seed }).placements.map((p) => [p.task.id, p.day, p.startMin])
    expect(run(1)).toEqual(run(1))
    expect(run(1)).not.toEqual(run(2))
  })

  it('keeps day-pinned tasks on their day and inside the 06:00-22:00 window', () => {
    const { placements } = scheduleTasks(tasks, { busy: empty(), seed: 7 })
    expect(placements).toHaveLength(5)
    expect(placements.find((p) => p.task.id === 'c')!.day).toBe(2)
    expect(placements.find((p) => p.task.id === 'e')!.day).toBe(4)
    for (const p of placements) {
      expect(p.startMin).toBeGreaterThanOrEqual(6 * 60)
      expect(p.startMin + p.task.mins).toBeLessThanOrEqual(22 * 60)
    }
  })

  it('never overlaps busy time or other tasks, and keeps the gap', () => {
    const busy = empty()
    for (let d = 0; d < 7; d++) busy[d] = [{ start: 9 * 60, end: 17 * 60 }]
    for (let seed = 0; seed < 50; seed++) {
      const { placements } = scheduleTasks(tasks, { busy, seed, gap: 15 })
      const spans = placements.map((p) => ({ day: p.day, start: p.startMin, end: p.startMin + p.task.mins }))
      for (const s of spans) {
        // clear of the 09:00-17:00 block by at least the gap
        expect(s.end <= 9 * 60 - 15 || s.start >= 17 * 60 + 15).toBe(true)
        for (const o of spans) {
          if (o !== s && o.day === s.day) expect(s.end + 15 <= o.start || o.end + 15 <= s.start).toBe(true)
        }
      }
    }
  })

  it('reports tasks that cannot fit', () => {
    const busy = empty()
    busy[1] = [{ start: 6 * 60, end: 22 * 60 }] // Tuesday fully booked
    const result = scheduleTasks([task('pinned', 30, 1), task('huge', 17 * 60, null)], { busy, seed: 3 })
    expect(result.placements).toEqual([])
    expect(result.unplaced.map((t) => t.id).sort()).toEqual(['huge', 'pinned'])
  })

  it('keeps "any time" tasks off days before firstDay', () => {
    for (let seed = 0; seed < 30; seed++) {
      const { placements } = scheduleTasks([task('x', 30, null), task('y', 30, null)], { busy: empty(), seed, firstDay: 4 })
      expect(placements.every((p) => p.day >= 4)).toBe(true)
    }
  })

  it('spreads "any time" tasks across quieter days', () => {
    const many = Array.from({ length: 7 }, (_, i) => task(`t${i}`, 60, null))
    const days = scheduleTasks(many, { busy: empty(), seed: 11 }).placements.map((p) => p.day)
    expect(new Set(days).size).toBeGreaterThanOrEqual(5)
  })
})

describe('autoPlace', () => {
  const opts = (seed: number, busy = empty()) => ({ busy, seed })

  it('stores a slot on every task that fits', () => {
    const placed = autoPlace([task('a', 60, null), task('b', 30, 3)], opts(5))
    expect(placed.every((t) => t.slot)).toBe(true)
    expect(placed.find((t) => t.id === 'b')!.slot!.day).toBe(3)
  })

  it('leaves existing slots where they are when a new task is added', () => {
    const first = autoPlace([task('a', 60, null), task('b', 90, 2)], opts(1))
    for (let seed = 2; seed < 30; seed++) {
      const next = autoPlace([...first, task('new', 45, null)], opts(seed))
      expect(next.find((t) => t.id === 'a')!.slot).toEqual(first[0].slot)
      expect(next.find((t) => t.id === 'b')!.slot).toEqual(first[1].slot)
      expect(next.find((t) => t.id === 'new')!.slot).toBeDefined()
    }
  })

  it('places a new task clear of the tasks already on that day', () => {
    // Monday is free only 06:00-08:00 and an existing task holds 06:00-07:00. With a 15 minute gap the
    // only room left is 07:15-07:45 (it would then end 15 minutes before the 08:00 event).
    const busy = empty()
    for (let d = 0; d < 7; d++) busy[d] = [{ start: 8 * 60, end: 22 * 60 }]
    const existing: Task = { ...task('old', 60, 0), slot: { day: 0, startMin: 6 * 60 } }
    const fits = autoPlace([existing, task('new', 30, 0)], opts(9, busy))
    expect(fits[0].slot).toEqual({ day: 0, startMin: 6 * 60 })
    expect(fits[1].slot).toEqual({ day: 0, startMin: 7 * 60 + 15 })
    expect(autoPlace([existing, task('too long', 45, 0)], opts(9, busy))[1].slot).toBeUndefined()
  })

  it('re-places a slot that now clashes with an event', () => {
    const stale: Task = { ...task('a', 60, null), slot: { day: 1, startMin: 10 * 60 } }
    const busy = empty()
    busy[1] = [{ start: 9 * 60, end: 12 * 60 }]
    const [moved] = autoPlace([stale], opts(4, busy))
    expect(moved.slot).toBeDefined()
    expect(moved.slot).not.toEqual(stale.slot)
  })

  it('re-rolls everything once the slots are cleared', () => {
    const many = Array.from({ length: 6 }, (_, i) => task(`t${i}`, 60, null))
    const a = autoPlace(many, opts(1))
    const b = autoPlace(clearSlots(a), opts(2))
    expect(b.map((t) => t.slot)).not.toEqual(a.map((t) => t.slot))
  })
})

describe('busyByDay', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:1',
    'DTSTART:20261103T100000Z',
    'DTEND:20261103T113000Z',
    'SUMMARY:Meeting',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:2',
    'DTSTART;VALUE=DATE:20261104',
    'DTEND;VALUE=DATE:20261105',
    'SUMMARY:Birthday',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:3',
    'DTSTART:20261105T220000Z',
    'DTEND:20261106T020000Z',
    'SUMMARY:Late night',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const events = parseIcs(ics, 'Test').events
  const busy = busyByDay(events, dayNum(2026, 11, 2)) // Monday

  it('blocks timed events and ignores all-day ones', () => {
    expect(busy[1]).toEqual([{ start: 600, end: 690 }])
    expect(busy[2]).toEqual([])
  })

  it('carries an event that crosses midnight onto both days', () => {
    expect(busy[3]).toEqual([{ start: 22 * 60, end: 1440 }])
    expect(busy[4]).toEqual([{ start: 0, end: 120 }])
  })
})
