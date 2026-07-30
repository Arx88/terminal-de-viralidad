// ─────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR — runs the agent loop WITH evaluation gate
//
// NEW FLOW (vs the deterministic one before):
//   iteration N:
//     1. Scout    → mentions[] (con feedback del evaluator si re-loop)
//     2. Cluster  → narratives[] (LLM agrupa con títulos significativos)
//     3. Score    → scored (LLM evalúa viralidad con razonamiento)
//     4. Phase    → phased (LLM clasifica fase + explica)
//     5. Validator→ legitimacy + briefing legible + converge decision
//     6. EVALUATOR→ quality score 0-10. Si <7, descarta + feedback al Scout
//
// Convergence: ALL narratives must be approved by evaluator (quality >=7)
// OR max_iterations reached (5 by default).
// ─────────────────────────────────────────────────────────────────────────

import type { Narrative, NormalizedMention, SourceType, AgentName } from '../types';
import { store, bus } from '../eventbus';
import { scoutAgent, type ScoutInput } from './scout';
import { clusterAgent, type ClusterInput } from './cluster';
import { scoreAgent, type ScoreInput } from './score';
import { phaseAgent, type PhaseInput } from './phase';
import { validatorAgent, type ValidatorInput } from './validator';
import { evaluatorAgent, type EvaluatorInput } from './evaluator';

export interface OrchestratorConfig {
  query: string;
  sources: SourceType[];
  max_iterations: number;
  iteration_delay_ms: number;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  query: 'AI agents',
  sources: ['twitter', 'gdelt', 'reddit', 'hackernews'],
  max_iterations: 5,
  iteration_delay_ms: 1500,
};

const active_loops = new Set<string>();
const loop_queue: Array<() => Promise<void>> = [];
let loop_running = false;

async function processQueue() {
  if (loop_running) return;
  loop_running = true;
  while (loop_queue.length > 0) {
    const job = loop_queue.shift()!;
    await job();
  }
  loop_running = false;
}

function enqueueLoop(job: () => Promise<void>) {
  loop_queue.push(job);
  processQueue();
}

export async function runLoop(config: Partial<OrchestratorConfig> = {}): Promise<{
  loop_id: string;
  iterations: number;
  approved_count: number;
  discarded_count: number;
  total_narratives: number;
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const loop_id = `loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const loop_start = Date.now();

  if (active_loops.has(cfg.query)) {
    return { loop_id, iterations: 0, approved_count: 0, discarded_count: 0, total_narratives: 0 };
  }

  // Return a promise that resolves when the queued job completes
  return new Promise((resolve) => {
    enqueueLoop(async () => {
      active_loops.add(cfg.query);
      try {
        const result = await executeLoop(cfg, loop_id, loop_start);
        resolve(result);
      } finally {
        active_loops.delete(cfg.query);
      }
    });
  });
}

async function executeLoop(cfg: OrchestratorConfig, loop_id: string, loop_start: number): Promise<{
  loop_id: string;
  iterations: number;
  approved_count: number;
  discarded_count: number;
  total_narratives: number;
}> {
    let iteration = 0;
    let all_mentions: NormalizedMention[] = [];
    let narratives: Narrative[] = [];
    let approved_count = 0;
    let discarded_count = 0;
    let scout_feedback: string | undefined;
    let request_reloop = true;

    console.log(`[orchestrator] starting loop ${loop_id} query="${cfg.query}"`);

    while (request_reloop && iteration < cfg.max_iterations) {
      iteration++;
      const iter_start = Date.now();
      console.log(`[orchestrator] loop ${loop_id} iteration ${iteration} starting`);

      // ── 1. Scout ─────────────────────────────────────────────────
      bus.emitLoopIteration(loop_id, iteration, 'scout' as AgentName, 'running');
      const scout_in: ScoutInput = {
        loop_id, iteration,
        query: cfg.query,
        sources: cfg.sources,
        feedback: scout_feedback,
        existing_mentions: all_mentions,
      };
      const scout_res = await scoutAgent(scout_in);
      all_mentions = [...all_mentions, ...scout_res.output.mentions];
      bus.emitLoopIteration(loop_id, iteration, 'scout' as AgentName, 'success');

      // ── 2. Cluster ───────────────────────────────────────────────
      bus.emitLoopIteration(loop_id, iteration, 'cluster' as AgentName, 'running');
      const cluster_in: ClusterInput = {
        loop_id, iteration,
        mentions: scout_res.output.mentions,
        existing_narratives: narratives,
        query: cfg.query,
      };
      const cluster_res = await clusterAgent(cluster_in);
      narratives = cluster_res.output.narratives;
      bus.emitLoopIteration(loop_id, iteration, 'cluster' as AgentName, 'success');

      // ── 3. Score ─────────────────────────────────────────────────
      bus.emitLoopIteration(loop_id, iteration, 'score' as AgentName, 'running');
      const score_in: ScoreInput = { loop_id, iteration, narratives };
      const score_res = await scoreAgent(score_in);
      narratives = score_res.output.narratives;
      bus.emitLoopIteration(loop_id, iteration, 'score' as AgentName, 'success');

      // ── 4. Phase ─────────────────────────────────────────────────
      bus.emitLoopIteration(loop_id, iteration, 'phase' as AgentName, 'running');
      const phase_in: PhaseInput = { loop_id, iteration, narratives };
      const phase_res = await phaseAgent(phase_in);
      narratives = phase_res.output.narratives;
      bus.emitLoopIteration(loop_id, iteration, 'phase' as AgentName, 'success');

      // ── 5. Validator ─────────────────────────────────────────────
      bus.emitLoopIteration(loop_id, iteration, 'validator' as AgentName, 'running');
      const val_in: ValidatorInput = {
        loop_id, iteration, narratives,
        max_iterations: cfg.max_iterations,
      };
      const val_res = await validatorAgent(val_in);
      narratives = val_res.output.narratives;
      bus.emitLoopIteration(loop_id, iteration, 'validator' as AgentName, 'success');

      // Emit convergence for validator-approved narratives
      for (const id of val_res.output.converged_ids) {
        bus.emitConvergence(loop_id, id, iteration);
      }

      // ── 6. EVALUATOR (NEW) ───────────────────────────────────────
      bus.emitLoopIteration(loop_id, iteration, 'evaluator' as AgentName, 'running');
      const eval_in: EvaluatorInput = { loop_id, iteration, narratives };
      const eval_res = await evaluatorAgent(eval_in);
      bus.emitLoopIteration(loop_id, iteration, 'evaluator' as AgentName, 'success');

      approved_count = eval_res.output.approved_ids.length;
      discarded_count = eval_res.output.discard_ids.length;

      // If evaluator gave feedback for re-loop, capture it
      if (eval_res.output.reloop_with_feedback) {
        scout_feedback = eval_res.output.reloop_with_feedback.feedback;
      }

      // Decide if we re-loop:
      // - If evaluator discarded narratives AND we have iterations left → re-loop with feedback
      // - If all approved → done
      // - If max iterations reached → done
      request_reloop = eval_res.request_reloop && iteration < cfg.max_iterations;

      // If all narratives are approved (or none discarded), we're done
      if (discarded_count === 0 && approved_count > 0) {
        request_reloop = false;
      }

      if (request_reloop) {
        await new Promise(r => setTimeout(r, cfg.iteration_delay_ms));
      }
    }

    // Persist ALL narratives at the end of the loop (in case they weren't already)
    for (const n of narratives) {
      store.upsert(n);
    }

    store.logActivity({
      id: crypto.randomUUID(),
      agent: 'orchestrator',
      status: 'success',
      started_at: loop_start,
      finished_at: Date.now(),
      duration_ms: Date.now() - loop_start,
      input_summary: `query="${cfg.query}" sources=${cfg.sources.length} max_iter=${cfg.max_iterations}`,
      output_summary: `LOOP TERMINADO: ${iteration} iteraciones | ${approved_count} aprobadas | ${discarded_count} descartadas | ${narratives.length} totales`,
      explanation: `El sistema corrió ${iteration} iteraciones del loop de 6 agentes (scout, cluster, score, phase, validator, evaluator). ${approved_count} narrativas pasaron la evaluación de calidad del evaluator, ${discarded_count} fueron descartadas por no alcanzar el umbral de utilidad.`,
      loop_id, iteration,
      metrics: {
        iterations: iteration,
        approved: approved_count,
        discarded: discarded_count,
        total_narratives: narratives.length,
        total_mentions: all_mentions.length,
      },
    });

    return {
      loop_id,
      iterations: iteration,
      approved_count,
      discarded_count,
      total_narratives: narratives.length,
    };
}

// Seed with ONE query at start to avoid saturating the LLM
const SEED_QUERIES = ['IA agentes autónomos'];
let seeded = false;

export async function seedInitialLoops() {
  if (seeded) return;
  seeded = true;
  // Single seed loop, then periodic re-runs (sequential, not parallel)
  setTimeout(() => {
    runLoop({ query: SEED_QUERIES[0], max_iterations: 2 }).catch(console.error);
  }, 3000);
  // Periodic re-runs to keep system alive — ONE at a time
  setInterval(() => {
    const queries = ['IA agentes autónomos', 'regulación cripto 2026', 'cumbre climática', 'despidos tech'];
    const q = queries[Math.floor(Math.random() * queries.length)];
    runLoop({ query: q, max_iterations: 2 }).catch(console.error);
  }, 120_000); // every 2 min
}
