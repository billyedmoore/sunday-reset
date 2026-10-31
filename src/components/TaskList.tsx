import { useState, type FormEvent } from 'react'
import { fromDayNum } from '../ical/dates'
import type { Group } from '../settings'
import { DEFAULT_MINS, DURATIONS, formatDuration, tasksFor, totalMins, type Task } from '../tasks'

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Handlers {
  onAdd: (day: number | null, title: string, mins: number) => void
  onRemove: (id: string) => void
  onSetMins: (id: string, mins: number) => void
  /** Put a task that has no free gap on the calendar anyway, where it clashes least. */
  onPlaceAnyway: (id: string) => void
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

interface CardProps extends Handlers {
  variant: 'day' | 'general'
  color: string
  title: string
  note: string
  day: number | null
  tasks: Task[]
}

function TaskCard({ variant, color, title, note, day, tasks, onAdd, onRemove, onSetMins, onPlaceAnyway }: CardProps) {
  const mine = tasksFor(tasks, day)
  return (
    <section className={`task-card ${variant}`}>
      <header>
        <h3>
          <i className="dot" style={{ ['--c' as string]: color }} />
          {title}
        </h3>
        <span className="note">{mine.length ? `${note} · ${formatDuration(totalMins(mine))}` : note}</span>
      </header>
      <ul>
        {mine.length === 0 && <li className="empty">Nothing planned yet</li>}
        {mine.map((t) => (
          <li key={t.id} className={t.slot ? '' : 'unplaced'}>
            <span className="title">{t.title}</span>
            <DurationSelect value={t.mins} onChange={(m) => onSetMins(t.id, m)} label={`Time for ${t.title}`} />
            <button className="x" onClick={() => onRemove(t.id)} aria-label={`Delete ${t.title}`}>
              ×
            </button>
            {!t.slot && (
              <div className="unplaced-note" role="status">
                <span>
                  No free {formatDuration(t.mins)} gap {t.day === null ? 'this week' : `on ${DAY_SHORT[t.day]}`}.
                </span>
                <button className="btn small ghost" onClick={() => onPlaceAnyway(t.id)}>
                  Place anyway
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <AddRow label={title} onAdd={(text, mins) => onAdd(day, text, mins)} />
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
}

export default function TaskList({ weekStart, today, tasks, colors, ...handlers }: Props) {
  const [selected, setSelected] = useState(() => (today >= weekStart && today < weekStart + 7 ? today - weekStart : 0))
  const { d, m } = fromDayNum(weekStart + selected)

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

      <TaskCard variant="day" color={colors.daily} title={DAY_FULL[selected]} note={`${d} ${MONTHS[m - 1]}`} day={selected} tasks={tasks} {...handlers} />
      <TaskCard variant="general" color={colors.weekly} title="Any time this week" note="No set day" day={null} tasks={tasks} {...handlers} />
    </div>
  )
}
