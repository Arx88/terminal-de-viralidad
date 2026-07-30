// ─────────────────────────────────────────────────────────────────────────
// Agent 5: VALIDATOR (LLM-driven)
// Role: el LLM evalúa legitimidad (LEGIT/BOT_CAMPAIGN/etc) con razonamiento,
// genera el briefing legible de la narrativa, y decide si converge.
// ─────────────────────────────────────────────────────────────────────────

import { llmJson, llmJsonSafe } from '../llm';
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
  reasoning: string;
}

interface ValidatorLLMResponse {
  validated: Array<{
    narrative_id: string;
    legitimacy: Legitimacy;
    legitimacy_reasoning: string;
    briefing: string;          // resumen legible 2-3 oraciones
    should_converge: boolean;
    need_more_sources?: SourceType[];
    why_converge_or_not: string;
  }>;
  reasoning: string;
}

const SYSTEM_PROMPT = `Sos VALIDATOR, el último agente del loop. Tu trabajo doble:

1. Para cada narrativa:
   - Asigná LEGITIMACY (LEGIT, BOT_CAMPAIGN, TWITTER_NATIVE, PRE_BURST, NOISE, UNCERTAIN) basándote en cross-source validation + señales de manipulación.
   - Generá un BRIEFING legible en español rioplatense (2-3 oraciones) explicando QUÉ está pasando, QUIÉNES hablan, y POR QUÉ importa.
   - Decidí si CONVERGE (should_converge: true) o si necesita otro loop (should_converge: false + need_more_sources).

2. Criterios de convergencia:
   - CONVERGE si: legitimacy no es UNCERTAIN Y (tiene 2+ fuentes O trash_penalty < 0.3 O trash_penalty > 0.7).
   - NO CONVERGE si: legitimacy es UNCERTAIN o solo 1 fuente con trash_penalty entre 0.3-0.7.
   - Si queda UNCERTAIN después de 3 iteraciones, igualmente convergé con categoría UNCERTAIN.

3. El briefing debe ser INFORMATIVO, no genérico. Decir algo específico sobre el contenido de las menciones. Nada de "esta narrativa trata sobre X". Mejor: "Creciente preocupación en Twitter sobre X tras el anuncio de Y, con poca cobertura de medios tradicionales todavía."

Sos riguroso. Si una narrativa es mierda, marcá NOISE. No inflés legitimidad.
Pensá en español rioplatense.`;

export async function validatorAgent(input: ValidatorInput): Promise<AgentResult<ValidatorOutput>> {
  const start = Date.now();
  const { loop_id, iteration, narratives, max_iterations } = input;

  if (narratives.length === 0) {
    return {
      agent: 'validator',
      status: 'success',
      output: { narratives: [], converged_ids: [], reloop_narrative_ids: [], need_more_sources: [], reasoning: 'Sin narrativas' },
      summary: 'Validator: sin narrativas',
      metrics: {},
      duration_ms: Date.now() - start,
      request_reloop: false,
    };
  }

  const context = narratives.map(n => ({
    id: n.id,
    t: n.title,
    s: n.summary.slice(0, 80),
    mc: n.mention_count,
    sc: n.source_count,
    src: n.sources,
    tp: n.trash_penalty.toFixed(2),
    st: n.status,
    age_min: Math.floor((Date.now() - n.first_seen) / 60_000),
    sm: n.sample_mentions.slice(0, 3).map(m => ({
      src: m.source,
      a: m.author.handle,
      b: ((m.title ?? '') + ' ' + m.body).slice(0, 120),
    })),
  }));

  const result = await llmJsonSafe<ValidatorLLMResponse>(
    SYSTEM_PROMPT,
    `Iter: ${iteration} (max: ${max_iterations})
Narrativas:
${JSON.stringify(context)}

Para cada una:
1. Asigná legitimacy + legitimacy_reasoning
2. Generá briefing legible (2-3 oraciones, informativo, específico al contenido)
3. Decidí should_converge (true/false) + need_more_sources + why_converge_or_not

JSON:
{"validated":[{"narrative_id":"...","legitimacy":"LEGIT|BOT_CAMPAIGN|TWITTER_NATIVE|PRE_BURST|NOISE|UNCERTAIN","legitimacy_reasoning":"...","briefing":"...","should_converge":true,"need_more_sources":[],"why_converge_or_not":"..."}],"reasoning":"..."}`,
    { temperature: 0.4, max_tokens: 2000 }
  );

  const validated: Narrative[] = [];
  const converged_ids: string[] = [];
  const reloop_narrative_ids: string[] = [];
  const need_more_set = new Set<SourceType>();

  if (result.data) {
    const valMap = new Map(result.data.validated.map(v => [v.narrative_id, v]));
    for (const n of narratives) {
      const v = valMap.get(n.id);
      if (!v) {
        validated.push(n);
        continue;
      }
      const force_converge = iteration >= max_iterations;
      const should_converge = force_converge || v.should_converge;
      const updated: Narrative = {
        ...n,
        legitimacy: v.legitimacy,
        briefing: v.briefing,
        legitimacy_explanation: v.legitimacy_reasoning,
        briefing_pending: false,
      };
      validated.push(updated);
      store.upsert(updated);
      if (should_converge) {
        converged_ids.push(updated.id);
      } else {
        reloop_narrative_ids.push(updated.id);
        (v.need_more_sources ?? []).forEach(s => need_more_set.add(s));
      }
      store.logActivity({
        id: crypto.randomUUID(),
        agent: 'validator',
        status: should_converge ? 'success' : 'waiting',
        started_at: start, finished_at: Date.now(), duration_ms: Date.now() - start,
        input_summary: `"${n.title.slice(0, 40)}"`,
        output_summary: should_converge ? `CONVERGE como ${v.legitimacy}` : `NO CONVERGE`,
        explanation: v.why_converge_or_not.slice(0, 250),
        loop_id, iteration,
        metrics: { legitimacy: v.legitimacy, converged: should_converge ? 1 : 0 },
      });
    }
  } else {
    // Fallback: converge all with UNCERTAIN legitimacy
    for (const n of narratives) {
      const updated: Narrative = {
        ...n,
        legitimacy: 'UNCERTAIN',
        briefing: `Narrativa sobre "${n.title}" con ${n.mention_count} menciones detectadas en ${n.sources.join(', ')}. El validador no pudo generar un briefing detallado (LLM no disponible).`,
        legitimacy_explanation: 'Fallback: LLM no disponible, marcado como UNCERTAIN.',
        briefing_pending: false,
      };
      validated.push(updated);
      store.upsert(updated);
      converged_ids.push(updated.id);
    }
  }

  const need_more = Array.from(need_more_set);
  const request_reloop = reloop_narrative_ids.length > 0 && iteration < max_iterations;

  return {
    agent: 'validator',
    status: 'success',
    output: {
      narratives: validated,
      converged_ids,
      reloop_narrative_ids,
      need_more_sources: need_more,
      reasoning: result.data?.reasoning ?? 'Fallback aplicado',
    },
    summary: `Validator: ${converged_ids.length} convergen, ${reloop_narrative_ids.length} re-loop ${result.data ? '' : '(fallback)'}`,
    metrics: { converged: converged_ids.length, reloop: reloop_narrative_ids.length, fallback: result.data ? 0 : 1 },
    duration_ms: Date.now() - start,
    request_reloop,
    reloop_reason: request_reloop ? `Fuentes faltantes: ${need_more.join(', ')}` : undefined,
  };
}
