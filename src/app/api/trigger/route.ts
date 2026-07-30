// Trigger ONE agent step. Uses Vercel's waitUntil to run in background
// after the response is sent, so the client doesn't wait for LLM.

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

interface LoopState {
  query: string;
  sources: SourceType[];
  iteration: number;
  step: number;
  mentions: NormalizedMention[];
  narratives: Narrative[];
  loop_id: string;
}

const globalAny = globalThis as any;
const loopStates: Map<string, LoopState> = globalAny.__loopStates ?? new Map();
if (!globalAny.__loopStates) globalAny.__loopStates = loopStates;

const STEP_NAMES = ['scout', 'cluster', 'score', 'phase', 'validator', 'evaluator'];

// Background task runner — uses Vercel's waitUntil
function runInBackground(promise: Promise<void>) {
  try {
    waitUntil(promise);
  } catch {
    // Fallback: just run it (will be killed when function returns in serverless)
    promise.catch(console.error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = body.query || 'IA agentes autónomos';
    const sources: SourceType[] = body.sources || ['twitter', 'reddit', 'hackernews'];
    const session_id = body.session_id || query;

    let state = loopStates.get(session_id);
    if (!state || body.reset) {
      state = {
        query, sources, iteration: 1, step: 0,
        mentions: [], narratives: store.list({ limit: 50 }),
        loop_id: `loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };
      loopStates.set(session_id, state);
    }

    const stepName = STEP_NAMES[state.step];
    const stepNum = state.step;
    const loopId = state.loop_id;
    const iter = state.iteration;

    // Advance step counter IMMEDIATELY so next call runs next agent
    state.step = (state.step + 1) % 6;
    if (state.step === 0) state.iteration++;

    // Run the agent in background
    runInBackground(runStep(stepNum, loopId, iter, state).catch(err => {
      console.error(`[trigger] step ${stepName} failed:`, err.message);
    }));

    return NextResponse.json({
      status: 'step_started',
      step: stepName,
      next_step: STEP_NAMES[state.step],
      iteration: state.iteration,
      query: state.query,
      ts: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function runStep(step: number, loop_id: string, iteration: number, state: LoopState) {
  const stepName = STEP_NAMES[step];
  console.log(`[trigger] running step ${stepName} iter=${iteration} query="${state.query}"`);

  try {
    switch (step) {
      case 0: {
        const r = await scoutAgent({
          loop_id, iteration, query: state.query, sources: state.sources,
          existing_mentions: state.mentions,
        });
        state.mentions = [...state.mentions, ...r.output.mentions];
        break;
      }
      case 1: {
        const r = await clusterAgent({
          loop_id, iteration,
          mentions: state.mentions.slice(-15),
          existing_narratives: state.narratives,
          query: state.query,
        });
        state.narratives = r.output.narratives;
        break;
      }
      case 2: {
        const r = await scoreAgent({ loop_id, iteration, narratives: state.narratives });
        state.narratives = r.output.narratives;
        break;
      }
      case 3: {
        const r = await phaseAgent({ loop_id, iteration, narratives: state.narratives });
        state.narratives = r.output.narratives;
        break;
      }
      case 4: {
        const r = await validatorAgent({
          loop_id, iteration, narratives: state.narratives, max_iterations: 1,
        });
        state.narratives = r.output.narratives;
        break;
      }
      case 5: {
        const r = await evaluatorAgent({ loop_id, iteration, narratives: state.narratives });
        state.narratives = r.output.narratives;
        break;
      }
    }
    console.log(`[trigger] step ${stepName} completed`);
  } catch (err: any) {
    console.error(`[trigger] step ${stepName} error:`, err.message);
  }
}

export async function GET() {
  return POST(new NextRequest('https://localhost/api/trigger', {
    method: 'POST',
    body: JSON.stringify({ query: 'IA agentes autónomos' }),
    headers: { 'Content-Type': 'application/json' },
  }));
}
