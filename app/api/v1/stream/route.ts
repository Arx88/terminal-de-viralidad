/**
 * GET /api/v1/stream — Server-Sent Events stream
 *
 * On connect:
 *   1. Start the ingest loop (if not running)
 *   2. Replay missed events since Last-Event-ID
 *   3. Subscribe to live events
 *   4. Send heartbeat every 15s
 *
 * On disconnect (req.signal abort):
 *   - Unsubscribe from bus
 *   - Stop ingest loop (only when no more clients)
 */

import { NextRequest } from 'next/server'
import { sseBus, formatSseEvent } from '@/lib/server/streaming/bus'
import { startIngestLoop, stopIngestLoop, getIngestStats } from '@/lib/server/streaming/loop'
import { store } from '@/lib/server/core/store'
import { clusterToTrend } from '@/lib/server/core/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Vercel: 5 min max for SSE on hobbyist; 900s on pro

export async function GET(req: NextRequest): Promise<Response> {
  const lastEventId = req.headers.get('Last-Event-ID') ?? null
  startIngestLoop()

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const safeEnqueue = (chunk: string) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(chunk)) } catch { closed = true }
      }

      // 1. Send hello
      safeEnqueue(formatSseEvent({
        id: 'hello',
        type: 'connection.heartbeat',
        data: { ts: new Date().toISOString(), clients: sseBus.clientCount + 1, eventsPerSec: 0 },
        ts: new Date().toISOString(),
      }))

      // 2. Replay missed events
      if (lastEventId) {
        const missed = sseBus.replaySince(lastEventId)
        for (const e of missed) safeEnqueue(formatSseEvent(e))
      }

      // 3. Send initial snapshot of top trends
      const top = store.getTrending(15)
      for (const c of top) {
        safeEnqueue(formatSseEvent({
          id: `snap-${c.id}`,
          type: 'trend.upserted',
          data: clusterToTrend(c),
          ts: new Date().toISOString(),
        }))
      }

      // 4. Subscribe to live events
      const unsub = sseBus.subscribe((event) => {
        safeEnqueue(formatSseEvent(event))
      })

      // 5. Heartbeat every 15s
      const heartbeat = setInterval(() => {
        const stats = getIngestStats()
        safeEnqueue(formatSseEvent({
          id: `hb-${Date.now()}`,
          type: 'connection.heartbeat',
          data: {
            ts: new Date().toISOString(),
            clients: sseBus.clientCount,
            eventsPerSec: sseBus.eventsPerSec,
            ingest: stats,
          },
          ts: new Date().toISOString(),
        }))
      }, 15000)

      // 6. Cleanup on abort
      req.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(heartbeat)
        unsub()
        try { controller.close() } catch { /* already closed */ }
        // Stop loop when no clients left
        if (sseBus.clientCount === 0) {
          // Give 30s grace period before stopping
          setTimeout(() => {
            if (sseBus.clientCount === 0) stopIngestLoop()
          }, 30_000)
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
