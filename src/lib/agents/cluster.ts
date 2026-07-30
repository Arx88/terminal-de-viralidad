// ─────────────────────────────────────────────────────────────────────────
// Agent 2: CLUSTER
// Role: dedup mentions, group into narratives by semantic similarity.
// Input: NormalizedMention[] (+ optional existing narratives for incremental update)
// Output: Narrative[] (each with mention_count, author_count, source_count, keywords)
// Algorithm: simple TF-IDF cosine similarity (tier-1 in the doc)
// For MVP we use token overlap Jaccard — fast, no embeddings needed.
// ─────────────────────────────────────────────────────────────────────────

import type { AgentResult, NormalizedMention, Narrative } from '../types';
import { store } from '../eventbus';

export interface ClusterInput {
  loop_id: string;
  iteration: number;
  mentions: NormalizedMention[];
  existing_narratives: Narrative[];
  query: string;
}

export interface ClusterOutput {
  narratives: Narrative[];
  new_narrative_count: number;
  updated_narrative_count: number;
  unassigned_count: number;
}

const SIM_THRESHOLD = 0.18; // Jaccard threshold for "same narrative"

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[@#]\w+/g, ' ')
      .normalize('NFKD')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

function extractKeywords(mentions: NormalizedMention[], limit = 8): string[] {
  const freq = new Map<string, number>();
  for (const m of mentions) {
    const text = `${m.title ?? ''} ${m.body}`;
    const tokens = tokenize(text);
    for (const t of tokens) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

function generateTitle(keywords: string[]): string {
  if (keywords.length === 0) return 'untitled-narrative';
  const top = keywords.slice(0, 3).map(w => w.toUpperCase()).join('-');
  return top;
}

export async function clusterAgent(input: ClusterInput): Promise<AgentResult<ClusterOutput>> {
  const start = Date.now();
  const { loop_id, iteration, mentions, existing_narratives, query } = input;

  // Build token sets for existing narratives (from their keywords + sample mentions)
  const narrative_tokens = existing_narratives.map(n => ({
    narrative: n,
    tokens: new Set([
      ...n.keywords,
      ...n.sample_mentions.flatMap(m => [...tokenize(`${m.title ?? ''} ${m.body}`)]),
      ...tokenize(n.title),
    ]),
  }));

  const updated = new Map<string, Narrative>();
  for (const n of existing_narratives) updated.set(n.id, { ...n });

  const unassigned: NormalizedMention[] = [];
  let new_count = 0;
  let updated_count = 0;

  for (const mention of mentions) {
    const m_tokens = tokenize(`${mention.title ?? ''} ${mention.body} ${query}`);
    let best_narrative_id: string | null = null;
    let best_sim = 0;

    for (const { narrative, tokens } of narrative_tokens) {
      const sim = jaccard(m_tokens, tokens);
      if (sim > best_sim) {
        best_sim = sim;
        best_narrative_id = narrative.id;
      }
    }

    if (best_sim >= SIM_THRESHOLD && best_narrative_id) {
      const n = updated.get(best_narrative_id)!;
      n.mention_count += 1;
      n.last_seen = Math.max(n.last_seen, mention.fetched_at);
      n.sample_mentions = [mention, ...n.sample_mentions].slice(0, 10);
      if (!n.sources.includes(mention.source)) {
        n.sources = [...n.sources, mention.source];
        n.source_count = n.sources.length;
      }
      updated_count++;
    } else {
      unassigned.push(mention);
    }
  }

  // Create new narratives from unassigned mentions (group them by similarity)
  const unassigned_groups: NormalizedMention[][] = [];
  for (const m of unassigned) {
    const m_tokens = tokenize(`${m.title ?? ''} ${m.body} ${query}`);
    let placed = false;
    for (const group of unassigned_groups) {
      const group_tokens = tokenize(`${group[0].title ?? ''} ${group[0].body} ${query}`);
      if (jaccard(m_tokens, group_tokens) >= SIM_THRESHOLD * 1.5) {
        group.push(m);
        placed = true;
        break;
      }
    }
    if (!placed) unassigned_groups.push([m]);
  }

  for (const group of unassigned_groups) {
    if (group.length < 1) continue;
    const keywords = extractKeywords(group);
    const sources = Array.from(new Set(group.map(m => m.source)));
    const id = crypto.randomUUID();
    const now = Date.now();
    const new_narrative: Narrative = {
      id,
      title: generateTitle(keywords),
      summary: `Narrativa detectada sobre: ${keywords.slice(0, 4).join(', ')}`,
      status: 'forming',
      legitimacy: 'UNCERTAIN',
      origin_source: group[0].source,
      origin_quality: 0.5,
      first_seen: Math.min(...group.map(m => m.fetched_at)),
      last_seen: Math.max(...group.map(m => m.fetched_at)),
      mention_count: group.length,
      author_count: new Set(group.map(m => m.author.handle).filter(Boolean)).size,
      source_count: sources.length,
      sources,
      keywords,
      velocity_1h: 0,
      velocity_6h: 0,
      velocity_24h: 0,
      acceleration: 0,
      entropy: 0,
      trash_penalty: 1.0,
      velocity_score: 0,
      maturity_score: 0,
      current_score: 0,
      decay_factor: 1.0,
      burst_onset: null,
      predicted_peak: null,
      phase_confidence: 0.5,
      history: [0],
      sample_mentions: group.slice(0, 10),
      last_delta_pct: 0,
      loop_iterations: 1,
    };
    updated.set(id, new_narrative);
    narrative_tokens.push({ narrative: new_narrative, tokens: new Set([...keywords, ...tokenize(new_narrative.title)]) });
    new_count++;
  }

  // Update author_count + entropy for all narratives
  for (const n of updated.values()) {
    const authors = new Set(n.sample_mentions.map(m => m.author.handle).filter(Boolean));
    n.author_count = Math.max(n.author_count, authors.size);
    // Simple entropy proxy
    if (n.author_count > 0) {
      n.entropy = Math.min(1, Math.log(n.author_count + 1) / Math.log(20));
    }
  }

  store.logActivity({
    id: crypto.randomUUID(),
    agent: 'cluster',
    status: 'success',
    started_at: start,
    finished_at: Date.now(),
    duration_ms: Date.now() - start,
    input_summary: `${mentions.length} mentions, ${existing_narratives.length} existing narratives`,
    output_summary: `${new_count} new + ${updated_count} updated, ${unassigned.length - new_count} unassigned`,
    loop_id, iteration,
    metrics: { new_narratives: new_count, updated: updated_count, unassigned: unassigned.length },
  });

  return {
    agent: 'cluster',
    status: 'success',
    output: {
      narratives: Array.from(updated.values()),
      new_narrative_count: new_count,
      updated_narrative_count: updated_count,
      unassigned_count: unassigned.length - new_count,
    },
    summary: `Cluster: ${new_count} new + ${updated_count} updated narratives`,
    metrics: { new: new_count, updated: updated_count, total: updated.size },
    duration_ms: Date.now() - start,
    request_reloop: false,
  };
}
