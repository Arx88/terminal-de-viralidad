// ─────────────────────────────────────────────────────────────────────────
// Agent 4: PHASE (LLM-driven)
// Role: el LLM clasifica cada narrativa en una de 4 fases (forming/rising/
// formed/decaying) y explica por qué.
// ─────────────────────────────────────────────────────────────────────────

import { llmJson, llmJsonSafe } from '../llm';
import type { AgentResult, Narrative, Phase } from '../types';
import { store } from '../eventbus';

export interface PhaseInput {
  loop_id: string;
  iteration: number;
  narratives: Narrative[];
}

export interface PhaseOutput {
  narratives: Narrative[];
  reasoning: string;
  phase_distribution: Record<Phase, number>;
  transitions: number;
}

interface PhaseLLMResponse {
  classified: Array<{
    narrative_id: string;
    phase: Phase;
    confidence: number;     // 0-1
    reasoning: string;      // por qué esta fase
  }>;
  reasoning: string;
}

const SYSTEM_PROMPT = `Sos PHASE, un analista temporal de narrativas. Clasificás cada narrativa en una de 4 fases:

- FORMING (formándose): pocos autores pero calidad, señal temprana. Velocity medio-alto, madurez baja, aceleración creciente.
- RISING (creciente): burst de velocidad, dispersión creciente. Velocity alto, madurez media, ganando tracción.
- FORMED (formada/consolidada): alta dispersión, muchos autores, velocity estabilizada o bajando. Madurez alta.
- DECAYING (decaída): velocity decreciendo, autores abandonando. Velocity bajo, madurez alta pero decayendo.

Para cada narrativa, mirá sus scores, su edad, su historial de velocity, y decidí la fase.
También devolvé confidence (0-1) y un reasoning breve en español.

Sos preciso. No todas las narrativas pasan por todas las fases linealmente.
Pensá en español rioplatense.`;

export async function phaseAgent(input: PhaseInput): Promise<AgentResult<PhaseOutput>> {
  const start = Date.now();
  const { loop_id, iteration, narratives } = input;

  if (narratives.length === 0) {
    return {
      agent: 'phase',
      status: 'success',
      output: {
        narratives: [],
        reasoning: 'Sin narrativas',
        phase_distribution: { forming: 0, rising: 0, formed: 0, decaying: 0 },
        transitions: 0,
      },
      summary: 'Phase: sin narrativas',
      metrics: {},
      duration_ms: Date.now() - start,
      request_reloop: false,
    };
  }

  const context = narratives.map(n => ({
    id: n.id,
    title: n.title.slice(0, 50),
    mc: n.mention_count,
    sc: n.source_count,
    age_min: Math.floor((Date.now() - n.first_seen) / 60_000),
    vs: n.velocity_score.toFixed(2),
    ms: n.maturity_score.toFixed(2),
    cs: n.current_score.toFixed(0),
    cur: n.status,
  }));

  const result = await llmJsonSafe<PhaseLLMResponse>(
    SYSTEM_PROMPT,
    `Iter: ${iteration}
Narrativas:
${JSON.stringify(context)}

Para cada una asigná fase. JSON:
{"classified":[{"narrative_id":"...","phase":"forming|rising|formed|decaying","confidence":0.0,"reasoning":"..."}],"reasoning":"..."}`,
    { temperature: 0.3, max_tokens: 1200 }
  );

  const classified: Narrative[] = [];
  const distribution: Record<Phase, number> = { forming: 0, rising: 0, formed: 0, decaying: 0 };
  let transitions = 0;

  if (result.data) {
    const phaseMap = new Map(result.data.classified.map(c => [c.narrative_id, c]));
    for (const n of narratives) {
      const c = phaseMap.get(n.id);
      if (!c) {
        classified.push(n);
        continue;
      }
      const old_phase = n.status;
      if (old_phase !== c.phase) transitions++;
      distribution[c.phase]++;
      const updated: Narrative = {
        ...n,
        status: c.phase,
        phase_confidence: c.confidence,
        predicted_peak: c.phase === 'rising' || c.phase === 'forming'
          ? Date.now() + (1 - n.maturity_score) * 6 * 3600_000
          : null,
      };
      classified.push(updated);
      store.upsert(updated);
    }
  } else {
    // Fallback: heuristic phase classification
    for (const n of narratives) {
      const vel = n.velocity_score;
      const mat = n.maturity_score;
      const age_h = (Date.now() - n.first_seen) / 3600_000;
      let phase: Phase;
      if (vel < 0.25 && age_h > 4) phase = 'decaying';
      else if (mat > 0.7 && vel < 0.45) phase = 'formed';
      else if (vel > 0.6 && mat < 0.75) phase = 'rising';
      else phase = 'forming';
      const old_phase = n.status;
      if (old_phase !== phase) transitions++;
      distribution[phase]++;
      const updated: Narrative = {
        ...n,
        status: phase,
        phase_confidence: 0.6,
        predicted_peak: phase === 'rising' || phase === 'forming'
          ? Date.now() + (1 - n.maturity_score) * 6 * 3600_000
          : null,
      };
      classified.push(updated);
      store.upsert(updated);
    }
  }

  store.logActivity({
    id: crypto.randomUUID(),
    agent: 'phase',
    status: 'success',
    started_at: start,
    finished_at: Date.now(),
    duration_ms: Date.now() - start,
    input_summary: `${narratives.length} narrativas`,
    output_summary: `f=${distribution.forming} r=${distribution.rising} p=${distribution.formed} d=${distribution.decaying} | ${transitions} trans ${result.data ? '' : '(fallback)'}`,
    explanation: (result.data?.reasoning ?? 'Fallback heurístico aplicado').slice(0, 250),
    loop_id, iteration,
    metrics: { ...distribution, transitions, fallback: result.data ? 0 : 1 },
  });

  return {
    agent: 'phase',
    status: 'success',
    output: { narratives: classified, reasoning: result.data?.reasoning ?? 'Fallback', phase_distribution: distribution, transitions },
    summary: `Phase: ${transitions} transiciones`,
    metrics: { ...distribution, transitions },
    duration_ms: Date.now() - start,
    request_reloop: false,
  };
}
