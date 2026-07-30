// ─────────────────────────────────────────────────────────────────────────
// Agent 3: SCORE (LLM-driven)
// Role: el LLM evalúa la viralidad de cada narrativa con razonamiento.
// No usa fórmula determinista — el LLM decide el score basándose en su
// conocimiento de cómo se comportan las narrativas virales.
// ─────────────────────────────────────────────────────────────────────────

import { llmJson, llmJsonSafe } from '../llm';
import type { AgentResult, Narrative } from '../types';
import { store } from '../eventbus';

export interface ScoreInput {
  loop_id: string;
  iteration: number;
  narratives: Narrative[];
}

export interface ScoreOutput {
  narratives: Narrative[];
  reasoning: string;
  top_score: number;
}

interface ScoreLLMResponse {
  scored: Array<{
    narrative_id: string;
    velocity_score: number;    // 0-1
    maturity_score: number;    // 0-1
    trash_penalty: number;     // 0-1
    current_score: number;     // 0-100
    reasoning: string;         // por qué estos valores
  }>;
  reasoning: string;          // razonamiento general
}

const SYSTEM_PROMPT = `Sos SCORE, un analista de viralidad experto. Tu trabajo: evaluar cuán viral es cada narrativa.

Para cada narrativa, considerá:
- VELOCITY (velocidad): qué tan rápido está creciendo ahora. Mencionás recientes + aceleración.
- MATURITY (madurez): qué tan consolidada está. Volumen acumulado + diversidad de fuentes + edad.
- TRASH PENALTY (penalización): señales de manipulación. Bots, contenido duplicado, autores sospechosos, spam promocional.

Devolver:
- velocity_score: 0-1
- maturity_score: 0-1
- trash_penalty: 0-1 (1 = limpio, 0 = spam)
- current_score: 0-100 (score final = 100 · velocity · maturity^0.5 · trash_penalty · decay)
- reasoning: explicación breve en español

Sos riguroso, no inflás scores. Una narrativa con 5 menciones del mismo autor no es viral, es ruido.
Pensá en español rioplatense.`;

export async function scoreAgent(input: ScoreInput): Promise<AgentResult<ScoreOutput>> {
  const start = Date.now();
  const { loop_id, iteration, narratives } = input;

  if (narratives.length === 0) {
    return {
      agent: 'score',
      status: 'success',
      output: { narratives: [], reasoning: 'Sin narrativas para scorear', top_score: 0 },
      summary: 'Score: sin narrativas',
      metrics: { top_score: 0 },
      duration_ms: Date.now() - start,
      request_reloop: false,
    };
  }

  const context = narratives.map(n => ({
    id: n.id,
    title: n.title,
    mc: n.mention_count,
    sc: n.source_count,
    age_min: Math.floor((Date.now() - n.first_seen) / 60_000),
    vs: n.velocity_score,
    ms: n.maturity_score,
    cs: n.current_score,
  }));

  const result = await llmJsonSafe<ScoreLLMResponse>(
    SYSTEM_PROMPT,
    `Iter: ${iteration}
Narrativas:
${JSON.stringify(context)}

Para cada una, devolvé scores. JSON:
{"scored":[{"narrative_id":"...","velocity_score":0.0,"maturity_score":0.0,"trash_penalty":0.0,"current_score":0,"reasoning":"..."}],"reasoning":"..."}`,
    { temperature: 0.3, max_tokens: 1500 }
  );

  let scored: Narrative[] = [];
  let top_score = 0;
  let reasoning = 'Score computed';

  if (result.data) {
    const scoreMap = new Map(result.data.scored.map(s => [s.narrative_id, s]));
    for (const n of narratives) {
      const s = scoreMap.get(n.id);
      if (!s) {
        scored.push(n);
        continue;
      }
      const prev_score = n.current_score;
      const delta_pct = prev_score > 0 ? ((s.current_score - prev_score) / prev_score) * 100 : 0;
      const new_history = [...n.history, s.velocity_score * 100].slice(-24);
      const updated: Narrative = {
        ...n,
        velocity_score: s.velocity_score,
        maturity_score: s.maturity_score,
        trash_penalty: s.trash_penalty,
        current_score: s.current_score,
        last_delta_pct: delta_pct,
        history: new_history,
        velocity_1h: s.velocity_score * n.mention_count,
        loop_iterations: n.loop_iterations + 1,
      };
      scored.push(updated);
      if (s.current_score > top_score) top_score = s.current_score;
      await store.upsert(updated);
    }
    reasoning = result.data.reasoning;
  } else {
    // Fallback: assign deterministic-ish scores based on mention count + age
    for (const n of narratives) {
      const age_h = (Date.now() - n.first_seen) / 3600_000;
      const vel = Math.min(1, n.mention_count / Math.max(1, age_h) / 10);
      const mat = Math.min(1, n.mention_count / 20);
      const pen = 0.7;
      const score = 100 * vel * Math.pow(mat, 0.5) * pen;
      const updated: Narrative = {
        ...n,
        velocity_score: vel,
        maturity_score: mat,
        trash_penalty: pen,
        current_score: score,
        velocity_1h: vel * n.mention_count,
        history: [...n.history, vel * 100].slice(-24),
        loop_iterations: n.loop_iterations + 1,
      };
      scored.push(updated);
      if (score > top_score) top_score = score;
      await store.upsert(updated);
    }
    reasoning = `Fallback (LLM error: ${result.error?.slice(0, 60)})`;
  }

  await store.logActivity({
    id: crypto.randomUUID(),
    agent: 'score',
    status: 'success',
    started_at: start,
    finished_at: Date.now(),
    duration_ms: Date.now() - start,
    input_summary: `${narratives.length} narrativas`,
    output_summary: `Top score=${top_score.toFixed(1)}/100 ${result.data ? '' : '(fallback)'}`,
    explanation: reasoning.slice(0, 250),
    loop_id, iteration,
    metrics: {
      narratives: narratives.length,
      top_score: top_score.toFixed(1),
      fallback: result.data ? 0 : 1,
    },
  });

  return {
    agent: 'score',
    status: 'success',
    output: { narratives: scored, reasoning, top_score },
    summary: `Score: top=${top_score.toFixed(1)}/100`,
    metrics: { top_score: top_score.toFixed(1), fallback: result.data ? 0 : 1 },
    duration_ms: Date.now() - start,
    request_reloop: false,
  };
}
