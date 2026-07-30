// ─────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR — runs the agent loop until convergence
//
// Loop structure:
//   iteration N:
//     1. Scout    → mentions[]
//     2. Cluster  → narratives[]
//     3. Score    → scored narratives
//     4. Phase    → phased narratives
//     5. Validator → legitimacy + convergence decision
//        ↳ if request_reloop && iteration < max: go to 1 with feedback
//        ↳ else: emit convergence event, exit
// ─────────────────────────────────────────────────────────────────────────

import type { Narrative, NormalizedMention, SourceType, AgentName } from '../types';
import { store, bus } from '../eventbus';
import { scoutAgent, type ScoutInput } from './scout';
import { clusterAgent, type ClusterInput } from './cluster';
import { scoreAgent, type ScoreInput } from './score';
import { phaseAgent, type PhaseInput } from './phase';
import { validatorAgent, type ValidatorInput } from './validator';

export interface OrchestratorConfig {
  query: string;
  sources: SourceType[];
  max_iterations: number;
  // Delay between iterations (ms) — lets UI catch up
  iteration_delay_ms: number;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  query: 'AI agents',
  sources: ['twitter', 'gdelt', 'reddit', 'hackernews'],
  max_iterations: 4,
  iteration_delay_ms: 800,
};

// Track active loops to prevent overlap
const active_loops = new Set<string>();

export async function runLoop(config: Partial<OrchestratorConfig> = {}): Promise<{
  loop_id: string;
  iterations: number;
  converged_count: number;
  total_narratives: number;
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const loop_id = `loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (active_loops.has(cfg.query)) {
    return { loop_id, iterations: 0, converged_count: 0, total_narratives: 0 };
  }
  active_loops.add(cfg.query);

  try {
    let iteration = 0;
    let all_mentions: NormalizedMention[] = [];
    let narratives: Narrative[] = [];
    let converged_count = 0;
    let need_more_sources: SourceType[] = [];
    let request_reloop = true;

    while (request_reloop && iteration < cfg.max_iterations) {
      iteration++;
      const iter_start = Date.now();

      // ── Step 1: Scout ────────────────────────────────────────────
      bus.emitLoopIteration(loop_id, iteration, 'scout' as AgentName, 'running');
      const scout_in: ScoutInput = {
        loop_id, iteration,
        query: cfg.query,
        sources: cfg.sources,
        need_more_sources: iteration > 1 ? need_more_sources : undefined,
        existing_mentions: all_mentions,
      };
      const scout_res = await scoutAgent(scout_in);
      all_mentions = [...all_mentions, ...scout_res.output.mentions];
      bus.emitLoopIteration(loop_id, iteration, 'scout' as AgentName, 'success');

      // ── Step 2: Cluster ──────────────────────────────────────────
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

      // ── Step 3: Score ────────────────────────────────────────────
      bus.emitLoopIteration(loop_id, iteration, 'score' as AgentName, 'running');
      const score_in: ScoreInput = { loop_id, iteration, narratives };
      const score_res = await scoreAgent(score_in);
      narratives = score_res.output.narratives;
      bus.emitLoopIteration(loop_id, iteration, 'score' as AgentName, 'success');

      // ── Step 4: Phase ────────────────────────────────────────────
      bus.emitLoopIteration(loop_id, iteration, 'phase' as AgentName, 'running');
      const phase_in: PhaseInput = { loop_id, iteration, narratives };
      const phase_res = await phaseAgent(phase_in);
      narratives = phase_res.output.narratives;
      bus.emitLoopIteration(loop_id, iteration, 'phase' as AgentName, 'success');

      // ── Step 5: Validator ────────────────────────────────────────
      bus.emitLoopIteration(loop_id, iteration, 'validator' as AgentName, 'running');
      const val_in: ValidatorInput = {
        loop_id, iteration, narratives,
        max_iterations: cfg.max_iterations,
      };
      const val_res = await validatorAgent(val_in);
      narratives = val_res.output.narratives;
      converged_count = val_res.output.converged_ids.length;
      need_more_sources = val_res.output.need_more_sources;
      request_reloop = val_res.request_reloop;
      bus.emitLoopIteration(loop_id, iteration, 'validator' as AgentName, 'success');

      // Emit convergence events for converged narratives
      for (const id of val_res.output.converged_ids) {
        bus.emitConvergence(loop_id, id, iteration);
      }

      // Delay before next iteration
      if (request_reloop && iteration < cfg.max_iterations) {
        await new Promise(r => setTimeout(r, cfg.iteration_delay_ms));
      }
    }

    store.logActivity({
      id: crypto.randomUUID(),
      agent: 'orchestrator',
      status: 'success',
      started_at: Date.now() - (iteration * 5000), // approx
      finished_at: Date.now(),
      duration_ms: iteration * 5000,
      input_summary: `query="${cfg.query}" sources=${cfg.sources.length} max_iter=${cfg.max_iterations}`,
      output_summary: `LOOP COMPLETE: ${iteration} iterations, ${converged_count} converged, ${narratives.length} total narratives`,
      loop_id, iteration,
      metrics: {
        iterations: iteration,
        converged: converged_count,
        total_narratives: narratives.length,
        total_mentions: all_mentions.length,
      },
    });

    return {
      loop_id,
      iterations: iteration,
      converged_count,
      total_narratives: narratives.length,
    };
  } finally {
    active_loops.delete(cfg.query);
  }
}

// Auto-trigger loop on startup with a few interesting queries
const SEED_QUERIES = ['AI agents', 'crypto regulation', 'climate summit', 'tech layoffs'];
let seeded = false;

export async function seedInitialLoops() {
  if (seeded) return;
  seeded = true;
  // Run first loop immediately, schedule rest with delay
  for (let i = 0; i < SEED_QUERIES.length; i++) {
    setTimeout(() => {
      runLoop({ query: SEED_QUERIES[i] }).catch(console.error);
    }, i * 4000);
  }
  // Schedule periodic re-runs to keep UI alive
  setInterval(() => {
    const q = SEED_QUERIES[Math.floor(Math.random() * SEED_QUERIES.length)];
    runLoop({ query: q, max_iterations: 3 }).catch(console.error);
  }, 60_000); // every minute
}
