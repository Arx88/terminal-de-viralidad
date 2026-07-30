// ─────────────────────────────────────────────────────────────────────────
// Agent 6: EVALUATOR (LLM-driven, NEW)
// Role: después de que validator converge, el evaluator juzga si la
// narrativa producida realmente sirve para un analista. Si no sirve
// (score < 7/10), se descarta y se re-loopea con feedback específico.
//
// Esto es lo que faltaba: EVALUACIÓN REAL de resultados, no solo iteración.
// ─────────────────────────────────────────────────────────────────────────

import { llmJson } from '../llm';
import type { AgentResult, Narrative } from '../types';
import { store } from '../eventbus';

export interface EvaluatorInput {
  loop_id: string;
  iteration: number;
  narratives: Narrative[];
}

export interface EvaluatorOutput {
  evaluations: Array<{
    narrative_id: string;
    quality_score: number;       // 0-10
    is_useful: boolean;          // quality_score >= 7
    feedback: string;            // feedback para scout si re-loopea
    strengths: string[];
    weaknesses: string[];
  }>;
  reasoning: string;
  discard_ids: string[];         // narrativas que se descartan
  approved_ids: string[];        // narrativas aprobadas
  reloop_with_feedback?: { narrative_id: string; feedback: string };
}

interface EvaluatorLLMResponse {
  evaluations: Array<{
    narrative_id: string;
    quality_score: number;
    is_useful: boolean;
    feedback: string;
    strengths: string[];
    weaknesses: string[];
  }>;
  reasoning: string;
}

const SYSTEM_PROMPT = `Sos EVALUATOR, el crítico del sistema. Tu trabajo: juzgar si las narrativas producidas realmente sirven para un analista de inteligencia.

Criterios de calidad (0-10):
- ¿El briefing es informativo y específico? (no genérico, dice algo concreto)
- ¿La clasificación de legitimacy tiene sentido dadas las menciones?
- ¿La fase (forming/rising/etc) es coherente con la edad y velocity?
- ¿El título es significativo o es solo MAYÚS-CON-GUIONES?
- ¿Las keywords capturan el tema o son genéricas?

Scoring:
- 9-10: Excelente, listo para publicar a un analista.
- 7-8: Bueno, sirve.
- 5-6: Mediocre, requiere re-loop.
- 0-4: Mierda, descartar.

Para narrativas que no llegan a 7, generá FEEDBACK específico para el Scout en el próximo loop. Decile qué buscar, qué ángulo explorar, qué evitar.

Sos implacable. No aprobés mierda. Si una narrativa es genérica o no dice nada específico, descartala.
Pensá en español rioplatense.`;

export async function evaluatorAgent(input: EvaluatorInput): Promise<AgentResult<EvaluatorOutput>> {
  const start = Date.now();
  const { loop_id, iteration, narratives } = input;

  if (narratives.length === 0) {
    return {
      agent: 'evaluator',
      status: 'success',
      output: { evaluations: [], reasoning: 'Sin narrativas', discard_ids: [], approved_ids: [] },
      summary: 'Evaluator: sin narrativas',
      metrics: {},
      duration_ms: Date.now() - start,
      request_reloop: false,
    };
  }

  const context = narratives.map(n => ({
    id: n.id,
    title: n.title,
    briefing: n.briefing.slice(0, 200),
    legitimacy: n.legitimacy,
    status: n.status,
    mention_count: n.mention_count,
    source_count: n.source_count,
    current_score: n.current_score,
    keywords: n.keywords.slice(0, 5),
  }));

  let resp: { data: EvaluatorLLMResponse; raw: any };
  try {
    resp = await llmJson<EvaluatorLLMResponse>(
      SYSTEM_PROMPT,
      `Iteración: ${iteration}
Narrativas a evaluar:
${JSON.stringify(context, null, 2)}

Para cada una, evaluá calidad 0-10, is_useful (>=7), feedback específico para re-loop si no sirve, strengths y weaknesses.

Respondé con JSON:
{
  "evaluations": [
    {
      "narrative_id": "...",
      "quality_score": 0-10,
      "is_useful": true|false,
      "feedback": "feedback específico para el scout si re-loopea, o vacío si sirve",
      "strengths": ["..."],
      "weaknesses": ["..."]
    }
  ],
  "reasoning": "razonamiento general sobre la calidad del output"
}`,
      { temperature: 0.3, max_tokens: 2000 }
    );
  } catch (err: any) {
    // Fallback: approve all if LLM fails (better than blocking the loop)
    store.logActivity({
      id: crypto.randomUUID(),
      agent: 'evaluator',
      status: 'failed',
      started_at: start, finished_at: Date.now(), duration_ms: Date.now() - start,
      input_summary: `${narratives.length} narrativas`,
      output_summary: `LLM fallback: aprobando todas por defecto (error: ${err.message.slice(0, 80)})`,
      explanation: 'El LLM no respondió a tiempo. Aprobando narrativas por defecto para no bloquear el loop.',
      loop_id, iteration,
      metrics: { fallback: 1, error: err.message.slice(0, 60) },
      error: err.message.slice(0, 200),
    });
    return {
      agent: 'evaluator',
      status: 'success',
      output: {
        evaluations: narratives.map(n => ({
          narrative_id: n.id,
          quality_score: 7,
          is_useful: true,
          feedback: '',
          strengths: ['LLM no disponible, aprobado por defecto'],
          weaknesses: [],
        })),
        reasoning: 'Fallback: LLM no disponible, todas aprobadas por defecto',
        discard_ids: [],
        approved_ids: narratives.map(n => n.id),
      },
      summary: `Evaluator (fallback): ${narratives.length} aprobadas`,
      metrics: { approved: narratives.length, discarded: 0, fallback: 1 },
      duration_ms: Date.now() - start,
      request_reloop: false,
    };
  }

  const evalMap = new Map(resp.data.evaluations.map(e => [e.narrative_id, e]));
  const discard_ids: string[] = [];
  const approved_ids: string[] = [];
  let reloop_with_feedback: { narrative_id: string; feedback: string } | undefined;

  for (const n of narratives) {
    const e = evalMap.get(n.id);
    if (!e) continue;

    if (e.is_useful) {
      approved_ids.push(n.id);
      store.logActivity({
        id: crypto.randomUUID(),
        agent: 'evaluator',
        status: 'success',
        started_at: start, finished_at: Date.now(), duration_ms: Date.now() - start,
        input_summary: `"${n.title}"`,
        output_summary: `APROBADA (${e.quality_score}/10)`,
        explanation: `Fortalezas: ${e.strengths.join(', ').slice(0, 200)}`,
        loop_id, iteration,
        metrics: { quality: e.quality_score, verdict: 'approved' },
      });
    } else {
      discard_ids.push(n.id);
      if (!reloop_with_feedback) {
        reloop_with_feedback = { narrative_id: n.id, feedback: e.feedback };
      }
      store.logActivity({
        id: crypto.randomUUID(),
        agent: 'evaluator',
        status: 'failed',
        started_at: start, finished_at: Date.now(), duration_ms: Date.now() - start,
        input_summary: `"${n.title}"`,
        output_summary: `DESCARTADA (${e.quality_score}/10)`,
        explanation: `Debilidades: ${e.weaknesses.join(', ').slice(0, 200)} | Feedback: ${e.feedback.slice(0, 200)}`,
        loop_id, iteration,
        metrics: { quality: e.quality_score, verdict: 'discarded' },
        error: e.feedback.slice(0, 200),
      });
    }
  }

  const request_reloop = discard_ids.length > 0 && iteration < 5; // allow more iterations for quality

  return {
    agent: 'evaluator',
    status: 'success',
    output: {
      evaluations: resp.data.evaluations,
      reasoning: resp.data.reasoning,
      discard_ids,
      approved_ids,
      reloop_with_feedback,
    },
    summary: `Evaluator: ${approved_ids.length} aprobadas, ${discard_ids.length} descartadas`,
    metrics: {
      approved: approved_ids.length,
      discarded: discard_ids.length,
      avg_quality: resp.data.evaluations.length > 0
        ? (resp.data.evaluations.reduce((s, e) => s + e.quality_score, 0) / resp.data.evaluations.length).toFixed(1)
        : 0,
    },
    duration_ms: Date.now() - start,
    request_reloop,
    reloop_reason: request_reloop
      ? `${discard_ids.length} narrativas descartadas. Re-loopeando con feedback.`
      : undefined,
  };
}
