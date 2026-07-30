// Trigger a new agent loop manually.
// In Vercel serverless, we can't run long background tasks, so we run
// ONE iteration synchronously and return the result. The client can
// call /api/trigger again to advance the loop further.

import { NextRequest, NextResponse } from 'next/server';
import { runLoop } from '@/lib/agents/orchestrator';
import { seedInitialLoops } from '@/lib/agents/orchestrator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const start = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const query = body.query || 'IA agentes autónomos';
    const sources = body.sources || ['twitter', 'gdelt', 'reddit', 'hackernews'];
    const max_iterations = body.max_iterations || 1; // default 1 for serverless

    // Run loop synchronously (1 iteration should fit in 60s)
    const result = await runLoop({ query, sources, max_iterations }).catch(err => {
      console.error('[trigger] loop failed:', err);
      return { loop_id: 'error', iterations: 0, approved_count: 0, discarded_count: 0, total_narratives: 0 };
    });

    return NextResponse.json({
      status: 'completed',
      ...result,
      query,
      duration_ms: Date.now() - start,
      ts: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, duration_ms: Date.now() - start }, { status: 500 });
  }
}

export async function GET() {
  // Auto-trigger a demo loop
  const result = await runLoop({ query: 'IA agentes autónomos', max_iterations: 1 }).catch(err => {
    console.error('[trigger GET] failed:', err);
    return { loop_id: 'error', iterations: 0, approved_count: 0, discarded_count: 0, total_narratives: 0 };
  });
  return NextResponse.json({ status: 'completed', ...result, ts: Date.now() });
}
