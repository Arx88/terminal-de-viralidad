/**
 * FASE 3 — Agent-Gateway
 *
 * In-memory event bus (Redis Pub/Sub-shape, single-instance on Vercel).
 * Supports:
 *   - publish(event) — fan-out to all subscribers
 *   - subscribe(fn)  — returns unsubscribe
 *   - replaySince(lastId) — for Last-Event-ID resumption
 *
 * Ring buffer of 1000 events per type for replay on reconnect.
 */

import type { SseEvent, SseEventType } from '@/lib/types'
import { cuid } from '@/lib/server/hash'

type Listener = (event: SseEvent) => void

const BUFFER_SIZE = 1000
const listeners = new Set<Listener>()
const ringBuffer: SseEvent[] = []
let lastId = 0

function nextId(): string {
  lastId++
  return String(lastId)
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

  replaySince(lastEventId: string): SseEvent[] {
    const idx = ringBuffer.findIndex((e) => e.id === lastEventId)
    if (idx === -1) {
      // Not found — return last 50 (best-effort)
      return ringBuffer.slice(-50)
    }
    return ringBuffer.slice(idx + 1)
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

export function newEventId(): string { return cuid('evt') }
