// Trigger a new agent loop manually.

import { NextRequest, NextResponse } from 'next/server';
import { runLoop } from '@/lib/agents/orchestrator';
import { seedInitialLoops } from '@/lib/agents/orchestrator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = body.query || 'AI agents';
    const sources = body.sources || ['twitter', 'gdelt', 'reddit', 'hackernews'];
    const max_iterations = body.max_iterations || 4;

    // Fire and forget — the loop posts events via bus
    runLoop({ query, sources, max_iterations }).catch(console.error);

    // Seed auto-loops on first trigger
    seedInitialLoops().catch(console.error);

    return NextResponse.json({
      status: 'started',
      query,
      sources,
      max_iterations,
      ts: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  // Auto-trigger a demo loop on GET so users can hit /api/trigger in browser
  runLoop({ query: 'AI agents', max_iterations: 3 }).catch(console.error);
  return NextResponse.json({ status: 'started', query: 'AI agents', ts: Date.now() });
}
