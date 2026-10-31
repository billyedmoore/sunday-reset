/** A thing to do this week: pinned to a day (0 = Monday … 6 = Sunday) or `null` for any time. */
export interface Task {
  id: string
  title: string
  mins: number
  day: number | null
  /** Where the task sits on the calendar once placed (day 0 = Monday, minutes from midnight). */
  slot?: { day: number; startMin: number }
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

export const setTaskMins = (tasks: Task[], id: string, mins: number): Task[] =>
  tasks.map((t) => (t.id === id ? { ...t, mins, slot: undefined } : t)) // a new length needs a new slot

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
