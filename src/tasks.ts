/** A thing to do this week: pinned to a day (0 = Monday … 6 = Sunday) or `null` for any time. */
export interface Task {
  id: string
  title: string
  mins: number
  day: number | null
  /** Where the task sits on the calendar once placed (day 0 = Monday, minutes from midnight). */
  slot?: {
    day: number
    startMin: number
    /** The user chose to overlap something here. */
    forced?: boolean
    /** The user put it here (dragged, moved by keyboard, or placed anyway), so a shuffle leaves it alone. */
    manual?: boolean
  }
}

/** Tasks keyed by the London day number of the week's Monday. */
export type TasksByWeek = Record<number, Task[]>

export const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240]
export const DEFAULT_MINS = 30

export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

export const addTask = (tasks: Task[], t: { title: string; mins: number; day: number | null }): Task[] => [
  ...tasks,
  { id: crypto.randomUUID(), title: t.title.trim(), mins: t.mins, day: t.day },
]

export const removeTask = (tasks: Task[], id: string): Task[] => tasks.filter((t) => t.id !== id)

/** Put a deleted task back where it was in the list (used by Undo). */
export const restoreTask = (tasks: Task[], task: Task, index: number): Task[] => {
  if (tasks.some((t) => t.id === task.id)) return tasks
  const out = [...tasks]
  out.splice(Math.min(index, out.length), 0, task)
  return out
}

/** Edit a task's title or day. A new day needs a new slot; an empty title is ignored. */
export const updateTask = (tasks: Task[], id: string, patch: { title?: string; day?: number | null }): Task[] =>
  tasks.map((t) => {
    if (t.id !== id) return t
    const title = patch.title === undefined || !patch.title.trim() ? t.title : patch.title.trim()
    const dayChanged = patch.day !== undefined && patch.day !== t.day
    return { ...t, title, day: patch.day === undefined ? t.day : patch.day, slot: dayChanged ? undefined : t.slot }
  })

export const setTaskMins = (tasks: Task[], id: string, mins: number): Task[] =>
  tasks.map((t) => (t.id === id ? { ...t, mins, slot: undefined } : t)) // a new length needs a new slot

/**
 * Drop a task at a new place. A day-pinned task follows to its new day (so the list on the left stays
 * in step with the calendar); an "any time" task stays "any time". `forced` records that the user chose
 * to overlap something, so it isn't moved away later. Any move marks the slot `manual`, so shuffling
 * keeps it.
 */
export const moveTask = (tasks: Task[], id: string, day: number, startMin: number, forced = false): Task[] =>
  tasks.map((t) =>
    t.id === id ? { ...t, day: t.day === null ? null : day, slot: forced ? { day, startMin, forced, manual: true } : { day, startMin, manual: true } } : t,
  )

export const tasksFor = (tasks: Task[], day: number | null): Task[] => tasks.filter((t) => t.day === day)

export const totalMins = (tasks: Task[]): number => tasks.reduce((n, t) => n + t.mins, 0)

const KEY = 'sunday-reset:tasks:v1'

export function loadTasks(): TasksByWeek {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as TasksByWeek) : {}
  } catch {
    return {}
  }
}

export function saveTasks(tasks: TasksByWeek): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tasks))
  } catch {
    // storage unavailable: lists just won't persist
  }
}
