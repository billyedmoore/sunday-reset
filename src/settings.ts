import type { Task } from './tasks'

/** Tasks pinned to a day export to one calendar; "any time this week" tasks to another. */
export type Group = 'daily' | 'weekly'

export const groupOf = (t: Task): Group => (t.day === null ? 'weekly' : 'daily')

export interface GroupSettings {
  /** Name of the Google calendar this group is imported into. */
  name: string
  /** Colour used in the app, and the colour to set on that calendar in Google. */
  color: string
}

export interface Settings {
  daily: GroupSettings
  weekly: GroupSettings
  /** Minutes before each task to remind; 0 for no reminder. */
  reminderMins: number
  /** Show tasks as "busy" (rather than "free") in the calendar. */
  busy: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  daily: { name: 'Sunday Reset – Day to day', color: '#e75480' },
  weekly: { name: 'Sunday Reset – Weekly', color: '#b565c9' },
  reminderMins: 0,
  busy: true,
}

export const GROUP_LABEL: Record<Group, string> = { daily: 'Day to day', weekly: 'Weekly' }

const KEY = 'sunday-reset:settings:v1'
const HEX = /^#[0-9a-f]{6}$/i

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const saved = JSON.parse(raw) as Partial<Settings>
    const group = (g: Group): GroupSettings => ({
      name: saved[g]?.name?.trim() || DEFAULT_SETTINGS[g].name,
      color: saved[g]?.color && HEX.test(saved[g]!.color) ? saved[g]!.color : DEFAULT_SETTINGS[g].color,
    })
    return {
      daily: group('daily'),
      weekly: group('weekly'),
      reminderMins: typeof saved.reminderMins === 'number' ? saved.reminderMins : DEFAULT_SETTINGS.reminderMins,
      busy: typeof saved.busy === 'boolean' ? saved.busy : DEFAULT_SETTINGS.busy,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable: settings just won't persist
  }
}
