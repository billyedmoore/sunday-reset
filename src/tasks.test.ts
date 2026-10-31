import { describe, expect, it } from 'vitest'
import { addTask, formatDuration, moveTask, removeTask, setTaskMins, tasksFor, totalMins } from './tasks'

describe('tasks', () => {
  it('adds tasks to a day or to any time, trimming the title', () => {
    let tasks = addTask([], { title: '  Laundry ', mins: 45, day: null })
    tasks = addTask(tasks, { title: 'Gym', mins: 60, day: 2 })
    expect(tasks.map((t) => [t.title, t.mins, t.day])).toEqual([
      ['Laundry', 45, null],
      ['Gym', 60, 2],
    ])
    expect(new Set(tasks.map((t) => t.id)).size).toBe(2)
  })

  it('filters by day and totals time', () => {
    let tasks = addTask([], { title: 'a', mins: 30, day: 0 })
    tasks = addTask(tasks, { title: 'b', mins: 90, day: 0 })
    tasks = addTask(tasks, { title: 'c', mins: 15, day: null })
    expect(tasksFor(tasks, 0).map((t) => t.title)).toEqual(['a', 'b'])
    expect(tasksFor(tasks, null).map((t) => t.title)).toEqual(['c'])
    expect(totalMins(tasksFor(tasks, 0))).toBe(120)
  })

  it('retimes and removes without mutating the input', () => {
    const before = addTask([], { title: 'a', mins: 30, day: 1 })
    const { id } = before[0]
    expect(setTaskMins(before, id, 90)[0].mins).toBe(90)
    expect(setTaskMins([{ ...before[0], slot: { day: 1, startMin: 600 } }], id, 90)[0].slot).toBeUndefined()
    expect(removeTask(before, id)).toEqual([])
    expect(before[0]).toMatchObject({ mins: 30 })
  })

  it('moves a task: day-pinned ones change day, "any time" ones stay "any time"', () => {
    const tasks = addTask(addTask([], { title: 'pinned', mins: 30, day: 1 }), { title: 'free', mins: 30, day: null })
    const [a, b] = tasks
    const moved = moveTask(tasks, a.id, 4, 600)
    expect(moved[0]).toMatchObject({ day: 4, slot: { day: 4, startMin: 600 } })
    const movedFree = moveTask(tasks, b.id, 2, 900)
    expect(movedFree[1]).toMatchObject({ day: null, slot: { day: 2, startMin: 900 } })
    expect(tasks[0].slot).toBeUndefined() // input untouched
    expect(moveTask(tasks, a.id, 4, 600, true)[0].slot).toEqual({ day: 4, startMin: 600, forced: true })
    expect(moveTask(tasks, a.id, 4, 600)[0].slot).toEqual({ day: 4, startMin: 600 })
  })

  it('formats durations', () => {
    expect([15, 60, 90, 150].map(formatDuration)).toEqual(['15m', '1h', '1h 30m', '2h 30m'])
  })
})
