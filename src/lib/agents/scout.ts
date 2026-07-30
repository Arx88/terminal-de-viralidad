// ─────────────────────────────────────────────────────────────────────────
// Agent 1: SCOUT
// Role: scrape sources, normalize mentions.
// Input: { query, sources[] }
// Output: NormalizedMention[]
// Re-loop trigger: when validator says "need more sources to confirm"
// ─────────────────────────────────────────────────────────────────────────

import type { AgentResult, NormalizedMention, SourceType } from '../types';
import { adapters } from '../adapters';
import { store } from '../eventbus';

export interface ScoutInput {
  loop_id: string;
  iteration: number;
  query: string;
  sources: SourceType[];
  need_more_sources?: SourceType[];
  existing_mentions?: NormalizedMention[];
}

export interface ScoutOutput {
  mentions: NormalizedMention[];
  sources_queried: SourceType[];
  total_fetched: number;
  new_count: number;
}

export async function scoutAgent(input: ScoutInput): Promise<AgentResult<ScoutOutput>> {
  const start = Date.now();
  const { loop_id, iteration, query, sources, need_more_sources, existing_mentions = [] } = input;

  // On re-loop iterations, focus on sources validator asked for more data from
  const target_sources = iteration > 1 && need_more_sources?.length
    ? need_more_sources
    : sources;

  const valid_sources = target_sources.filter(s => adapters[s]);
  const all_new: NormalizedMention[] = [];

  for (const source of valid_sources) {
    const source_start = Date.now();
    try {
      const mentions = await adapters[source].fetch(query, { maxResults: 10 });
      const existing_ids = new Set(existing_mentions.map(m => m.source_id));
      const fresh = mentions.filter(m => !existing_ids.has(m.source_id));
      all_new.push(...fresh);

      store.logActivity({
        id: crypto.randomUUID(),
        agent: 'scout',
        status: 'success',
        started_at: source_start,
        finished_at: Date.now(),
        duration_ms: Date.now() - source_start,
        input_summary: `query="${query}" source=${source}`,
        output_summary: `${fresh.length} new mentions (of ${mentions.length} fetched)`,
        loop_id, iteration,
        metrics: { source, fetched: mentions.length, new: fresh.length },
      });
    } catch (err: any) {
      store.logActivity({
        id: crypto.randomUUID(),
        agent: 'scout',
        status: 'failed',
        started_at: source_start,
        finished_at: Date.now(),
        duration_ms: Date.now() - source_start,
        input_summary: `query="${query}" source=${source}`,
        output_summary: `Error: ${err.message}`,
        loop_id, iteration,
        error: err.message,
      });
    }
  }

  return {
    agent: 'scout',
    status: 'success',
    output: {
      mentions: all_new,
      sources_queried: valid_sources,
      total_fetched: all_new.length,
      new_count: all_new.length,
    },
    summary: `Scout fetched ${all_new.length} new mentions from ${valid_sources.length} sources`,
    metrics: {
      total_mentions: all_new.length,
      sources_queried: valid_sources.length,
      iteration,
    },
    duration_ms: Date.now() - start,
    request_reloop: false,
  };
}
