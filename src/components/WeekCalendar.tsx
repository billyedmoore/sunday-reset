import { useMemo } from 'react'
import { calendarColors } from '../colors'
import { fromDayNum, midnightOf } from '../ical/dates'
import { eventsBetween, splitByDay, type Segment } from '../ical/expand'
import type { StoredEvent } from '../ical/parse'
import type { Placement } from '../schedule'
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

/** Greedy lane assignment so overlapping timed events sit side by side. */
function layoutLanes(segs: Segment[]): { seg: Segment; lane: number; lanes: number }[] {
  const sorted = [...segs].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  const laneEnds: number[] = []
  const placed = sorted.map((seg) => {
    let lane = laneEnds.findIndex((end) => end <= seg.startMin)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = seg.endMin
    return { seg, lane }
  })
  return placed.map((p) => ({ ...p, lanes: laneEnds.length }))
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
}: Props) {
  const colors = useMemo(() => calendarColors(events), [events])
  const segments = useMemo(
    () => splitByDay(eventsBetween(events, midnightOf(weekStart), midnightOf(weekStart + 7)), weekStart, 7),
    [events, weekStart],
  )

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
              const placed = layoutLanes(timed.filter((s) => s.day === day && visible(s)))
              const blocks = segments.filter((s) => s.wholeDay && s.day === day)
              return (
                <div
                  key={name}
                  className={`col${day === today ? ' today' : ''}`}
                  style={{ ['--n' as string]: hours.length }}
                >
                  {blocks.map((seg, b) => (
                    <div
                      key={`${seg.occ.id}-${seg.day}`}
                      className="chip block"
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
                  {placed.map(({ seg, lane, lanes }) => (
                    <div
                      key={`${seg.occ.id}-${seg.day}`}
                      className={`chip timed${seg.continuesBefore ? ' before' : ''}`}
                      title={`${seg.occ.title} (${seg.occ.calendar})`}
                      style={{
                        ['--c' as string]: colors[seg.occ.calendar],
                        top: pct(seg.startMin),
                        height: `calc(${pct(seg.endMin)} - ${pct(seg.startMin)} - 2px)`,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                    >
                      <div className="t">{seg.occ.title}</div>
                      <div className="m">{timeLabel(seg)}</div>
                    </div>
                  ))}
                  {placements
                    .filter((p) => p.day === i)
                    .map((p) => (
                      <div
                        key={p.task.id}
                        className="chip timed task-chip"
                        title={`${p.task.title}: ${hhmm(p.startMin)}-${hhmm(p.startMin + p.task.mins)}`}
                        style={{
                          top: pct(p.startMin),
                          height: `calc(${pct(p.startMin + p.task.mins)} - ${pct(p.startMin)} - 2px)`,
                          left: '2px',
                          width: 'calc(100% - 4px)',
                        }}
                      >
                        <div className="t">{p.task.title}</div>
                        <div className="m">
                          {hhmm(p.startMin)} · {formatDuration(p.task.mins)}
                        </div>
                      </div>
                    ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

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
