import type { StoredEvent } from './ical/parse'

// Rose-adjacent hues that stay distinguishable on the baby pink background.
const PALETTE = ['#e75480', '#b565c9', '#ff8a65', '#c2185b', '#9d6b8f', '#f4a261', '#d4577e', '#7e57c2']

export function calendarColors(events: StoredEvent[]): Record<string, string> {
  const names = [...new Set(events.map((e) => e.calendar))].sort()
  return Object.fromEntries(names.map((n, i) => [n, PALETTE[i % PALETTE.length]]))
}
