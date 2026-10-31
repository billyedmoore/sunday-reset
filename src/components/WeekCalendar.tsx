import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { calendarColors } from '../colors'
import { DAY_FULL, DAY_SHORT, MONTHS, hhmm } from '../format'
import { fromDayNum, midnightOf } from '../ical/dates'
import { eventsBetween, splitByDay, type Segment } from '../ical/expand'
import type { StoredEvent } from '../ical/parse'
import { layoutLanes } from '../lanes'
import { DAY_END, DAY_START, STEP_MIN, slotFree, type Busy, type Placement } from '../schedule'
import { GROUPS, GROUP_LABEL, groupOf, type Group } from '../settings'
import { formatDuration, type Task } from '../tasks'

const START_HOUR = DAY_START / 60
const END_HOUR = DAY_END / 60
const RANGE_MIN = DAY_END - DAY_START
/** The shortest a block is drawn, so a 15 minute event is still readable without looking longer. */
const MIN_CHIP_PX = 14
/** Blocks shorter than this (about an hour on a laptop) show the title and time on one line. */
const SHORT_PX = 48

type Lane = { lane: number; lanes: number }

/** Position within the visible hours, as a percentage of the column height. */
const pct = (min: number) => `${Math.min(100, Math.max(0, ((min - DAY_START) / RANGE_MIN) * 100))}%`
/** The share of the column width a lane covers, from 0 to 1. */
const xRange = (s: Lane) => [s.lane / s.lanes, (s.lane + 1) / s.lanes] as const
const segKey = (s: Segment) => `${s.occ.id}-${s.day}`

function laneStyle(lane: number, lanes: number): CSSProperties {
  return { left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }
}

function timeStyle(start: number, end: number): CSSProperties {
  return { top: pct(start), height: `calc(${pct(end)} - ${pct(start)} - 2px)` }
}

/** Marks events that fall wholly outside the visible hours. */
function EdgeMarker({ dir, segs }: { dir: 'top' | 'bottom'; segs: Segment[] }) {
  if (segs.length === 0) return null
  const names = segs.map((s) => s.occ.title).join(', ')
  const up = dir === 'top'
  return (
    <div
      className={`edge ${dir}`}
      role="note"
      title={`${up ? 'Before' : 'After'} ${hhmm(up ? DAY_START : DAY_END)}: ${names}`}
      aria-label={`${segs.length} ${up ? 'earlier' : 'later'} event${segs.length > 1 ? 's' : ''}: ${names}`}
    >
      {up ? '↑' : '↓'} {segs.length}
    </div>
  )
}

function rangeLabel(s: Segment): string {
  if (s.occ.allDay || s.wholeDay) return ''
  const from = s.continuesBefore ? '' : hhmm(s.startMin)
  const to = s.continuesAfter ? '' : hhmm(s.endMin)
  return from && to ? `${from}-${to}` : from ? `${from} →` : `→ ${to}`
}

function timeLabel(s: Segment): string {
  const range = rangeLabel(s)
  if (!s.occ.location) return range
  return range ? `${range} · ${s.occ.location}` : s.occ.location
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
  /** A calendar file is being read, so importing is unavailable for a moment. */
  importing: boolean
  /** Tasks placed into free time. These are shown here only, not written to any calendar. */
  placements: Placement[]
  unplaced: Task[]
  canShuffle: boolean
  onShuffle: () => void
  /** When you're busy each day, so a dragged task can't land on an event. */
  busy: Busy[][]
  /** Colour of each task group (day to day / weekly). */
  groupColors: Record<Group, string>
  canExport: boolean
  onExport: () => void
  /** `forced` means the user chose to overlap something. */
  onMoveTask: (id: string, day: number, startMin: number, forced: boolean) => void
  /** A task that was just added or placed, which pulses briefly so you can see where it landed. */
  highlightId: string | null
}

interface DayColumnProps {
  colRef: (el: HTMLDivElement | null) => void
  /** Index of the day within the week, 0 for Monday. */
  index: number
  /** London day number. */
  day: number
  isToday: boolean
  hourCount: number
  segments: Segment[]
  /** Task placements, with the one being dragged shown at its dragged position. */
  shown: Placement[]
  drag: { id: string; valid: boolean } | null
  clashing: Set<string>
  colors: Record<string, string>
  groupColors: Record<Group, string>
  highlightId: string | null
  pxPerMin: number
  onTaskDown: (e: ReactPointerEvent, taskId: string) => void
  onTaskKey: (e: ReactKeyboardEvent<HTMLElement>, taskId: string) => void
}

function DayColumn({
  colRef,
  index: i,
  day,
  isToday,
  hourCount,
  segments,
  shown,
  drag,
  clashing,
  colors,
  groupColors,
  highlightId,
  pxPerMin,
  onTaskDown,
  onTaskKey,
}: DayColumnProps) {
  const isShort = (start: number, end: number) => (end - start) * pxPerMin < SHORT_PX
  const daySegs = segments.filter((s) => s.day === day)
  const timed = daySegs.filter((s) => !s.wholeDay)
  const dayEvents = timed.filter((s) => s.endMin > DAY_START && s.startMin < DAY_END)
  // Events wholly outside the visible hours get a small marker instead of vanishing.
  const earlier = timed.filter((s) => s.endMin <= DAY_START)
  const later = timed.filter((s) => s.startMin >= DAY_END)
  // Events and forced tasks share lanes, so an overlap puts them side by side. A task being
  // dragged floats above instead and doesn't reshuffle the others.
  const forcedHere = shown.filter((p) => p.day === i && p.forced && drag?.id !== p.task.id)
  const lanes = layoutLanes([
    ...dayEvents.map((s) => ({ key: segKey(s), startMin: s.startMin, endMin: s.endMin })),
    ...forcedHere.map((p) => ({ key: `task-${p.task.id}`, startMin: p.startMin, endMin: p.startMin + p.task.mins })),
  ])
  const laneOf = (s: Segment): Lane => lanes.get(segKey(s)) ?? { lane: 0, lanes: 1 }
  // Where each drawn block sits (time and share of the column width), so a short block that
  // is drawn a little taller than its true length is never drawn into the next block below it.
  const shareOf = (p: Placement): Lane => {
    const own = p.forced ? lanes.get(`task-${p.task.id}`) : undefined
    return own && own.lanes > 1 ? own : p.forced ? { lane: 1, lanes: 2 } : { lane: 0, lanes: 1 }
  }
  const drawn = [
    ...dayEvents.map((s) => ({ start: s.startMin, x: xRange(laneOf(s)) })),
    ...shown.filter((p) => p.day === i && drag?.id !== p.task.id).map((p) => ({ start: p.startMin, x: xRange(shareOf(p)) })),
  ]
  /** The smallest height (px) a block may be drawn at: readable, but never into the block below. */
  const minHeightFor = (start: number, end: number, x: readonly [number, number]) => {
    let next = Infinity
    for (const o of drawn) if (o.start >= end && o.start < next && o.x[0] < x[1] && x[0] < o.x[1]) next = o.start
    const room = next === Infinity ? MIN_CHIP_PX : (next - start) * pxPerMin - 2
    return `${Math.max(6, Math.min(MIN_CHIP_PX, room))}px`
  }
  const blocks = daySegs.filter((s) => s.wholeDay)
  return (
    <div ref={colRef} className={`col${isToday ? ' today' : ''}`} style={{ ['--n' as string]: hourCount }}>
      {blocks.map((seg, b) => (
        <div
          key={segKey(seg)}
          className={`chip block${clashing.has(segKey(seg)) ? ' clash' : ''}`}
          title={seg.occ.calendar}
          style={{ ['--c' as string]: colors[seg.occ.calendar], ...laneStyle(b, blocks.length) }}
        >
          <div className="t">{seg.occ.title}</div>
          {seg.occ.location && <div className="m">{seg.occ.location}</div>}
        </div>
      ))}
      {dayEvents.map((seg) => {
        const own = laneOf(seg)
        const short = isShort(seg.startMin, seg.endMin)
        return (
          <div
            key={segKey(seg)}
            className={`chip timed${short ? ' short' : ''}${seg.continuesBefore ? ' before' : ''}${clashing.has(segKey(seg)) ? ' clash' : ''}`}
            title={`${seg.occ.title}${rangeLabel(seg) ? `, ${rangeLabel(seg)}` : ''} (${seg.occ.calendar})`}
            style={{
              ['--c' as string]: colors[seg.occ.calendar],
              minHeight: minHeightFor(seg.startMin, seg.endMin, xRange(own)),
              ...timeStyle(seg.startMin, seg.endMin),
              ...laneStyle(own.lane, own.lanes),
            }}
          >
            <div className="t">{seg.occ.title}</div>
            <div className="m">{short ? rangeLabel(seg) : timeLabel(seg)}</div>
          </div>
        )
      })}
      {shown
        .filter((p) => p.day === i)
        .map((p) => {
          // Forced tasks take their lane beside the event they overlap. With nothing beside
          // them (e.g. over a whole-day block) they take the right half so the block shows.
          const share = shareOf(p)
          const floating = drag?.id === p.task.id
          const end = p.startMin + p.task.mins
          return (
            <div
              key={p.task.id}
              data-group={groupOf(p.task)}
              className={`chip timed task-chip${isShort(p.startMin, end) ? ' short' : ''}${highlightId === p.task.id ? ' pulse' : ''}${p.forced ? ' forced' : ''}${floating ? (drag.valid ? ' dragging' : ' dragging invalid') : ''}`}
              onPointerDown={(e) => onTaskDown(e, p.task.id)}
              onKeyDown={(e) => onTaskKey(e, p.task.id)}
              tabIndex={0}
              role="button"
              aria-label={`${p.task.title}, ${DAY_FULL[p.day]} ${hhmm(p.startMin)} to ${hhmm(end)}${p.forced ? ', overlaps something' : ''}. Arrow keys move it.`}
              title={`${p.task.title}: ${hhmm(p.startMin)}-${hhmm(end)} (drag or use arrow keys to move)`}
              style={{
                ['--c' as string]: groupColors[groupOf(p.task)],
                minHeight: minHeightFor(p.startMin, end, xRange(share)),
                ...timeStyle(p.startMin, end),
                ...(floating ? laneStyle(0, 1) : laneStyle(share.lane, share.lanes)),
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
      <EdgeMarker dir="top" segs={earlier} />
      <EdgeMarker dir="bottom" segs={later} />
    </div>
  )
}

/** A light box floating over the calendar that offers the import, with a "?" popover on getting the file. */
function ImportIntro({ importing, onImport, onClose }: { importing: boolean; onImport: () => void; onClose: () => void }) {
  const [help, setHelp] = useState(false)

  // Escape closes the help first, then the box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (help) setHelp(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [help, onClose])

  return (
    <div className="import-intro" role="dialog" aria-label="Import your calendar">
      <button className="x" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <h3>Plan around your events</h3>
      <p>Tasks are placed in the gaps between your events.</p>
      <div className="import-actions">
        <button className="btn small" onClick={onImport} disabled={importing} autoFocus>
          {importing ? 'Importing…' : 'Import calendar'}
        </button>
        <button
          className="btn small ghost"
          onClick={() => setHelp((h) => !h)}
          aria-expanded={help}
          aria-controls="import-help"
          title="How to get a calendar file to import"
        >
          How?
        </button>
        <button className="btn small ghost" onClick={onClose}>
          Not now
        </button>
      </div>
      <p className="hint">Choose a Google Calendar .zip or an .ics file, or drop it anywhere.</p>
      {help && (
        <div className="import-help" id="import-help">
          <h4>From Google Calendar</h4>
          <ol>
            <li>
              In Google Calendar on a computer, open <b>Settings (gear) → Import &amp; export → Export</b>.
            </li>
            <li>
              Choose the downloaded <b>.zip</b> here, still zipped.
            </li>
          </ol>
          <p className="hint">
            Any <b>.ics</b> file works too. It is read in your browser and stays on this device.
          </p>
        </div>
      )}
    </div>
  )
}

export default function WeekCalendar({
  events,
  weekStart,
  today,
  onShift,
  onToday,
  onImport,
  importing,
  placements,
  unplaced,
  canShuffle,
  onShuffle,
  busy,
  groupColors,
  canExport,
  onExport,
  onMoveTask,
  highlightId,
}: Props) {
  const colors = useMemo(() => calendarColors(events), [events])
  const segments = useMemo(
    () => splitByDay(eventsBetween(events, midnightOf(weekStart), midnightOf(weekStart + 7)), weekStart, 7),
    [events, weekStart],
  )

  // The import box can be closed to use the app without a calendar; it comes back on the next visit.
  const [introClosed, setIntroClosed] = useState(false)

  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  // How tall the day columns are on screen, so a block's drawn size (and the side-by-side layout that
  // depends on it) matches what the user sees, not just the event's length.
  const [colH, setColH] = useState(0)
  useEffect(() => {
    const el = colRefs.current[0]
    if (!el) return
    const ro = new ResizeObserver(() => setColH(el.getBoundingClientRect().height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const pxPerMin = (colH || 640) / RANGE_MIN
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
        clashing.add(segKey(seg))
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

  const cancelPending = useCallback(() => {
    setPending(null)
    setDrag(null)
  }, [])

  function resolvePending(accept: boolean) {
    if (pending && accept) onMoveTask(pending.id, pending.day, pending.startMin, true)
    cancelPending()
  }

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelPending()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, cancelPending])

  /** Arrow keys move a focused task block: up/down by 15 minutes, left/right by a day. */
  function nudgeTask(e: ReactKeyboardEvent<HTMLElement>, taskId: string) {
    const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const dy = e.key === 'ArrowDown' ? STEP_MIN : e.key === 'ArrowUp' ? -STEP_MIN : 0
    const p = placements.find((x) => x.task.id === taskId)
    if (!p || (!dx && !dy)) return
    e.preventDefault()
    const day = p.day + dx
    const startMin = p.startMin + dy
    const mins = p.task.mins
    if (day < 0 || day > 6 || startMin < DAY_START || startMin + mins > DAY_END) return
    if (slotFree(busy, placements, taskId, day, startMin, mins)) {
      onMoveTask(taskId, day, startMin, false)
      return
    }
    // Overlaps something: show it there and ask, as a drag would.
    // The popup points at the spot it's previewed in, not where the block was.
    const r = e.currentTarget.getBoundingClientRect()
    const colW = e.currentTarget.parentElement?.getBoundingClientRect().width ?? r.width
    setDrag({ id: taskId, day, startMin, valid: false })
    setPending({ id: taskId, day, startMin, x: r.left + dx * colW, y: r.top + dy * pxPerMin, conflicts: conflictsAt(taskId, day, startMin, mins) })
  }

  /** Drag a task block: it follows the pointer in 15 minute steps and only lands on free time. */
  function startDrag(e: ReactPointerEvent, taskId: string) {
    const p = placements.find((x) => x.task.id === taskId)
    const firstCol = colRefs.current[0]
    if (e.button !== 0 || !p || !firstCol) return
    e.preventDefault()
    const { task, day: fromDay, startMin: fromMin } = p
    const minuteAt = (y: number) => {
      const r = firstCol.getBoundingClientRect()
      return DAY_START + ((y - r.top) / r.height) * RANGE_MIN
    }
    const grab = minuteAt(e.clientY) - fromMin // where inside the block it was picked up
    const origin = { x: e.clientX, y: e.clientY }
    let moved = false

    const target = (ev: PointerEvent) => {
      const r = firstCol.getBoundingClientRect()
      const day = Math.min(6, Math.max(0, Math.floor((ev.clientX - r.left) / r.width)))
      const raw = Math.round((minuteAt(ev.clientY) - grab) / STEP_MIN) * STEP_MIN
      const startMin = Math.min(DAY_END - task.mins, Math.max(DAY_START, raw))
      return { day, startMin, valid: slotFree(busy, placements, taskId, day, startMin, task.mins) }
    }
    function onMove(ev: PointerEvent) {
      if (!moved && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 4) return
      moved = true
      setDrag({ id: taskId, ...target(ev) })
    }
    function finish(ev: PointerEvent | null) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      if (!ev || !moved) {
        setDrag(null)
        return
      }
      const t = target(ev)
      if (t.day === fromDay && t.startMin === fromMin) {
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
          conflicts: conflictsAt(taskId, t.day, t.startMin, task.mins),
        })
      }
    }
    function onCancel() {
      finish(null)
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') finish(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
  }

  // A fixed 06:00–22:00 window, scaled to fit the panel. Events are clipped to it.
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

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
          title={canShuffle ? 'Shuffle tasks into different free slots' : 'Add a task first, then shuffle to try other slots'}
        >
          🎲 Shuffle
        </button>
        <button
          className="btn small"
          onClick={onExport}
          disabled={!canExport}
          title={canExport ? 'Export tasks to Google Calendar' : 'Nothing to export yet: add a task that fits on the calendar'}
        >
          Export
        </button>
        <button
          className="btn small ghost"
          onClick={onImport}
          disabled={importing}
          title={events.length ? undefined : 'Without a calendar, tasks are placed anywhere in the week'}
        >
          {importing ? 'Importing…' : events.length ? 'Re-import' : 'Import calendar'}
        </button>
      </div>
      {unplaced.length > 0 && (
        <p className="notice">
          {unplaced.length === 1 ? "1 task doesn't" : `${unplaced.length} tasks don't`} fit: {unplaced.map((t) => t.title).join(', ')}. Shorten
          {unplaced.length === 1 ? ' it' : ' them'} in the list, or place anyway.
        </p>
      )}

      <div className="cal-stage">
      <div className="cal-scroll">
        <div className="cal">
          <div className="row">
            <div className="dayhead" style={{ borderLeft: 0 }} />
            {DAY_SHORT.map((name, i) => {
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
            {DAY_SHORT.map((name, i) => (
              <DayColumn
                key={name}
                colRef={(el) => {
                  colRefs.current[i] = el
                }}
                index={i}
                day={weekStart + i}
                isToday={weekStart + i === today}
                hourCount={hours.length}
                segments={segments}
                shown={shown}
                drag={drag}
                clashing={clashing}
                colors={colors}
                groupColors={groupColors}
                highlightId={highlightId}
                pxPerMin={pxPerMin}
                onTaskDown={startDrag}
                onTaskKey={nudgeTask}
              />
            ))}
          </div>
        </div>
      </div>
      {events.length === 0 && !introClosed && (
        <ImportIntro importing={importing} onImport={onImport} onClose={() => setIntroClosed(true)} />
      )}
      </div>

      {pending && (
        <>
          <div className="pop-backdrop" onClick={() => resolvePending(false)} />
          <div
            className="conflict-pop"
            role="alertdialog"
            aria-label="This overlaps something"
            style={{
              left: Math.max(8, Math.min(pending.x, window.innerWidth - 260)),
              top: Math.max(8, Math.min(pending.y + 12, window.innerHeight - 160)),
            }}
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
        {/* The two task groups differ by shape as well as colour: dashed + dot, and dotted + diamond. */}
        {GROUPS.map((g) => (
          <span key={g}>
            <i className={`dot${g === 'weekly' ? ' diamond' : ''}`} style={{ ['--c' as string]: groupColors[g] }} />
            {GROUP_LABEL[g]} tasks
          </span>
        ))}
      </div>
    </>
  )
}
