// Trigger ONE agent step synchronously (serverless-friendly, <10s).
// The client polls this endpoint repeatedly to advance the loop.
// Each call runs ONE LLM-powered agent and returns immediately.

import { NextRequest, NextResponse } from 'next/server';
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

// In-memory loop state (survives across calls within same warm instance)
interface LoopState {
  query: string;
  sources: SourceType[];
  iteration: number;
  step: number; // 0=scout, 1=cluster, 2=score, 3=phase, 4=validator, 5=evaluator
  mentions: NormalizedMention[];
  narratives: Narrative[];
  loop_id: string;
}

const globalAny = globalThis as any;
const loopStates: Map<string, LoopState> = globalAny.__loopStates ?? new Map();
if (!globalAny.__loopStates) globalAny.__loopStates = loopStates;

const STEP_NAMES = ['scout', 'cluster', 'score', 'phase', 'validator', 'evaluator'];

export async function POST(req: NextRequest) {
  const start = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const query = body.query || 'IA agentes autónomos';
    const sources: SourceType[] = body.sources || ['twitter', 'reddit', 'hackernews'];
    const session_id = body.session_id || query; // group steps by query

    // Get or create loop state
    let state = loopStates.get(session_id);
    if (!state || body.reset) {
      state = {
        query,
        sources,
        iteration: 1,
        step: 0,
        mentions: [],
        narratives: store.list({ limit: 50 }),
        loop_id: `loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };
      loopStates.set(session_id, state);
    }

    const stepName = STEP_NAMES[state.step];
    let result_summary = '';

    try {
      switch (state.step) {
        case 0: { // scout
          const r = await scoutAgent({
            loop_id: state.loop_id, iteration: state.iteration,
            query: state.query, sources: state.sources,
            existing_mentions: state.mentions,
          });
          state.mentions = [...state.mentions, ...r.output.mentions];
          result_summary = `Scout: ${r.output.mentions.length} menciones`;
          break;
        }
        case 1: { // cluster
          const r = await clusterAgent({
            loop_id: state.loop_id, iteration: state.iteration,
            mentions: state.mentions.slice(-15), // last 15 mentions
            existing_narratives: state.narratives,
            query: state.query,
          });
          state.narratives = r.output.narratives;
          result_summary = `Cluster: ${r.output.new_count} nuevas`;
          break;
        }
        case 2: { // score
          const r = await scoreAgent({
            loop_id: state.loop_id, iteration: state.iteration,
            narratives: state.narratives,
          });
          state.narratives = r.output.narratives;
          result_summary = `Score: top=${r.output.top_score.toFixed(0)}`;
          break;
        }
        case 3: { // phase
          const r = await phaseAgent({
            loop_id: state.loop_id, iteration: state.iteration,
            narratives: state.narratives,
          });
          state.narratives = r.output.narratives;
          result_summary = `Phase: ${r.output.transitions} transiciones`;
          break;
        }
        case 4: { // validator
          const r = await validatorAgent({
            loop_id: state.loop_id, iteration: state.iteration,
            narratives: state.narratives,
            max_iterations: 1,
          });
          state.narratives = r.output.narratives;
          result_summary = `Validator: ${r.output.converged_ids.length} convergen`;
          break;
        }
        case 5: { // evaluator
          const r = await evaluatorAgent({
            loop_id: state.loop_id, iteration: state.iteration,
            narratives: state.narratives,
          });
          state.narratives = r.output.narratives;
          result_summary = `Evaluator: ${r.output.approved_ids.length} aprobadas, ${r.output.discard_ids.length} descartadas`;
          break;
        }
      }
      state.step = (state.step + 1) % 6;
      if (state.step === 0) state.iteration++; // completed a full loop
    } catch (err: any) {
      result_summary = `Error en ${stepName}: ${err.message.slice(0, 80)}`;
      state.step = (state.step + 1) % 6; // skip to next step on error
    }

    return NextResponse.json({
      status: 'step_completed',
      step: stepName,
      next_step: STEP_NAMES[state.step],
      iteration: state.iteration,
      summary: result_summary,
      query: state.query,
      duration_ms: Date.now() - start,
      narratives_count: state.narratives.length,
      mentions_count: state.mentions.length,
      ts: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, duration_ms: Date.now() - start }, { status: 500 });
  }
}

export async function GET() {
  // Run one step of a default loop
  return POST(new NextRequest('https://localhost/api/trigger', {
    method: 'POST',
    body: JSON.stringify({ query: 'IA agentes autónomos' }),
    headers: { 'Content-Type': 'application/json' },
  }));
}
