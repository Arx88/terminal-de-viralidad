// SSE gateway — pushes real-time events to connected clients.
// On connect, fetches current state from Redis so the client sees
// existing narratives + activities immediately.

import { NextRequest } from 'next/server';
import { bus, store } from '@/lib/eventbus';
import type { SSEEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ENCODER = new TextEncoder();
const HEARTBEAT_MS = 15_000;

export async function GET(req: NextRequest) {
  const sinceTs = Number(req.nextUrl.searchParams.get('since') ?? 0);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const payload = `event: ${event.type}\nid: ${id}\ndata: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(ENCODER.encode(payload));
        } catch { /* closed */ }
      };

      // Hello
      send({ type: 'hello', ts: Date.now(), loop_id: `conn_${Math.random().toString(36).slice(2, 8)}` });

      // Backfill: send current narratives + recent activities from Redis
      try {
        const narratives = await store.list({ limit: 30 });
        for (const n of narratives) {
          send({ type: 'narrative_update', narrative: n });
        }
        const activities = await store.getActivities(20);
        for (const a of activities) {
          send({ type: 'agent_activity', activity: a });
        }
      } catch (err) {
        console.error('[stream] backfill failed:', err);
      }

      // In-memory history (for events that happened during this instance lifetime)
      const history = bus.getHistory(sinceTs);
      for (const evt of history) send(evt);

      // Subscribe to live events
      const unsub = bus.subscribe(send);

      // Heartbeat
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(ENCODER.encode(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`));
        } catch { /* closed */ }
      }, HEARTBEAT_MS);

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsub();
        try { controller.close(); } catch { /* */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
