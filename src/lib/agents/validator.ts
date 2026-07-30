// ─────────────────────────────────────────────────────────────────────────
// Agent 5: VALIDATOR
// Role: cross-source validation + legitimacy badge.
// Decides whether to request re-loop (need more sources) or converge.
// Input: Narrative[] (scored + phased)
// Output: Narrative[] with .legitimacy set + convergence decision
// ─────────────────────────────────────────────────────────────────────────

import type { AgentResult, Narrative, Legitimacy, SourceType } from '../types';
import { store } from '../eventbus';

export interface ValidatorInput {
  loop_id: string;
  iteration: number;
  narratives: Narrative[];
  max_iterations: number;
}

export interface ValidatorOutput {
  narratives: Narrative[];
  converged_ids: string[];
  reloop_narrative_ids: string[];
  need_more_sources: SourceType[];
  legitimacy_distribution: Record<Legitimacy, number>;
}

function classifyLegitimacy(n: Narrative): Legitimacy {
  const sources = n.sources;
  const has_twitter = sources.includes('twitter');
  const has_gdelt = sources.includes('gdelt');
  const has_reddit = sources.includes('reddit');
  const has_hn = sources.includes('hackernews');
  const has_other_real = has_gdelt || has_reddit || has_hn;
  const trash = n.trash_penalty;

  if (has_twitter && has_other_real && trash > 0.6) return 'LEGIT';
  if (has_twitter && !has_other_real && trash < 0.4) return 'BOT_CAMPAIGN';
  if (has_twitter && !has_other_real && trash >= 0.4) return 'TWITTER_NATIVE';
  if (!has_twitter && has_other_real) return 'PRE_BURST';
  if (sources.length === 0 || n.mention_count < 2) return 'NOISE';
  return 'UNCERTAIN';
}

function shouldConverge(n: Narrative, iteration: number, max_iter: number): boolean {
  // Convergence criteria:
  // 1. legitimacy is not UNCERTAIN
  // 2. AND (has 2+ sources OR trash_penalty is decisive (< 0.3 or > 0.7))
  // 3. OR max iterations reached
  if (iteration >= max_iter) return true;
  const leg = n.legitimacy;
  if (leg === 'UNCERTAIN') return false;
  if (n.source_count >= 2) return true;
  if (n.trash_penalty < 0.3 || n.trash_penalty > 0.7) return true;
  return false;
}

function whatSourcesNeeded(n: Narrative): SourceType[] {
  const needed: SourceType[] = [];
  // If only Twitter, need GDELT or Reddit to confirm
  if (n.sources.includes('twitter') && !n.sources.includes('gdelt')) needed.push('gdelt');
  if (n.sources.includes('twitter') && !n.sources.includes('reddit')) needed.push('reddit');
  // If GDELT only, need Twitter to confirm pre-burst
  if (!n.sources.includes('twitter') && n.sources.includes('gdelt')) needed.push('twitter');
  return needed;
}

export async function validatorAgent(input: ValidatorInput): Promise<AgentResult<ValidatorOutput>> {
  const start = Date.now();
  const { loop_id, iteration, narratives, max_iterations } = input;

  const validated: Narrative[] = [];
  const converged_ids: string[] = [];
  const reloop_narrative_ids: string[] = [];
  const need_more_sources_set = new Set<SourceType>();
  const distribution: Record<Legitimacy, number> = {
    LEGIT: 0, BOT_CAMPAIGN: 0, TWITTER_NATIVE: 0, PRE_BURST: 0, NOISE: 0, UNCERTAIN: 0,
  };

  for (const n of narratives) {
    const legitimacy = classifyLegitimacy(n);
    distribution[legitimacy]++;
    const updated: Narrative = { ...n, legitimacy };
    validated.push(updated);
    store.upsert(updated);

    if (shouldConverge(updated, iteration, max_iterations)) {
      converged_ids.push(updated.id);
      store.logActivity({
        id: crypto.randomUUID(),
        agent: 'validator',
        status: 'success',
        started_at: start,
        finished_at: Date.now(),
        duration_ms: Date.now() - start,
        input_summary: `narrative=${updated.title} iter=${iteration}`,
        output_summary: `CONVERGED as ${legitimacy}`,
        loop_id, iteration,
        metrics: { legitimacy, sources: updated.source_count, score: updated.current_score.toFixed(1) },
      });
    } else {
      reloop_narrative_ids.push(updated.id);
      const needed = whatSourcesNeeded(updated);
      needed.forEach(s => need_more_sources_set.add(s));
      store.logActivity({
        id: crypto.randomUUID(),
        agent: 'validator',
        status: 'waiting',
        started_at: start,
        finished_at: Date.now(),
        duration_ms: Date.now() - start,
        input_summary: `narrative=${updated.title} iter=${iteration}`,
        output_summary: `NEED MORE DATA: ${needed.join(', ') || 'uncertain'}`,
        loop_id, iteration,
        metrics: { legitimacy, sources: updated.source_count, needed: needed.length },
      });
    }
  }

  const need_more = Array.from(need_more_sources_set);
  const request_reloop = reloop_narrative_ids.length > 0 && iteration < max_iterations;

  return {
    agent: 'validator',
    status: 'success',
    output: {
      narratives: validated,
      converged_ids,
      reloop_narrative_ids,
      need_more_sources: need_more,
      legitimacy_distribution: distribution,
    },
    summary: `Validated ${validated.length}: ${converged_ids.length} converged, ${reloop_narrative_ids.length} need re-loop`,
    metrics: {
      converged: converged_ids.length,
      reloop: reloop_narrative_ids.length,
      ...Object.fromEntries(Object.entries(distribution).map(([k, v]) => [k, v])) as Record<string, number>,
    },
    duration_ms: Date.now() - start,
    request_reloop,
    reloop_reason: request_reloop ? `Need more sources: ${need_more.join(', ')}` : undefined,
  };
}
