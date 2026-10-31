import { describe, expect, it } from 'vitest'
import { addTask, formatDuration, removeTask, setTaskMins, tasksFor, totalMins } from './tasks'

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
    expect(removeTask(before, id)).toEqual([])
    expect(before[0]).toMatchObject({ mins: 30 })
  })

  it('formats durations', () => {
    expect([15, 60, 90, 150].map(formatDuration)).toEqual(['15m', '1h', '1h 30m', '2h 30m'])
  })
})
