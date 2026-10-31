import { useEffect, useRef, useState } from 'react'
import { downloadText } from '../download'
import { buildIcs, exportableTasks, icsFilename } from '../exportIcs'
import { DAY_SHORT, MONTHS, pad } from '../format'
import { fromDayNum } from '../ical/dates'
import { GROUP_LABEL, type Group, type Settings } from '../settings'
import { formatDuration, totalMins, type Task } from '../tasks'

const REMINDERS = [0, 5, 10, 15, 30, 60]


interface Props {
  open: boolean
  onClose: () => void
  /** This week's tasks. */
  tasks: Task[]
  /** London day number of the week's Monday. */
  weekStart: number
  settings: Settings
  onSettings: (s: Settings) => void
}

interface CardProps {
  group: Group
  tasks: Task[]
  weekStart: number
  settings: Settings
  onSettings: (s: Settings) => void
}

function GroupCard({ group, tasks, weekStart, settings, onSettings }: CardProps) {
  const list = exportableTasks(tasks, group).sort(
    (a, b) => a.slot!.day - b.slot!.day || a.slot!.startMin - b.slot!.startMin,
  )
  const g = settings[group]
  const setGroup = (patch: Partial<typeof g>) => onSettings({ ...settings, [group]: { ...g, ...patch } })

  function onDownload() {
    const ics = buildIcs(list, {
      calendarName: g.name,
      color: g.color,
      weekStart,
      reminderMins: settings.reminderMins,
      busy: settings.busy,
    })
    downloadText(icsFilename(group, weekStart), ics, 'text/calendar;charset=utf-8')
  }

  return (
    <section className="export-group" style={{ ['--c' as string]: g.color }}>
      <div className="eg-head">
        <input
          type="color"
          value={g.color}
          onChange={(e) => setGroup({ color: e.target.value })}
          aria-label={`${GROUP_LABEL[group]} colour`}
        />
        <div>
          <h3>{GROUP_LABEL[group]}</h3>
          <span className="note">
            {group === 'daily' ? 'Tasks you gave a day' : 'Tasks for any time this week'}
          </span>
        </div>
      </div>

      <label className="field">
        Google calendar name
        <input value={g.name} onChange={(e) => setGroup({ name: e.target.value })} />
      </label>

      {list.length === 0 ? (
        <p className="hint">Nothing here is on the calendar yet.</p>
      ) : (
        <ul className="eg-list">
          {list.map((t) => {
            const { d, m } = fromDayNum(weekStart + t.slot!.day)
            const s = t.slot!.startMin
            return (
              <li key={t.id}>
                <span className="when">
                  {DAY_SHORT[t.slot!.day]} {d} {MONTHS[m - 1]} · {pad(Math.floor(s / 60))}:{pad(s % 60)}
                </span>
                <span className="what">{t.title}</span>
                <span className="len">{formatDuration(t.mins)}</span>
              </li>
            )
          })}
        </ul>
      )}

      <button className="btn" onClick={onDownload} disabled={list.length === 0}>
        Download .ics ({list.length} task{list.length === 1 ? '' : 's'}
        {list.length ? ` · ${formatDuration(totalMins(list))}` : ''})
      </button>
    </section>
  )
}

export default function ExportDialog({ open, onClose, tasks, weekStart, settings, onSettings }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState<Group | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  async function copyHex(group: Group) {
    try {
      await navigator.clipboard.writeText(settings[group].color)
      setCopied(group)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // clipboard blocked: the hex is shown next to the button to copy by hand
    }
  }

  const unplaced = tasks.filter((t) => !t.slot)
  const forced = tasks.filter((t) => t.slot?.forced)

  return (
    <dialog
      ref={ref}
      className="export-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose() // click on the backdrop
      }}
    >
      <div className="export-body">
        <header>
          <h2>Export to Google Calendar</h2>
          <button className="x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {unplaced.length > 0 && (
          <p className="error">
            Not on the calendar, so not exported: {unplaced.map((t) => t.title).join(', ')}.
          </p>
        )}
        {forced.length > 0 && (
          <p className="hint">
            {forced.length} task{forced.length === 1 ? '' : 's'} overlap{forced.length === 1 ? 's' : ''} another event
            (noted in the task's description).
          </p>
        )}

        <div className="export-groups">
          {(['daily', 'weekly'] as const).map((group) => (
            <GroupCard key={group} group={group} tasks={tasks} weekStart={weekStart} settings={settings} onSettings={onSettings} />
          ))}
        </div>

        <div className="export-options">
          <label className="field inline">
            Reminder
            <select
              className="dur"
              value={settings.reminderMins}
              onChange={(e) => onSettings({ ...settings, reminderMins: Number(e.target.value) })}
            >
              {REMINDERS.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'None' : `${m} min before`}
                </option>
              ))}
            </select>
          </label>
          <label className="field inline">
            <input
              type="checkbox"
              checked={settings.busy}
              onChange={(e) => onSettings({ ...settings, busy: e.target.checked })}
            />
            Show as busy
          </label>
        </div>

        <details className="export-help" open>
          <summary>How to get these into Google Calendar</summary>
          <p className="hint">
            Google colours every event by its calendar and can't set a colour during import, so Sunday Reset gives you
            two files, one per calendar.
          </p>
          <h4>Set up once</h4>
          <ol>
            <li>
              In Google Calendar, next to <b>Other calendars</b> choose <b>+ → Create new calendar</b>. Make two,
              named <b>{settings.daily.name}</b> and <b>{settings.weekly.name}</b>.
            </li>
            <li>
              Open each calendar's settings and set its colour (the <b>+</b> under the palette lets you pick any
              colour):
              <div className="swatches">
                {(['daily', 'weekly'] as const).map((group) => (
                  <span key={group}>
                    <i style={{ ['--c' as string]: settings[group].color }} />
                    {GROUP_LABEL[group]} <code>{settings[group].color.toUpperCase()}</code>
                    <button className="btn small ghost" onClick={() => copyHex(group)}>
                      {copied === group ? 'Copied' : 'Copy'}
                    </button>
                  </span>
                ))}
              </div>
            </li>
          </ol>
          <h4>Each week</h4>
          <ol start={3}>
            <li>Download both files above.</li>
            <li>
              In Google Calendar open <b>Settings (gear) → Import &amp; export → Import</b>. Choose the Day to day
              file and set <b>Add to calendar</b> to <b>{settings.daily.name}</b>.
            </li>
            <li>
              Repeat for the Weekly file, adding it to <b>{settings.weekly.name}</b>.
            </li>
          </ol>
          <p className="hint">
            Each task keeps the same ID, so importing the same week again after you've moved things should update them.
            If you ever see doubles, delete that week's events from the calendar and import again.
          </p>
        </details>
      </div>
    </dialog>
  )
}
