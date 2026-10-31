import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import ExportDialog from './components/ExportDialog'
import TaskList, { type PlacedNotice } from './components/TaskList'
import WeekCalendar from './components/WeekCalendar'
import { DAY_FULL, hhmm } from './format'
import { londonDay, upcomingMonday } from './ical/dates'
import { importCalendarFile } from './ical/import'
import type { StoredEvent } from './ical/parse'
import { autoPlace, busyByDay, clearSlots, leastBadSlot, placementsOf, type ScheduleOptions } from './schedule'
import { loadSettings, saveSettings, type Settings } from './settings'
import { loadEvents, saveEvents } from './store'
import {
  addTask,
  loadTasks,
  moveTask,
  removeTask,
  restoreTask,
  saveTasks,
  setTaskMins,
  updateTask,
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

/** Run `clear` after `ms` whenever `value` is set; used for messages that fade on their own. */
function useExpiry(value: unknown, clear: () => void, ms: number) {
  useEffect(() => {
    if (!value) return
    const t = setTimeout(clear, ms)
    return () => clearTimeout(t)
    // `clear` only calls a state setter, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms])
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

  // Two fixed task groups (day to day, weekly): each has a colour and the name of its Google calendar.
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [exportOpen, setExportOpen] = useState(false)
  useEffect(() => saveSettings(settings), [settings])
  const groupColors = { daily: settings.daily.color, weekly: settings.weekly.color }

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

  const busyTimes = useMemo(() => busyByDay(events, weekStart), [events, weekStart])
  const placements = useMemo(() => placementsOf(tasks), [tasks])
  const unplaced = useMemo(() => tasks.filter((t) => !t.slot), [tasks])

  // Short-lived feedback: where a task landed, and which block should pulse so it's easy to find.
  const [notice, setNotice] = useState<PlacedNotice | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  useExpiry(notice, () => setNotice(null), 7000)
  useExpiry(highlightId, () => setHighlightId(null), 2600)
  const said = (text: string, day: number | null) => setNotice({ text, day, key: Date.now() })
  const whereText = (day: number, startMin: number) => `${DAY_FULL[day]} at ${hhmm(startMin)}`

  function onAdd(day: number | null, title: string, mins: number) {
    const next = autoPlace(addTask(tasks, { title, mins, day }), placeOpts())
    const added = next[next.length - 1]
    setTasksByWeek((all) => ({ ...all, [weekStart]: next }))
    if (added.slot) {
      setHighlightId(added.id)
      said(`Placed on ${whereText(added.slot.day, added.slot.startMin)}.`, day)
    } else {
      said("Added, but there's no free gap for it this week.", day)
    }
  }

  // The last deletion, so it can be undone for a few seconds.
  const [undo, setUndo] = useState<{ task: Task; index: number; week: number } | null>(null)
  useExpiry(undo, () => setUndo(null), 9000)

  function onRemove(id: string) {
    const index = tasks.findIndex((t) => t.id === id)
    if (index < 0) return
    setUndo({ task: tasks[index], index, week: weekStart })
    editTasks((t) => removeTask(t, id))
  }

  function onUndo() {
    if (!undo) return
    const { task, index, week } = undo
    const opts = scheduleOpts(events, week, today)
    setTasksByWeek((all) => ({ ...all, [week]: autoPlace(restoreTask(all[week] ?? [], task, index), opts) }))
    setUndo(null)
  }

  /** A task with no free gap: put it where it clashes least, marked as an overlap if it must. */
  function onPlaceAnyway(id: string) {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    const spot = leastBadSlot(task, busyTimes, placements, Math.min(7, Math.max(0, today - weekStart)))
    if (!spot) {
      setError(`"${task.title}" is longer than the 06:00 to 22:00 day, so it can't be placed.`)
      return
    }
    editTasks((t) => moveTask(t, id, spot.day, spot.startMin, spot.overlap > 0))
    setHighlightId(id)
    said(
      spot.overlap > 0
        ? `Placed on ${whereText(spot.day, spot.startMin)}, overlapping for ${spot.overlap} min. Drag it to move it.`
        : `Placed on ${whereText(spot.day, spot.startMin)}.`,
      task.day,
    )
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const imported = await importCalendarFile(file)
      if (events.length) {
        const calendars = new Set(events.map((e) => e.calendar)).size
        const ok = window.confirm(
          `Replace the ${events.length} events from ${calendars} calendar${calendars === 1 ? '' : 's'} you imported before with the ${imported.length} events in "${file.name}"?`,
        )
        if (!ok) return
      }
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
          colors={groupColors}
          weekStart={weekStart}
          tasks={tasks}
          notice={notice}
          onAdd={onAdd}
          onEdit={(id, patch) => editTasks((t) => autoPlace(updateTask(t, id, patch), placeOpts()))}
          onRemove={onRemove}
          onPlaceAnyway={onPlaceAnyway}
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
              busy={busyTimes}
              groupColors={groupColors}
              canExport={placements.length > 0}
              onExport={() => setExportOpen(true)}
              onMoveTask={(id, day, startMin, forced) => editTasks((t) => moveTask(t, id, day, startMin, forced))}
              highlightId={highlightId}
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
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tasks={tasks}
        weekStart={weekStart}
        settings={settings}
        onSettings={setSettings}
      />
      {undo && (
        <div className="toast" role="status">
          <span>Deleted “{undo.task.title}”.</span>
          <button className="btn small" onClick={onUndo}>
            Undo
          </button>
          <button className="x" aria-label="Dismiss" onClick={() => setUndo(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}
