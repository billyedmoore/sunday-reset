import { midnightOf } from './ical/dates'
import { eventsBetween, splitByDay } from './ical/expand'
import type { StoredEvent } from './ical/parse'
import type { Task } from './tasks'

/** Minutes from midnight. */
export interface Busy {
  start: number
  end: number
}

export interface Placement {
  task: Task
  /** 0 = Monday … 6 = Sunday. */
  day: number
  startMin: number
  /** The user chose to overlap something here. */
  forced?: boolean
}

export interface ScheduleResult {
  placements: Placement[]
  /** Tasks that didn't fit anywhere they were allowed. */
  unplaced: Task[]
}

export interface ScheduleOptions {
  /** Busy intervals for each of the 7 days. */
  busy: Busy[][]
  seed: number
  /** Earliest / latest minute a task may occupy. */
  dayStart?: number
  dayEnd?: number
  /** Start times are multiples of this many minutes. */
  step?: number
  /** Breathing room kept before and after anything else. */
  gap?: number
  /** "Any time" tasks only go on days with index >= this (so past days are skipped). */
  firstDay?: number
}

/** Small seeded PRNG so a shuffle can be reproduced from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const DAY_START = 6 * 60
export const DAY_END = 22 * 60

const overlaps = (list: Busy[], s: number, mins: number, gap: number) =>
  list.some((b) => s < b.end + gap && s + mins + gap > b.start)

/**
 * Whether a task of `mins` minutes may sit at `startMin` on `day`: inside the 06:00–22:00 window and not
 * overlapping any event or any other placed task. Used to validate drags.
 */
export function slotFree(
  busy: Busy[][],
  placements: Placement[],
  taskId: string,
  day: number,
  startMin: number,
  mins: number,
): boolean {
  if (day < 0 || day > 6 || startMin < DAY_START || startMin + mins > DAY_END) return false
  const others = placements
    .filter((p) => p.day === day && p.task.id !== taskId)
    .map((p) => ({ start: p.startMin, end: p.startMin + p.task.mins }))
  return !overlaps([...busy[day], ...others], startMin, mins, 0)
}

/**
 * Randomly place tasks into the free gaps of the week.
 * Tasks that already have a valid `slot` keep it; the rest are placed around them. Tasks pinned to a
 * day stay on that day; "any time" tasks go on any day, favouring the quieter ones.
 */
export function scheduleTasks(tasks: Task[], opts: ScheduleOptions): ScheduleResult {
  const { busy, seed, dayStart = DAY_START, dayEnd = DAY_END, step = 15, gap = 15, firstDay = 0 } = opts
  const rand = mulberry32(seed)
  const taken: Busy[][] = busy.map((day) => [...day])
  const load = new Array<number>(7).fill(0)
  const placements: Placement[] = []
  const unplaced: Task[] = []

  const isFree = (day: number, s: number, mins: number) => !overlaps(taken[day], s, mins, gap)

  const freeStarts = (day: number, mins: number): number[] => {
    const starts: number[] = []
    for (let s = dayStart; s + mins <= dayEnd; s += step) {
      if (isFree(day, s, mins)) starts.push(s)
    }
    return starts
  }

  const place = (task: Task, day: number, starts: number[]) => {
    const startMin = starts[Math.floor(rand() * starts.length)]
    taken[day].push({ start: startMin, end: startMin + task.mins })
    load[day] += task.mins
    placements.push({ task, day, startMin })
  }

  // Keep slots that are still valid (right day, inside the window, not overlapping anything); re-place
  // the rest. Kept slots need no gap, so a task the user dragged right up to an event stays put.
  // Slots the user forced onto a conflict are kept too, and are handled last so they never push a
  // normal slot out of the way.
  const toPlace: Task[] = []
  const inRange = (t: Task) =>
    t.slot !== undefined &&
    t.slot.day >= 0 &&
    t.slot.day <= 6 &&
    (t.day === null || t.day === t.slot.day) &&
    t.slot.startMin >= dayStart &&
    t.slot.startMin + t.mins <= dayEnd
  const keep = (task: Task, forced: boolean) => {
    const { day, startMin } = task.slot!
    taken[day].push({ start: startMin, end: startMin + task.mins })
    load[day] += task.mins
    placements.push({ task, day, startMin, ...(forced ? { forced: true } : {}) })
  }
  for (const forcedPass of [false, true]) {
    for (const task of tasks) {
      if (!task.slot || Boolean(task.slot.forced) !== forcedPass) continue
      if (!inRange(task)) {
        toPlace.push(task)
        continue
      }
      const clash = overlaps(taken[task.slot.day], task.slot.startMin, task.mins, 0)
      if (!clash) keep(task, false)
      else if (forcedPass) keep(task, true)
      else toPlace.push(task)
    }
  }
  for (const task of tasks) if (!task.slot) toPlace.push(task)

  for (const task of shuffled(toPlace.filter((t) => t.day !== null), rand)) {
    const starts = freeStarts(task.day!, task.mins)
    if (starts.length) place(task, task.day!, starts)
    else unplaced.push(task)
  }

  // Longest first (they're the hardest to fit), ties broken randomly.
  const anyTime = shuffled(toPlace.filter((t) => t.day === null), rand).sort((a, b) => b.mins - a.mins)
  for (const task of anyTime) {
    const options: { day: number; starts: number[] }[] = []
    for (let day = Math.max(0, firstDay); day < 7; day++) {
      const starts = freeStarts(day, task.mins)
      if (starts.length) options.push({ day, starts })
    }
    if (!options.length) {
      unplaced.push(task)
      continue
    }
    const lightest = Math.min(...options.map((o) => load[o.day]))
    const eligible = options.filter((o) => load[o.day] <= lightest + 90)
    const pick = eligible[Math.floor(rand() * eligible.length)]
    place(task, pick.day, pick.starts)
  }

  placements.sort((a, b) => a.day - b.day || a.startMin - b.startMin)
  return { placements, unplaced }
}

/**
 * When you're busy on each day of the week starting at `weekStart`.
 * Timed events block time, including the stretches of multi-day timed events; true all-day events
 * (birthdays, bin days…) don't.
 */
export function busyByDay(events: StoredEvent[], weekStart: number): Busy[][] {
  const occs = eventsBetween(events, midnightOf(weekStart), midnightOf(weekStart + 7))
  const days: Busy[][] = Array.from({ length: 7 }, () => [])
  for (const seg of splitByDay(occs, weekStart, 7)) {
    if (!seg.occ.allDay) days[seg.day - weekStart].push({ start: seg.startMin, end: seg.endMin })
  }
  return days
}

/** Run the scheduler and store each task's slot on the task (tasks that don't fit lose theirs). */
export function autoPlace(tasks: Task[], opts: ScheduleOptions): Task[] {
  const slots = new Map(
    scheduleTasks(tasks, opts).placements.map((p) => [
      p.task.id,
      { day: p.day, startMin: p.startMin, ...(p.forced ? { forced: true } : {}) },
    ]),
  )
  return tasks.map((t) => ({ ...t, slot: slots.get(t.id) }))
}

/** The tasks that currently have a place on the calendar, with their forced flag carried across. */
export const placementsOf = (tasks: Task[]): Placement[] =>
  tasks.flatMap((t) =>
    t.slot ? [{ task: t, day: t.slot.day, startMin: t.slot.startMin, ...(t.slot.forced ? { forced: true } : {}) }] : [],
  )

/** Forget every slot, so the next `autoPlace` re-rolls the whole week. */
export const clearSlots = (tasks: Task[]): Task[] => tasks.map((t) => ({ ...t, slot: undefined }))
