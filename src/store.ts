import type { StoredEvent } from './ical/parse'

const KEY = 'sunday-reset:events:v1'

export function loadEvents(): StoredEvent[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as StoredEvent[]) : []
  } catch {
    return []
  }
}

/** Returns false if the browser refused the write (quota, private mode). */
export function saveEvents(events: StoredEvent[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(events))
    return true
  } catch {
    return false
  }
}
