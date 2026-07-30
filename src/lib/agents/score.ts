// ─────────────────────────────────────────────────────────────────────────
// Agent 3: SCORE
// Role: compute Vel × Mat^γ × Pen × Decay for each narrative.
// Also: detect burst onset (CUSUM-lite).
// Input: Narrative[]
// Output: scored Narrative[]
// ─────────────────────────────────────────────────────────────────────────

import type { AgentResult, Narrative } from '../types';
import { store } from '../eventbus';

export interface ScoreInput {
  loop_id: string;
  iteration: number;
  narratives: Narrative[];
}

export interface ScoreOutput {
  narratives: Narrative[];
  top_score: number;
  burst_count: number;
}

const GAMMA = 0.5; // maturity weight
const HALF_LIFE_H = 12; // 12h for twitter-like

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function computeVelocity(n: Narrative): { vel: number; vel_1h: number; accel: number } {
  // velocity_1h: mentions per hour in last 1h
  const now = Date.now();
  const mentions_last_1h = n.sample_mentions.filter(m => now - m.fetched_at < 3600_000).length;
  // Use history if available, else estimate
  const history = n.history.length > 1 ? n.history : [0, mentions_last_1h];
  const vel_1h = mentions_last_1h || (n.mention_count / Math.max(1, (now - n.first_seen) / 3600_000));

  // Robust z-score (very simplified)
  const mean = history.reduce((a, b) => a + b, 0) / Math.max(1, history.length);
  const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, history.length);
  const std = Math.sqrt(variance) || 1;
  const z = (vel_1h - mean) / std;
  const vel = sigmoid(z); // [0,1]

  // Acceleration: difference of last two history points
  const accel = history.length >= 2 ? history[history.length - 1] - history[history.length - 2] : 0;

  return { vel, vel_1h, accel };
}

function computeMaturity(n: Narrative): number {
  const cumvol = Math.log(1 + n.mention_count) / Math.log(100); // normalize ~0-1
  const H = n.entropy;
  const nsrc = n.source_count / 5; // 0-1, 5 sources max
  const age_h = Math.min((Date.now() - n.first_seen) / 3600_000, 48) / 48;
  return sigmoid(2 * cumvol + 1.5 * H + 2 * nsrc + age_h);
}

function computeTrashPenalty(n: Narrative): number {
  // Simplified: product of 3 sub-penals (bot/dup/origin)
  // For MVP we approximate with heuristics on sample_mentions
  const mentions = n.sample_mentions;
  if (mentions.length === 0) return 0.3;

  // p2: duplicate ratio — Jaccard similarity between mention bodies
  const bodies = mentions.map(m => new Set(m.body.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3)));
  let dup_pairs = 0;
  let total_pairs = 0;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const inter = [...bodies[i]].filter(w => bodies[j].has(w)).length;
      const union = new Set([...bodies[i], ...bodies[j]]).size;
      const sim = union > 0 ? inter / union : 0;
      if (sim > 0.7) dup_pairs++;
      total_pairs++;
    }
  }
  const dup_ratio = total_pairs > 0 ? dup_pairs / total_pairs : 0;
  const p2 = Math.max(0.1, 1 - dup_ratio);

  // p3: low quality origin — new accounts / low followers
  const low_quality = mentions.filter(m => (m.author.followers ?? 1000) < 200).length;
  const p3 = Math.max(0.2, 1 - (low_quality / mentions.length) * 0.8);

  // p5: promotional — high URL ratio / hashtag stuffing
  const promo = mentions.filter(m => {
    const urls = (m.body.match(/https?:/g) ?? []).length;
    const tags = (m.body.match(/#\w+/g) ?? []).length;
    return urls > 2 || tags > 4;
  }).length;
  const p5 = Math.max(0.3, 1 - (promo / mentions.length) * 0.7);

  return p2 * p3 * p5;
}

function computeDecay(n: Narrative): number {
  const age_h = (Date.now() - n.first_seen) / 3600_000;
  const lambda = Math.log(2) / HALF_LIFE_H;
  // If decaying, accelerate
  const multiplier = n.status === 'decaying' ? 3 : 1;
  return Math.exp(-lambda * age_h * multiplier);
}

function detectBurst(n: Narrative, vel_1h: number): number | null {
  // Simple CUSUM-lite: if current velocity > 2x previous, mark as burst onset
  if (n.history.length < 2) return null;
  const prev = n.history[n.history.length - 1] || 0;
  if (prev > 0 && vel_1h > prev * 2 && vel_1h > 3) {
    return Date.now();
  }
  return n.burst_onset;
}

export async function scoreAgent(input: ScoreInput): Promise<AgentResult<ScoreOutput>> {
  const start = Date.now();
  const { loop_id, iteration, narratives } = input;
  const scored: Narrative[] = [];
  let top_score = 0;
  let burst_count = 0;

  for (const n of narratives) {
    const { vel, vel_1h, accel } = computeVelocity(n);
    const mat = computeMaturity(n);
    const pen = computeTrashPenalty(n);
    const decay = computeDecay(n);
    const score = 100 * vel * Math.pow(mat, GAMMA) * pen * decay;

    const burst = detectBurst(n, vel_1h);
    if (burst && burst !== n.burst_onset) burst_count++;

    const prev_score = n.current_score;
    const delta_pct = prev_score > 0 ? ((score - prev_score) / prev_score) * 100 : 0;

    // Update history (rolling 24 points)
    const new_history = [...n.history, vel_1h].slice(-24);

    const updated: Narrative = {
      ...n,
      velocity_1h: vel_1h,
      velocity_score: vel,
      maturity_score: mat,
      trash_penalty: pen,
      decay_factor: decay,
      acceleration: accel,
      current_score: score,
      burst_onset: burst,
      history: new_history,
      last_delta_pct: delta_pct,
      loop_iterations: n.loop_iterations + 1,
    };

    scored.push(updated);
    if (score > top_score) top_score = score;

    // Persist to store + emit update
    store.upsert(updated);
  }

  store.logActivity({
    id: crypto.randomUUID(),
    agent: 'score',
    status: 'success',
    started_at: start,
    finished_at: Date.now(),
    duration_ms: Date.now() - start,
    input_summary: `${narratives.length} narratives`,
    output_summary: `top_score=${top_score.toFixed(1)}, bursts=${burst_count}`,
    loop_id, iteration,
    metrics: { narratives: narratives.length, top_score: top_score.toFixed(1), bursts: burst_count },
  });

  return {
    agent: 'score',
    status: 'success',
    output: { narratives: scored, top_score, burst_count },
    summary: `Score computed for ${scored.length} narratives. Top=${top_score.toFixed(1)}, Bursts=${burst_count}`,
    metrics: { top_score: top_score.toFixed(1), bursts: burst_count },
    duration_ms: Date.now() - start,
    request_reloop: false,
  };
}
