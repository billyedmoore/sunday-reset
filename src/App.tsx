import { useEffect, useRef, useState, type DragEvent } from 'react'
import TaskList from './components/TaskList'
import WeekCalendar from './components/WeekCalendar'
import { londonDay, upcomingMonday } from './ical/dates'
import { importCalendarFile } from './ical/import'
import type { StoredEvent } from './ical/parse'
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

export default function App() {
  const [events, setEvents] = useState<StoredEvent[]>(loadEvents)
  // The app is for planning ahead, so it opens on the upcoming Mon–Sun week.
  const [weekStart, setWeekStart] = useState(() => upcomingMonday(Date.now()))
  const [tasksByWeek, setTasksByWeek] = useState<TasksByWeek>(loadTasks)
  const [today] = useState(() => londonDay(Date.now()))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => saveTasks(tasksByWeek), [tasksByWeek])

  // The lists belong to whichever week the calendar is showing.
  const tasks = tasksByWeek[weekStart] ?? []
  const editTasks = (fn: (tasks: Task[]) => Task[]) =>
    setTasksByWeek((all) => ({ ...all, [weekStart]: fn(all[weekStart] ?? []) }))

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const imported = await importCalendarFile(file)
      setEvents(imported)
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
          onAdd={(day, title, mins) => editTasks((t) => addTask(t, { title, mins, day }))}
          onRemove={(id) => editTasks((t) => removeTask(t, id))}
          onSetMins={(id, mins) => editTasks((t) => setTaskMins(t, id, mins))}
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
              onShift={(w) => setWeekStart((s) => s + 7 * w)}
              onToday={() => setWeekStart(upcomingMonday(Date.now()))}
              onImport={pick}
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
