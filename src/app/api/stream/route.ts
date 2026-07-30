// SSE gateway — pushes real-time events to connected clients.

import { NextRequest } from 'next/server';
import { bus } from '@/lib/eventbus';
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

      send({ type: 'hello', ts: Date.now(), loop_id: `conn_${Math.random().toString(36).slice(2, 8)}` });
      const history = bus.getHistory(sinceTs);
      for (const evt of history) send(evt);

      const unsub = bus.subscribe(send);

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
