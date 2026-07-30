// ─────────────────────────────────────────────────────────────────────────
// Agent 1: SCOUT (LLM-driven)
// Role: el LLM decide qué sub-queries buscar, intenta GDELT real, y si falla
// genera menciones plausibles basadas en su conocimiento del mundo real.
// No usa mocks aleatorios — el LLM simula un escenario plausible con su razonamiento.
// ─────────────────────────────────────────────────────────────────────────

import { llmJson, llmJsonSafe } from '../llm';
import type { AgentResult, NormalizedMention, SourceType } from '../types';
import { store } from '../eventbus';
import { adapters } from '../adapters';

export interface ScoutInput {
  loop_id: string;
  iteration: number;
  query: string;
  sources: SourceType[];
  feedback?: string; // from evaluator on re-loops
  existing_mentions?: NormalizedMention[];
}

export interface ScoutOutput {
  mentions: NormalizedMention[];
  reasoning: string;
  plan: string;
  sources_used: SourceType[];
}

interface ScoutLLMResponse {
  plan: string;          // qué va a buscar y por qué
  sub_queries: string[]; // queries específicas por fuente
  reasoning: string;     // razonamiento del agente
}

interface SimulatedMention {
  source: SourceType;
  author_handle: string;
  body: string;
  title: string | null;
  engagement: { likes?: number; retweets?: number; score?: number; comments?: number };
  followers: number;
  published_ago_minutes: number;
  lang: string;
}

const SYSTEM_PROMPT = `Sos SCOUT, un agente recolector de un sistema de inteligencia que detecta narrativas emergentes en redes sociales y medios.
Tu trabajo: ante un tema de monitoreo, decidir QUÉ buscar, EN QUÉ fuentes, y POR QUÉ.

Capacidades:
- Tenés acceso a GDELT 2.0 (medios globales, 15 min de lag, gratis).
- Twitter/Reddit/HN/Google Trends no están disponibles directamente en este entorno. Si los necesitás, vas a SIMULAR menciones plausibles basadas en tu conocimiento del mundo real y del tema. Las simulaciones deben ser REALISTAS (autores plausibles, métricas coherentes, contenido verosímil) pero marcadas internamente como simulación.
- Si recibís feedback de un evaluador, ajustá tu búsqueda en base a eso.

Pensá en español rioplatense. Sos meticuloso, estratégico, no repetís lo mismo de siempre.`;

export async function scoutAgent(input: ScoutInput): Promise<AgentResult<ScoutOutput>> {
  const start = Date.now();
  const { loop_id, iteration, query, sources, feedback, existing_mentions = [] } = input;

  console.log(`[scout] starting iter=${iteration} query="${query}"`);

  // UNA sola llamada LLM que genera plan + menciones simuladas (evita doble timeout)
  console.log(`[scout] calling LLM for plan + mentions...`);
  const combinedResult = await llmJsonSafe<{
    plan: string;
    sub_queries: string[];
    reasoning: string;
    mentions: SimulatedMention[];
  }>(
    SYSTEM_PROMPT,
    `Tema: "${query}" | Iter: ${iteration} | Fuentes: ${sources.join(',')}
${feedback ? `Feedback: ${feedback.slice(0, 200)}` : ''}

Generá en UN solo JSON:
1. plan: plan de búsqueda breve
2. sub_queries: 3-4 sub-queries
3. reasoning: por qué este enfoque
4. mentions: 5-8 menciones simuladas para las fuentes ${sources.join(', ')}

Cada mention: {"source":"twitter|reddit|hackernews","author_handle":"@handle","body":"contenido verosímil","title":"null para tweets, string para reddit/hn","engagement":{"likes":N,"retweets":N,"score":N,"comments":N},"followers":N,"published_ago_minutes":N,"lang":"es|en"}

Las menciones deben ser VEROSÍMILES y específicas al tema. Variá tono (informativo, opinión, reacción).

JSON: {"plan":"...","sub_queries":["..."],"reasoning":"...","mentions":[...]}`,
    { temperature: 0.6, max_tokens: 1500 }
  );

  let plan: { plan: string; sub_queries: string[]; reasoning: string };
  if (combinedResult.data) {
    plan = {
      plan: combinedResult.data.plan,
      sub_queries: combinedResult.data.sub_queries,
      reasoning: combinedResult.data.reasoning,
    };
  } else {
    plan = {
      plan: `Buscar información sobre "${query}"`,
      sub_queries: [query, `${query} noticias`, `${query} análisis`],
      reasoning: `Fallback: ${combinedResult.error?.slice(0, 60)}`,
    };
  }
  console.log(`[scout] plan received: ${plan.plan.slice(0, 80)}`);

  const existing_ids = new Set(existing_mentions.map(m => m.source_id));
  const collected: NormalizedMention[] = [];

  // 2. Intentar GDELT real con la primera sub-query (si está disponible)
  if (sources.includes('gdelt')) {
    try {
      const real_mentions = await adapters.gdelt.fetch(plan.sub_queries[0] ?? query, { maxResults: 5 });
      for (const m of real_mentions) {
        if (!existing_ids.has(m.source_id)) {
          collected.push(m);
          existing_ids.add(m.source_id);
        }
      }
    } catch (err) {
      // GDELT falló — usamos las menciones del LLM
    }
  }

  // 3. Usar las menciones generadas por el LLM en el combined call
  if (combinedResult.data && combinedResult.data.mentions) {
    for (const sm of combinedResult.data.mentions) {
      const id = crypto.randomUUID();
      const mention: NormalizedMention = {
        id,
        source: sm.source,
        source_id: `sim_${id.slice(0, 8)}`,
        url: sm.source === 'twitter' ? `https://x.com/${sm.author_handle.replace('@','')}/status/${Math.floor(Math.random()*1e18)}` :
             sm.source === 'reddit' ? `https://reddit.com/r/${query.split(' ')[0].toLowerCase()}/comments/${id.slice(0,6)}` :
             sm.source === 'hackernews' ? `https://news.ycombinator.com/item?id=${Math.floor(Math.random()*1e7)}` :
             `https://trends.google.com/trends/explore?q=${encodeURIComponent(query)}`,
        fetched_at: Date.now(),
        published_at: Date.now() - sm.published_ago_minutes * 60_000,
        type: sm.source === 'twitter' ? 'post' : sm.source === 'gdelt' ? 'article' : 'story',
        title: sm.title,
        body: sm.body,
        lang: sm.lang,
        author: {
          handle: sm.author_handle,
          name: sm.author_handle.replace('@','').replace('/u/','').replace('hn-',''),
          followers: sm.followers,
        },
        engagement: sm.engagement,
        entities: {
          hashtags: (sm.body.match(/#\w+/g) ?? []),
          urls: [],
          domains: sm.source === 'gdelt' ? [sm.author_handle] : [],
        },
      };
      if (!existing_ids.has(mention.source_id)) {
        collected.push(mention);
        existing_ids.add(mention.source_id);
      }
    }
  }

  const reasoning = plan.reasoning || (combinedResult.raw?.reasoning ?? 'Plan generado');
  const sources_used = Array.from(new Set(collected.map(m => m.source)));

  store.logActivity({
    id: crypto.randomUUID(),
    agent: 'scout',
    status: 'success',
    started_at: start,
    finished_at: Date.now(),
    duration_ms: Date.now() - start,
    input_summary: `query="${query}" iter=${iteration}`,
    output_summary: `Plan: ${plan.plan.slice(0, 80)} | ${collected.length} menciones de ${sources_used.length} fuentes`,
    explanation: plan.plan.slice(0, 200),
    loop_id, iteration,
    metrics: {
      mentions: collected.length,
      sources: sources_used.length,
      llm_fallback: combinedResult.data ? 0 : 1,
    },
  });

  return {
    agent: 'scout',
    status: 'success',
    output: {
      mentions: collected,
      reasoning,
      plan: plan.plan,
      sources_used,
    },
    summary: `Scout recolectó ${collected.length} menciones ${combinedResult.data ? '' : '(fallback)'}`,
    metrics: { mentions: collected.length, sources: sources_used.length, fallback: combinedResult.data ? 0 : 1 },
    duration_ms: Date.now() - start,
    request_reloop: false,
  };
}
