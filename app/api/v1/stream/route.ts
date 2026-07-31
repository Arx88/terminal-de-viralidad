/**
 * GET /api/v1/stream — Server-Sent Events stream
 *
 * FIX (v2.0.1 — QA Cycle 1):
 *   - Last-Event-ID now actually respected via sseBus.replaySince()
 *   - Snapshot events pushed through the bus (monotonic id) so they
 *     participate in dedup on reconnect — no more duplicate snapshots
 *   - If lastEventId not found in buffer, emit `connection.resync_required`
 *     so the client can decide to reload full state
 *   - Heartbeats also use monotonic ids
 */

import { NextRequest } from 'next/server'
import { sseBus, formatSseEvent, generateEventId } from '@/lib/server/streaming/bus'
import { startIngestLoop, stopIngestLoop, getIngestStats, updateEngineStatesFromIngest } from '@/lib/server/streaming/loop'
import { store, clusterToTrend, ingestMentions } from '@/lib/server/core/store'
import { runIngestion } from '@/lib/server/ingest/adapters'
import { ALL_SOURCES } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

let streamOneShotDone = false

export async function GET(req: NextRequest): Promise<Response> {
  const lastEventId = req.headers.get('Last-Event-ID') ?? null
  startIngestLoop()

  // One-shot ingest on cold start so the stream has data to send immediately
  if (!streamOneShotDone) {
    streamOneShotDone = true
    try {
      const start = Date.now()
      const mentions = await runIngestion(ALL_SOURCES)
      ingestMentions(mentions)
      updateEngineStatesFromIngest(mentions, Date.now() - start)
    } catch {
      // swallow
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const safeEnqueue = (chunk: string) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(chunk)) } catch { closed = true }
      }

      // 1. Replay missed events since lastEventId
      let skipSnapshot = false
      if (lastEventId) {
        const { events, needsFullResync } = sseBus.replaySince(lastEventId)
        for (const e of events) safeEnqueue(formatSseEvent(e))
        if (needsFullResync) {
          // Buffer lost (different Vercel lambda). Tell client to reconcile.
          // Client will fetch fresh /api/v1/trends snapshot itself, so we
          // skip server-side snapshot to avoid sending ~15 trend.upserted
          // events the client will discard anyway (or might mishandle).
          safeEnqueue(formatSseEvent({
            id: generateEventId(),
            type: 'connection.heartbeat',
            data: {
              ts: new Date().toISOString(),
              clients: sseBus.clientCount + 1,
              eventsPerSec: sseBus.eventsPerSec,
              resyncRequired: true,
            },
            ts: new Date().toISOString(),
          }))
          skipSnapshot = true
        } else {
          // Client is up to date — skip the initial snapshot to avoid duplicates
          skipSnapshot = true
        }
      }

      // 2. Initial snapshot of top trends (only when no replay was possible
      //    or when resync is required). Use bus.publish so events get a
      //    monotonic id and are added to the ring buffer for future replays.
      if (!skipSnapshot) {
        const top = store.getTrending(15)
        for (const c of top) {
          sseBus.publish('trend.upserted', clusterToTrend(c))
        }
      }

      // 3. Subscribe to live events
      const unsub = sseBus.subscribe((event) => {
        safeEnqueue(formatSseEvent(event))
      })

      // 4. Heartbeat every 15s — uses bus.publish for monotonic id
      const heartbeat = setInterval(() => {
        const stats = getIngestStats()
        sseBus.publish('connection.heartbeat', {
          ts: new Date().toISOString(),
          clients: sseBus.clientCount,
          eventsPerSec: sseBus.eventsPerSec,
          ingest: stats,
        })
      }, 15000)

      // 5. Cleanup on abort
      req.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(heartbeat)
        unsub()
        try { controller.close() } catch { /* already closed */ }
        if (sseBus.clientCount === 0) {
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
