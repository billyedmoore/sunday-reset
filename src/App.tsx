import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import TaskList from './components/TaskList'
import WeekCalendar from './components/WeekCalendar'
import { londonDay, upcomingMonday } from './ical/dates'
import { importCalendarFile } from './ical/import'
import type { StoredEvent } from './ical/parse'
import { autoPlace, busyByDay, clearSlots, type Placement, type ScheduleOptions } from './schedule'
import { loadEvents, saveEvents } from './store'
import {
  addTask,
  loadTasks,
  removeTask,
  saveTasks,
  setTaskMins,
  type Task,
  type TasksByWeek,
} from './tasks'

const NO_TASKS: Task[] = []

const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

/** Scheduler settings for one week: work around that week's events and skip days already gone. */
const scheduleOpts = (events: StoredEvent[], week: number, today: number): ScheduleOptions => ({
  busy: busyByDay(events, week),
  seed: randomSeed(),
  firstDay: Math.min(7, Math.max(0, today - week)),
})

/** Place any waiting tasks for a week and re-check the existing slots against the events. */
function placeWeek(all: TasksByWeek, week: number, opts: ScheduleOptions): TasksByWeek {
  return all[week]?.length ? { ...all, [week]: autoPlace(all[week], opts) } : all
}

export default function App() {
  const [events, setEvents] = useState<StoredEvent[]>(loadEvents)
  // The app is for planning ahead, so it opens on the upcoming Mon–Sun week.
  const [weekStart, setWeekStart] = useState(() => upcomingMonday(Date.now()))
  const [today] = useState(() => londonDay(Date.now()))
  const [tasksByWeek, setTasksByWeek] = useState<TasksByWeek>(() =>
    placeWeek(loadTasks(), weekStart, scheduleOpts(events, weekStart, today)),
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => saveTasks(tasksByWeek), [tasksByWeek])

  // The lists belong to whichever week the calendar is showing.
  const tasks = tasksByWeek[weekStart] ?? NO_TASKS
  const editTasks = (fn: (tasks: Task[]) => Task[]) =>
    setTasksByWeek((all) => ({ ...all, [weekStart]: fn(all[weekStart] ?? []) }))

  // Tasks are dropped into free time as they're added, and keep their slot afterwards. This is a view
  // inside the app only; nothing is written to any calendar.
  const placeOpts = () => scheduleOpts(events, weekStart, today)
  const changeWeek = (start: number) => {
    const opts = scheduleOpts(events, start, today)
    setWeekStart(start)
    setTasksByWeek((all) => placeWeek(all, start, opts))
  }

  const placements = useMemo<Placement[]>(
    () => tasks.filter((t) => t.slot).map((t) => ({ task: t, day: t.slot!.day, startMin: t.slot!.startMin })),
    [tasks],
  )
  const unplaced = useMemo(() => tasks.filter((t) => !t.slot), [tasks])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const imported = await importCalendarFile(file)
      setEvents(imported)
      const opts = scheduleOpts(imported, weekStart, today)
      setTasksByWeek((all) => placeWeek(all, weekStart, opts))
      if (!saveEvents(imported)) setError('Imported, but your browser would not save it for next time.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file')
    } finally {
      setBusy(false)
    }
  }

  const pick = () => fileInput.current?.click()

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void handleFile(e.dataTransfer.files[0])
  }

  return (
    <div className="app">
      <h1>Sunday Reset</h1>
      <div className="layout">
        <TaskList
          today={today}
          weekStart={weekStart}
          tasks={tasks}
          onAdd={(day, title, mins) => {
            const opts = placeOpts()
            editTasks((t) => autoPlace(addTask(t, { title, mins, day }), opts))
          }}
          onRemove={(id) => editTasks((t) => removeTask(t, id))}
          onSetMins={(id, mins) => {
            const opts = placeOpts()
            editTasks((t) => autoPlace(setTaskMins(t, id, mins), opts))
          }}
        />
        <section
          className={`panel${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {events.length ? (
            <WeekCalendar
              events={events}
              weekStart={weekStart}
              today={today}
              onShift={(w) => changeWeek(weekStart + 7 * w)}
              onToday={() => changeWeek(upcomingMonday(Date.now()))}
              onImport={pick}
              placements={placements}
              unplaced={unplaced}
              canShuffle={tasks.length > 0}
              onShuffle={() => {
                const opts = placeOpts()
                editTasks((t) => autoPlace(clearSlots(t), opts))
              }}
            />
          ) : (
            <div className="panel-empty">
              <button className="btn" onClick={pick} disabled={busy}>
                {busy ? 'Importing…' : 'Import Calendar'}
              </button>
              <p className="hint">Choose a Google Calendar export (.zip) or an .ics file, or drop it here.</p>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <input
            ref={fileInput}
            type="file"
            accept=".zip,.ics"
            hidden
            onChange={(e) => {
              void handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </section>
      </div>
    </div>
  )
}
