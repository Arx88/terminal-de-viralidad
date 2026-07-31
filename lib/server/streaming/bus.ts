/**
 * FASE 3 — Agent-Gateway
 *
 * In-memory event bus with proper Last-Event-ID resumption.
 *
 * FIX (v2.0.1 — QA Cycle 1):
 *   - IDs are now globally monotonic timestamps (ms + counter) so they survive
 *     across reconnections and across Vercel lambda invocations within the
 *     same warm instance.
 *   - replaySince() actually returns events strictly AFTER the given id.
 *   - Snapshot events also use the same id sequence so they participate in
 *     the dedup logic on reconnect.
 */

import type { SseEvent, SseEventType } from '@/lib/types'

type Listener = (event: SseEvent) => void

const BUFFER_SIZE = 1000
const listeners = new Set<Listener>()
const ringBuffer: SseEvent[] = []
let counter = 0

function nextId(): string {
  counter++
  // Globally monotonic: timestamp_ms + counter (always increasing within a process)
  return `${Date.now()}-${counter}`
}

export const sseBus = {
  publish<T>(type: SseEventType, data: T): SseEvent<T> {
    const event: SseEvent<T> = {
      id: nextId(),
      type,
      data,
      ts: new Date().toISOString(),
    }
    ringBuffer.push(event as SseEvent)
    if (ringBuffer.length > BUFFER_SIZE) ringBuffer.shift()
    for (const l of listeners) {
      try { l(event as SseEvent) } catch { /* swallow */ }
    }
    return event
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  /**
   * Returns events strictly AFTER the given lastEventId.
   * If lastEventId is not found in the buffer, returns the last 50 events
   * (best-effort) AND emits a special `connection.resync_required` flag
   * the caller can use to force a full snapshot reload.
   */
  replaySince(lastEventId: string): { events: SseEvent[]; needsFullResync: boolean } {
    const idx = ringBuffer.findIndex((e) => e.id === lastEventId)
    if (idx === -1) {
      return { events: ringBuffer.slice(-50), needsFullResync: true }
    }
    return { events: ringBuffer.slice(idx + 1), needsFullResync: false }
  },

  /** Publish a snapshot event with a unique monotonic id (used for initial state). */
  publishSnapshot<T>(type: SseEventType, data: T): SseEvent<T> {
    return this.publish(type, data)
  },

  get clientCount(): number { return listeners.size },

  get eventsPerSec(): number {
    const now = Date.now()
    const recent = ringBuffer.filter((e) => now - Date.parse(e.ts) < 1000)
    return recent.length
  },
}

export function formatSseEvent(event: SseEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
}

/** Helper for routes that need a unique event id without publishing. */
export function generateEventId(): string { return nextId() }
