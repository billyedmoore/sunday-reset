import { parseIcs, type StoredEvent } from './parse'
import { readZip } from './zip'

/** Read a Google Calendar export (.zip of .ics files) or a single .ics into stored events. */
export async function importCalendarFile(file: File): Promise<StoredEvent[]> {
  const buffer = await file.arrayBuffer()
  const decoder = new TextDecoder('utf-8')
  const isZip = new Uint8Array(buffer, 0, 2).join() === '80,75' // "PK"

  if (!isZip) return parseIcs(decoder.decode(buffer), file.name.replace(/\.ics$/i, '')).events

  const events: StoredEvent[] = []
  for (const entry of await readZip(buffer)) {
    if (!/\.ics$/i.test(entry.name)) continue
    const fallback = entry.name.replace(/\.ics$/i, '').replace(/_[^_]*$/, '')
    events.push(...parseIcs(decoder.decode(entry.data), fallback, true).events)
  }
  if (!events.length) throw new Error('No calendar events found in that file')
  return events
}
