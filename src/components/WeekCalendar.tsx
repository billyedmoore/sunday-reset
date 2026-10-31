import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { calendarColors } from '../colors'
import { fromDayNum, midnightOf } from '../ical/dates'
import { eventsBetween, splitByDay, type Segment } from '../ical/expand'
import type { StoredEvent } from '../ical/parse'
import { layoutLanes } from '../lanes'
import { slotFree, type Busy, type Placement } from '../schedule'
import { formatDuration, type Task } from '../tasks'

const START_HOUR = 6
const END_HOUR = 22
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`

function timeLabel(s: Segment): string {
  if (s.occ.allDay || s.wholeDay) return s.occ.location
  const from = s.continuesBefore ? '' : hhmm(s.startMin)
  const to = s.continuesAfter ? '' : hhmm(s.endMin)
  const range = from && to ? `${from}-${to}` : from ? `${from} →` : `→ ${to}`
  return s.occ.location ? `${range} · ${s.occ.location}` : range
}

interface Props {
  events: StoredEvent[]
  /** London day number of the Monday that starts the displayed week. */
  weekStart: number
  /** London day number of today, for highlighting. */
  today: number
  onShift: (weeks: number) => void
  onToday: () => void
  onImport: () => void
  /** Tasks placed into free time. These are shown here only, not written to any calendar. */
  placements: Placement[]
  unplaced: Task[]
  canShuffle: boolean
  onShuffle: () => void
  /** When you're busy each day, so a dragged task can't land on an event. */
  busy: Busy[][]
  /** `forced` means the user chose to overlap something. */
  onMoveTask: (id: string, day: number, startMin: number, forced: boolean) => void
}

export default function WeekCalendar({
  events,
  weekStart,
  today,
  onShift,
  onToday,
  onImport,
  placements,
  unplaced,
  canShuffle,
  onShuffle,
  busy,
  onMoveTask,
}: Props) {
  const colors = useMemo(() => calendarColors(events), [events])
  const segments = useMemo(
    () => splitByDay(eventsBetween(events, midnightOf(weekStart), midnightOf(weekStart + 7)), weekStart, 7),
    [events, weekStart],
  )

  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  const [drag, setDrag] = useState<{ id: string; day: number; startMin: number; valid: boolean } | null>(null)
  // A drop that overlaps something waits here for the user to say "put it there anyway" or cancel.
  const [pending, setPending] = useState<{
    id: string
    day: number
    startMin: number
    x: number
    y: number
    conflicts: string[]
  } | null>(null)
  // Events the dragged task would currently overlap; they get a red outline so they stay visible.
  const clashing = new Set<string>()
  if (drag && !drag.valid) {
    const mins = placements.find((p) => p.task.id === drag.id)?.task.mins ?? 0
    for (const seg of segments) {
      if (!seg.occ.allDay && seg.day === weekStart + drag.day && seg.startMin < drag.startMin + mins && seg.endMin > drag.startMin) {
        clashing.add(`${seg.occ.id}-${seg.day}`)
      }
    }
  }
  const shown = placements.map((p) => (drag?.id === p.task.id ? { ...p, day: drag.day, startMin: drag.startMin } : p))

  /** Names of the events and other tasks a task would overlap at this spot. */
  function conflictsAt(taskId: string, day: number, startMin: number, mins: number): string[] {
    const end = startMin + mins
    const events = segments
      .filter((s) => !s.occ.allDay && s.day === weekStart + day && s.startMin < end && s.endMin > startMin)
      .map((s) => s.occ.title)
    const tasks = placements
      .filter((p) => p.task.id !== taskId && p.day === day && p.startMin < end && p.startMin + p.task.mins > startMin)
      .map((p) => p.task.title)
    return [...new Set([...events, ...tasks])]
  }

  function resolvePending(accept: boolean) {
    if (pending && accept) onMoveTask(pending.id, pending.day, pending.startMin, true)
    setPending(null)
    setDrag(null)
  }

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPending(null)
        setDrag(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  /** Drag a task block: it follows the pointer in 15 minute steps and only lands on free time. */
  function startDrag(e: ReactPointerEvent, taskId: string) {
    const p = placements.find((x) => x.task.id === taskId)
    const firstCol = colRefs.current[0]
    if (e.button !== 0 || !p || !firstCol) return
    e.preventDefault()
    const rangeMin = (END_HOUR - START_HOUR) * 60
    const minuteAt = (y: number) => {
      const r = firstCol.getBoundingClientRect()
      return START_HOUR * 60 + ((y - r.top) / r.height) * rangeMin
    }
    const grab = minuteAt(e.clientY) - p.startMin // where inside the block it was picked up
    const origin = { x: e.clientX, y: e.clientY }
    let moved = false

    const target = (ev: PointerEvent) => {
      const r = firstCol.getBoundingClientRect()
      const day = Math.min(6, Math.max(0, Math.floor((ev.clientX - r.left) / r.width)))
      const raw = Math.round((minuteAt(ev.clientY) - grab) / 15) * 15
      const startMin = Math.min(END_HOUR * 60 - p!.task.mins, Math.max(START_HOUR * 60, raw))
      return { day, startMin, valid: slotFree(busy, placements, taskId, day, startMin, p!.task.mins) }
    }
    function onMove(ev: PointerEvent) {
      if (!moved && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 4) return
      moved = true
      setDrag({ id: taskId, ...target(ev) })
    }
    function finish(ev: PointerEvent | null) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      if (!ev || !moved) {
        setDrag(null)
        return
      }
      const t = target(ev)
      if (t.day === p!.day && t.startMin === p!.startMin) {
        setDrag(null)
      } else if (t.valid) {
        setDrag(null)
        onMoveTask(taskId, t.day, t.startMin, false)
      } else {
        // Overlaps something: keep the block where it was dropped and ask.
        setDrag({ id: taskId, ...t })
        setPending({
          id: taskId,
          day: t.day,
          startMin: t.startMin,
          x: ev.clientX,
          y: ev.clientY,
          conflicts: conflictsAt(taskId, t.day, t.startMin, p!.task.mins),
        })
      }
    }
    function onUp(ev: PointerEvent) {
      finish(ev)
    }
    function onCancel() {
      finish(null)
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') finish(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
  }

  const timed = segments.filter((s) => !s.wholeDay)
  // A fixed 06:00–22:00 window, scaled to fit the panel. Events are clipped to it.
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const pct = (min: number) =>
    `${Math.min(100, Math.max(0, ((min - START_HOUR * 60) / ((END_HOUR - START_HOUR) * 60)) * 100))}%`
  const visible = (s: Segment) => s.endMin > START_HOUR * 60 && s.startMin < END_HOUR * 60

  const first = fromDayNum(weekStart)
  const last = fromDayNum(weekStart + 6)
  const title = `${first.d} ${MONTHS[first.m - 1]} – ${last.d} ${MONTHS[last.m - 1]} ${last.y}`
  const calendars = Object.keys(colors)

  return (
    <>
      <div className="cal-head">
        <button className="btn small ghost" onClick={() => onShift(-1)} aria-label="Previous week">‹</button>
        <button className="btn small ghost" onClick={() => onShift(1)} aria-label="Next week">›</button>
        <button className="btn small ghost" onClick={onToday}>Upcoming week</button>
        <h2 className="cal-title">{title}</h2>
        <button
          className="btn small dice"
          onClick={onShuffle}
          disabled={!canShuffle}
          title="Shuffle tasks into different free slots"
          aria-label="Shuffle tasks"
        >
          🎲
        </button>
        <button className="btn small ghost" onClick={onImport}>Re-import</button>
      </div>
      {unplaced.length > 0 && (
        <p className="error">Couldn't fit: {unplaced.map((t) => `${t.title} (${formatDuration(t.mins)})`).join(', ')}</p>
      )}

      <div className="cal-scroll">
        <div className="cal">
          <div className="row">
            <div className="dayhead" style={{ borderLeft: 0 }} />
            {DAY_NAMES.map((name, i) => {
              const { d } = fromDayNum(weekStart + i)
              return (
                <div key={name} className={`dayhead${weekStart + i === today ? ' today' : ''}`}>
                  {name}
                  <b>{d}</b>
                </div>
              )
            })}
          </div>

          <div className="row body">
            <div className="hours">
              {hours.map((h, i) => (
                <div key={h} className="hour-label" style={{ top: `${(i / hours.length) * 100}%` }}>
                  {i > 0 && hhmm(h * 60)}
                </div>
              ))}
            </div>
            {DAY_NAMES.map((name, i) => {
              const day = weekStart + i
              const dayEvents = timed.filter((s) => s.day === day && visible(s))
              const eventKey = (s: Segment) => `${s.occ.id}-${s.day}`
              // Events and forced tasks share lanes, so an overlap puts them side by side. A task being
              // dragged floats above instead and doesn't reshuffle the others.
              const forcedHere = shown.filter((p) => p.day === i && p.forced && drag?.id !== p.task.id)
              const lanes = layoutLanes([
                ...dayEvents.map((s) => ({ key: eventKey(s), startMin: s.startMin, endMin: s.endMin })),
                ...forcedHere.map((p) => ({ key: `task-${p.task.id}`, startMin: p.startMin, endMin: p.startMin + p.task.mins })),
              ])
              const blocks = segments.filter((s) => s.wholeDay && s.day === day)
              return (
                <div
                  key={name}
                  ref={(el) => {
                    colRefs.current[i] = el
                  }}
                  className={`col${day === today ? ' today' : ''}`}
                  style={{ ['--n' as string]: hours.length }}
                >
                  {blocks.map((seg, b) => (
                    <div
                      key={`${seg.occ.id}-${seg.day}`}
                      className={`chip block${clashing.has(`${seg.occ.id}-${seg.day}`) ? ' clash' : ''}`}
                      title={seg.occ.calendar}
                      style={{
                        ['--c' as string]: colors[seg.occ.calendar],
                        left: `calc(${(b / blocks.length) * 100}% + 2px)`,
                        width: `calc(${100 / blocks.length}% - 4px)`,
                      }}
                    >
                      <div className="t">{seg.occ.title}</div>
                      {seg.occ.location && <div className="m">{seg.occ.location}</div>}
                    </div>
                  ))}
                  {dayEvents.map((seg) => {
                    const { lane, lanes: count } = lanes.get(eventKey(seg)) ?? { lane: 0, lanes: 1 }
                    return (
                    <div
                      key={`${seg.occ.id}-${seg.day}`}
                      className={`chip timed${seg.continuesBefore ? ' before' : ''}${clashing.has(`${seg.occ.id}-${seg.day}`) ? ' clash' : ''}`}
                      title={`${seg.occ.title} (${seg.occ.calendar})`}
                      style={{
                        ['--c' as string]: colors[seg.occ.calendar],
                        top: pct(seg.startMin),
                        height: `calc(${pct(seg.endMin)} - ${pct(seg.startMin)} - 2px)`,
                        left: `calc(${(lane / count) * 100}% + 2px)`,
                        width: `calc(${100 / count}% - 4px)`,
                      }}
                    >
                      <div className="t">{seg.occ.title}</div>
                      <div className="m">{timeLabel(seg)}</div>
                    </div>
                    )
                  })}
                  {shown
                    .filter((p) => p.day === i)
                    .map((p) => {
                      // Forced tasks take their lane beside the event they overlap. With nothing beside
                      // them (e.g. over a whole-day block) they take the right half so the block shows.
                      const own = p.forced ? lanes.get(`task-${p.task.id}`) : undefined
                      const share = own && own.lanes > 1 ? own : p.forced ? { lane: 1, lanes: 2 } : { lane: 0, lanes: 1 }
                      const floating = drag?.id === p.task.id
                      return (
                      <div
                        key={p.task.id}
                        className={`chip timed task-chip${p.forced ? ' forced' : ''}${drag?.id === p.task.id ? (drag.valid ? ' dragging' : ' dragging invalid') : ''}`}
                        onPointerDown={(e) => startDrag(e, p.task.id)}
                        title={`${p.task.title}: ${hhmm(p.startMin)}-${hhmm(p.startMin + p.task.mins)} (drag to move)`}
                        style={{
                          top: pct(p.startMin),
                          height: `calc(${pct(p.startMin + p.task.mins)} - ${pct(p.startMin)} - 2px)`,
                          left: floating ? '2px' : `calc(${(share.lane / share.lanes) * 100}% + 2px)`,
                          width: floating ? 'calc(100% - 4px)' : `calc(${100 / share.lanes}% - 4px)`,
                        }}
                      >
                        <div className="t">{p.task.title}</div>
                        <div className="m">
                          {p.forced ? '⚠ overlaps · ' : ''}
                          {hhmm(p.startMin)} · {formatDuration(p.task.mins)}
                        </div>
                      </div>
                      )
                    })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {pending && (
        <>
          <div className="pop-backdrop" onClick={() => resolvePending(false)} />
          <div
            className="conflict-pop"
            role="alertdialog"
            aria-label="This overlaps something"
            style={{ left: Math.min(pending.x, window.innerWidth - 260), top: Math.min(pending.y + 12, window.innerHeight - 160) }}
          >
            <p>
              This overlaps <b>{pending.conflicts.join(', ') || 'something'}</b>.
            </p>
            <div>
              <button className="btn small" onClick={() => resolvePending(true)} autoFocus>
                Put it here anyway
              </button>
              <button className="btn small ghost" onClick={() => resolvePending(false)}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      <div className="legend">
        {calendars.map((c) => (
          <span key={c}>
            <i style={{ ['--c' as string]: colors[c] }} />
            {c}
          </span>
        ))}
      </div>
    </>
  )
}
