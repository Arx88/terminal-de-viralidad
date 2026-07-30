// Trigger runs ALL 6 agents in one invocation using waitUntil.
// Returns the final narratives + activities.
// Client waits for response (can take 30-60s).

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { scoutAgent } from '@/lib/agents/scout';
import { clusterAgent } from '@/lib/agents/cluster';
import { scoreAgent } from '@/lib/agents/score';
import { phaseAgent } from '@/lib/agents/phase';
import { validatorAgent } from '@/lib/agents/validator';
import { evaluatorAgent } from '@/lib/agents/evaluator';
import { store } from '@/lib/eventbus';
import type { Narrative, NormalizedMention, SourceType } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const start = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const query = body.query || 'IA agentes autónomos';
    const sources: SourceType[] = body.sources || ['twitter', 'reddit', 'hackernews'];
    const loop_id = `loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Run all 6 agents sequentially in this invocation
    let mentions: NormalizedMention[] = [];
    let narratives: Narrative[] = store.list({ limit: 50 });

    // 1. Scout
    console.log(`[trigger] step scout starting`);
    try {
      const r = await scoutAgent({ loop_id, iteration: 1, query, sources, existing_mentions: mentions });
      mentions = r.output.mentions;
    } catch (e: any) { console.error('[trigger] scout failed:', e.message); }

    // 2. Cluster
    console.log(`[trigger] step cluster starting (${mentions.length} mentions)`);
    try {
      const r = await clusterAgent({ loop_id, iteration: 1, mentions, existing_narratives: narratives, query });
      narratives = r.output.narratives;
    } catch (e: any) { console.error('[trigger] cluster failed:', e.message); }

    // 3. Score
    if (narratives.length > 0) {
      console.log(`[trigger] step score starting (${narratives.length} narratives)`);
      try {
        const r = await scoreAgent({ loop_id, iteration: 1, narratives });
        narratives = r.output.narratives;
      } catch (e: any) { console.error('[trigger] score failed:', e.message); }
    }

    // 4. Phase
    if (narratives.length > 0) {
      console.log(`[trigger] step phase starting`);
      try {
        const r = await phaseAgent({ loop_id, iteration: 1, narratives });
        narratives = r.output.narratives;
      } catch (e: any) { console.error('[trigger] phase failed:', e.message); }
    }

    // 5. Validator
    if (narratives.length > 0) {
      console.log(`[trigger] step validator starting`);
      try {
        const r = await validatorAgent({ loop_id, iteration: 1, narratives, max_iterations: 1 });
        narratives = r.output.narratives;
      } catch (e: any) { console.error('[trigger] validator failed:', e.message); }
    }

    // 6. Evaluator
    if (narratives.length > 0) {
      console.log(`[trigger] step evaluator starting`);
      try {
        const r = await evaluatorAgent({ loop_id, iteration: 1, narratives });
        narratives = r.output.narratives;
      } catch (e: any) { console.error('[trigger] evaluator failed:', e.message); }
    }

    const duration = Date.now() - start;
    console.log(`[trigger] loop completed in ${duration}ms | ${narratives.length} narratives`);

    return NextResponse.json({
      status: 'completed',
      loop_id,
      query,
      duration_ms: duration,
      narratives: narratives.slice(0, 20),
      activities: store.getActivities(20),
      ts: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, duration_ms: Date.now() - start }, { status: 500 });
  }
}

export async function GET() {
  return POST(new NextRequest('https://localhost/api/trigger', {
    method: 'POST',
    body: JSON.stringify({ query: 'IA agentes autónomos' }),
    headers: { 'Content-Type': 'application/json' },
  }));
}
