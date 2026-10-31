import { useState, type FormEvent } from 'react'
import { DAY_FULL, DAY_SHORT, MONTHS } from '../format'
import { fromDayNum } from '../ical/dates'
import { GROUP_LABEL, type Group } from '../settings'
import { DEFAULT_MINS, DURATIONS, formatDuration, tasksFor, totalMins, type Task } from '../tasks'

interface Handlers {
  onAdd: (day: number | null, title: string, mins: number) => void
  onRemove: (id: string) => void
  onSetMins: (id: string, mins: number) => void
  onEdit: (id: string, patch: { title?: string; day?: number | null }) => void
  /** Put a task that has no free gap on the calendar anyway, where it clashes least. */
  onPlaceAnyway: (id: string) => void
}

/** Where a task was just put, said out loud under the list it was added to. */
export interface PlacedNotice {
  text: string
  /** The list it belongs to: a day index, or null for the weekly list. */
  day: number | null
  key: number
}

function DurationSelect({ value, onChange, label }: { value: number; onChange: (m: number) => void; label: string }) {
  const options = DURATIONS.includes(value) ? DURATIONS : [...DURATIONS, value].sort((a, b) => a - b)
  return (
    <select className="dur" value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((m) => (
        <option key={m} value={m}>
          {formatDuration(m)}
        </option>
      ))}
    </select>
  )
}

function AddRow({ label, onAdd }: { label: string; onAdd: (title: string, mins: number) => void }) {
  const [title, setTitle] = useState('')
  const [mins, setMins] = useState(DEFAULT_MINS)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onAdd(title, mins)
    setTitle('')
  }

  return (
    <form className="add-row" onSubmit={submit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" aria-label={`New task: ${label}`} />
      <DurationSelect value={mins} onChange={setMins} label="How long it will take" />
      <button className="btn small" type="submit" aria-label={`Add task: ${label}`}>
        +
      </button>
    </form>
  )
}

/** The task's name, edited in place: click (or Enter) to change it, Enter to save, Esc to cancel. */
function EditableTitle({ title, onSave }: { title: string; onSave: (title: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)

  if (!editing) {
    return (
      <button
        className="title title-button"
        onClick={() => {
          setDraft(title)
          setEditing(true)
        }}
        aria-label={`Rename task: ${title}`}
        title="Click to rename"
      >
        {title}
      </button>
    )
  }
  const finish = (save: boolean) => {
    setEditing(false)
    if (save && draft.trim() && draft.trim() !== title) onSave(draft)
  }
  return (
    <input
      className="title title-input"
      value={draft}
      autoFocus
      aria-label="Task name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
    />
  )
}

interface RowProps extends Omit<Handlers, 'onAdd'> {
  task: Task
  weekStart: number
}

function TaskRow({ task, weekStart, onRemove, onSetMins, onEdit, onPlaceAnyway }: RowProps) {
  const unplaced = !task.slot
  return (
    <li className={unplaced ? 'unplaced' : ''}>
      <EditableTitle title={task.title} onSave={(title) => onEdit(task.id, { title })} />
      <select
        className="dur"
        value={task.day === null ? 'any' : String(task.day)}
        aria-label={`Day for ${task.title}`}
        onChange={(e) => onEdit(task.id, { day: e.target.value === 'any' ? null : Number(e.target.value) })}
      >
        <option value="any">Any</option>
        {DAY_SHORT.map((name, i) => (
          <option key={name} value={i}>
            {name} {fromDayNum(weekStart + i).d}
          </option>
        ))}
      </select>
      <DurationSelect value={task.mins} onChange={(m) => onSetMins(task.id, m)} label={`Time for ${task.title}`} />
      <button className="x" onClick={() => onRemove(task.id)} aria-label={`Delete ${task.title}`}>
        ×
      </button>
      {unplaced && (
        <div className="unplaced-note" role="status">
          <span>No free {formatDuration(task.mins)} gap {task.day === null ? 'this week' : `on ${DAY_SHORT[task.day]}`}.</span>
          <button className="btn small ghost" onClick={() => onPlaceAnyway(task.id)}>
            Place anyway
          </button>
        </div>
      )}
    </li>
  )
}

interface CardProps extends Handlers {
  variant: 'day' | 'general'
  color: string
  title: string
  note: string
  day: number | null
  tasks: Task[]
  weekStart: number
  notice: PlacedNotice | null
  /** True when the whole week has no tasks, so the empty list can say what to do. */
  weekEmpty: boolean
}

function TaskCard({ variant, color, title, note, day, tasks, weekStart, notice, weekEmpty, onAdd, ...rowHandlers }: CardProps) {
  const mine = tasksFor(tasks, day)
  return (
    <section className={`task-card ${variant}`}>
      <header>
        <h2>
          <i className="dot" style={{ ['--c' as string]: color }} aria-hidden="true" />
          {title}
        </h2>
        <span className="note">{mine.length ? `${note} · ${formatDuration(totalMins(mine))}` : note}</span>
      </header>
      <ul>
        {mine.length === 0 && (
          <li className="empty">
            {weekEmpty ? 'Add what needs doing this week. Each task is placed in free time on the calendar for you.' : 'Nothing planned yet'}
          </li>
        )}
        {mine.map((t) => (
          <TaskRow key={t.id} task={t} weekStart={weekStart} {...rowHandlers} />
        ))}
      </ul>
      <AddRow label={title} onAdd={(text, mins) => onAdd(day, text, mins)} />
      {notice && notice.day === day && (
        <p key={notice.key} className="placed-note" role="status">
          {notice.text}
        </p>
      )}
    </section>
  )
}

interface Props extends Handlers {
  /** London day number of the displayed week's Monday. */
  weekStart: number
  /** London day number of today, to start on today's tab when it's in the shown week. */
  today: number
  tasks: Task[]
  /** Colour of each task group, shown as a dot so the lists match the calendar. */
  colors: Record<Group, string>
  notice: PlacedNotice | null
}

export default function TaskList({ weekStart, today, tasks, colors, notice, ...handlers }: Props) {
  const [selected, setSelected] = useState(() => (today >= weekStart && today < weekStart + 7 ? today - weekStart : 0))
  const { d, m } = fromDayNum(weekStart + selected)
  const weekEmpty = tasks.length === 0

  return (
    <div className="tasks" aria-label="Things to do this week">
      <div className="day-tabs" role="tablist" aria-label="Day of the week">
        {DAY_SHORT.map((name, i) => {
          const count = tasksFor(tasks, i).length
          const date = fromDayNum(weekStart + i).d
          return (
            <button
              key={name}
              role="tab"
              aria-selected={i === selected}
              className={`day-tab${i === selected ? ' selected' : ''}${weekStart + i === today ? ' today' : ''}`}
              onClick={() => setSelected(i)}
            >
              {name}
              <b>{date}</b>
              <span className="count">{count ? `${count} task${count > 1 ? 's' : ''}` : ''}</span>
            </button>
          )
        })}
      </div>

      <TaskCard
        variant="day"
        color={colors.daily}
        title={DAY_FULL[selected]}
        note={`${d} ${MONTHS[m - 1]} · ${GROUP_LABEL.daily}`}
        day={selected}
        tasks={tasks}
        weekStart={weekStart}
        notice={notice}
        weekEmpty={weekEmpty}
        {...handlers}
      />
      <TaskCard
        variant="general"
        color={colors.weekly}
        title={GROUP_LABEL.weekly}
        note="Any time this week"
        day={null}
        tasks={tasks}
        weekStart={weekStart}
        notice={notice}
        weekEmpty={false}
        {...handlers}
      />
    </div>
  )
}
