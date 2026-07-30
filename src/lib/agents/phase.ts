// ─────────────────────────────────────────────────────────────────────────
// Agent 4: PHASE
// Role: classify each narrative into forming/rising/formed/decaying using
// HMM-like state machine on (Vel, Mat, accel) features.
// Input: Narrative[] (already scored)
// Output: Narrative[] with .status + .phase_confidence set
// ─────────────────────────────────────────────────────────────────────────

import type { AgentResult, Narrative, Phase } from '../types';
import { store } from '../eventbus';

export interface PhaseInput {
  loop_id: string;
  iteration: number;
  narratives: Narrative[];
}

export interface PhaseOutput {
  narratives: Narrative[];
  phase_distribution: Record<Phase, number>;
  transitions: number;
}

function classifyPhase(n: Narrative): { phase: Phase; confidence: number } {
  const vel = n.velocity_score;
  const mat = n.maturity_score;
  const accel = n.acceleration;
  const age_h = (Date.now() - n.first_seen) / 3600_000;

  // HMM emission-inspired rules (would be Viterbi in production)
  // forming: vel > 0.3, mat < 0.4, accel > 0
  // rising:  vel > 0.6, mat < 0.7, accel > 0
  // formed:  vel < 0.4, mat > 0.7, accel ≈ 0
  // decaying: vel < 0.3, accel < 0, age > 6h

  let phase: Phase;
  let confidence: number;

  if (vel < 0.25 && accel < -0.5 && age_h > 4) {
    phase = 'decaying';
    confidence = 0.85;
  } else if (mat > 0.7 && vel < 0.45) {
    phase = 'formed';
    confidence = 0.78;
  } else if (vel > 0.6 && mat < 0.75 && accel > 0) {
    phase = 'rising';
    confidence = 0.82;
  } else if (vel > 0.3 && mat < 0.5 && accel >= 0) {
    phase = 'forming';
    confidence = 0.7;
  } else if (mat > 0.5 && vel < 0.5) {
    // transitioning forming -> formed
    phase = vel > 0.4 ? 'rising' : 'formed';
    confidence = 0.6;
  } else {
    // fallback
    phase = 'forming';
    confidence = 0.5;
  }

  // Boost confidence if burst detected recently
  if (n.burst_onset && Date.now() - n.burst_onset < 1800_000) {
    confidence = Math.min(0.95, confidence + 0.1);
  }

  return { phase, confidence };
}

export async function phaseAgent(input: PhaseInput): Promise<AgentResult<PhaseOutput>> {
  const start = Date.now();
  const { loop_id, iteration, narratives } = input;

  const classified: Narrative[] = [];
  const distribution: Record<Phase, number> = { forming: 0, rising: 0, formed: 0, decaying: 0 };
  let transitions = 0;

  for (const n of narratives) {
    const { phase, confidence } = classifyPhase(n);
    const old_phase = n.status;
    if (old_phase !== phase) transitions++;
    distribution[phase]++;

    const updated: Narrative = {
      ...n,
      status: phase,
      phase_confidence: confidence,
      // Predict peak: rough estimate based on current vel/mat trajectory
      predicted_peak: phase === 'rising' || phase === 'forming'
        ? Date.now() + (1 - n.maturity_score) * 6 * 3600_000
        : null,
    };
    classified.push(updated);
    store.upsert(updated);
  }

  store.logActivity({
    id: crypto.randomUUID(),
    agent: 'phase',
    status: 'success',
    started_at: start,
    finished_at: Date.now(),
    duration_ms: Date.now() - start,
    input_summary: `${narratives.length} narratives`,
    output_summary: `forming=${distribution.forming} rising=${distribution.rising} formed=${distribution.formed} decaying=${distribution.decaying}`,
    loop_id, iteration,
    metrics: { ...distribution, transitions },
  });

  return {
    agent: 'phase',
    status: 'success',
    output: { narratives: classified, phase_distribution: distribution, transitions },
    summary: `Phase classified: ${transitions} transitions`,
    metrics: { ...distribution, transitions },
    duration_ms: Date.now() - start,
    request_reloop: false,
  };
}
