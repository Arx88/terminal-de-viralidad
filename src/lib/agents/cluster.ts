// ─────────────────────────────────────────────────────────────────────────
// Agent 2: CLUSTER (LLM-driven)
// Role: el LLM lee todas las menciones y decide cómo agruparlas en narrativas.
// Genera títulos significativos en español y resúmenes legibles.
// ─────────────────────────────────────────────────────────────────────────

import { llmJson, llmJsonSafe } from '../llm';
import type { AgentResult, NormalizedMention, Narrative, SourceType } from '../types';
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
  reasoning: string;
  new_count: number;
  updated_count: number;
}

interface ClusterLLMResponse {
  narratives: Array<{
    title: string;             // título significativo en español
    summary: string;           // resumen legible de qué trata
    keywords: string[];
    mention_indices: number[]; // índices en el array de menciones
    is_new: boolean;
    existing_narrative_id?: string;
  }>;
  reasoning: string;
}

const SYSTEM_PROMPT = `Sos CLUSTER, un analista semántico de un sistema de inteligencia.
Tu trabajo: leer menciones de múltiples fuentes y agruparlas en NARRATIVAS coherentes.

Una narrativa = un tema/evento/ángulo específico que conecta varias menciones. No agrupes solo por keyword exacta — agrupá por SIGNIFICADO. Mencionás A y mención B pueden ser de la misma narrativa aunque usen palabras distintas.

Cada narrativa debe tener:
- Un TÍTULO significativo en español (no MAYÚS-CON-GUIONES, sino algo legible como "Crisis regulatoria en cripto" o "Avance de modelos de agentes autónomos").
- Un RESUMEN de 1-2 oraciones explicando de qué trata.
- Keywords relevantes (3-6).
- Los índices de las menciones que pertenecen a ella.

Si una mención no encaja en ninguna narrativa existente, creá una nueva.
Pensá en español rioplatense. Sos analítico y conceptual.`;

export async function clusterAgent(input: ClusterInput): Promise<AgentResult<ClusterOutput>> {
  const start = Date.now();
  const { loop_id, iteration, mentions, existing_narratives, query } = input;

  if (mentions.length === 0) {
    return {
      agent: 'cluster',
      status: 'success',
      output: { narratives: existing_narratives, reasoning: 'Sin menciones nuevas para clusterizar', new_count: 0, updated_count: 0 },
      summary: 'Cluster: sin menciones nuevas',
      metrics: { new: 0, updated: 0 },
      duration_ms: Date.now() - start,
      request_reloop: false,
    };
  }

  // Build context: existing narratives + new mentions (COMPACT to avoid LLM timeout)
  const existingContext = existing_narratives.slice(0, 5).map((n) => ({
    id: n.id,
    title: n.title,
    keywords: n.keywords.slice(0, 4),
  }));

  const mentionsContext = mentions.slice(0, 12).map((m, i) => ({
    i,
    s: m.source,
    a: m.author.handle ?? 'unknown',
    t: ((m.title ?? '') + ' ' + m.body).slice(0, 100),
  }));

  const resp = await llmJsonSafe<ClusterLLMResponse>(
    SYSTEM_PROMPT,
    `Tema: "${query}" | Iter: ${iteration}

NARRATIVAS EXISTENTES:
${JSON.stringify(existingContext)}

NUEVAS MENCIONES (usa índice "i"):
${JSON.stringify(mentionsContext)}

Agrupá las menciones en narrativas. JSON:
{"narratives":[{"title":"título en español","summary":"1-2 oraciones","keywords":["k1"],"mention_indices":[0,2],"is_new":true,"existing_narrative_id":null}],"reasoning":"por qué"}`,
    { temperature: 0.4, max_tokens: 1500 }
  );

  // Build narratives from response (or fallback)
  const updated = new Map<string, Narrative>();
  for (const n of existing_narratives) updated.set(n.id, { ...n });

  let new_count = 0;
  let updated_count = 0;

  if (resp.data && resp.data.narratives) {
    for (const cn of resp.data.narratives) {
      const narrativeMentions = cn.mention_indices
        .filter(i => i >= 0 && i < mentions.length)
        .map(i => mentions[i]);
      if (narrativeMentions.length === 0) continue;
      if (!cn.is_new && cn.existing_narrative_id && updated.has(cn.existing_narrative_id)) {
        const n = updated.get(cn.existing_narrative_id)!;
        n.mention_count += narrativeMentions.length;
        n.last_seen = Math.max(n.last_seen, ...narrativeMentions.map(m => m.fetched_at));
        n.sample_mentions = [...narrativeMentions, ...n.sample_mentions].slice(0, 10);
        for (const m of narrativeMentions) {
          if (!n.sources.includes(m.source)) { n.sources = [...n.sources, m.source]; n.source_count = n.sources.length; }
        }
        n.summary = cn.summary;
        updated_count++;
      } else {
        const id = crypto.randomUUID();
        const sources: SourceType[] = Array.from(new Set(narrativeMentions.map(m => m.source)));
        const new_narrative: Narrative = {
          id, title: cn.title, summary: cn.summary,
          status: 'forming', legitimacy: 'UNCERTAIN',
          origin_source: narrativeMentions[0].source, origin_quality: 0.5,
          first_seen: Math.min(...narrativeMentions.map(m => m.fetched_at)),
          last_seen: Math.max(...narrativeMentions.map(m => m.fetched_at)),
          mention_count: narrativeMentions.length,
          author_count: new Set(narrativeMentions.map(m => m.author.handle).filter(Boolean)).size,
          source_count: sources.length, sources, keywords: cn.keywords,
          velocity_1h: 0, velocity_6h: 0, velocity_24h: 0,
          acceleration: 0, entropy: 0, trash_penalty: 1.0,
          velocity_score: 0, maturity_score: 0, current_score: 0, decay_factor: 1.0,
          burst_onset: null, predicted_peak: null, phase_confidence: 0.5,
          history: [0], sample_mentions: narrativeMentions.slice(0, 10),
          last_delta_pct: 0, loop_iterations: 1,
          briefing: '', legitimacy_explanation: '', briefing_pending: true,
        };
        updated.set(id, new_narrative);
        new_count++;
      }
    }
  } else {
    // FALLBACK: group all mentions into one narrative per source
    const bySource = new Map<SourceType, NormalizedMention[]>();
    for (const m of mentions) {
      if (!bySource.has(m.source)) bySource.set(m.source, []);
      bySource.get(m.source)!.push(m);
    }
    for (const [source, group] of bySource) {
      if (group.length === 0) continue;
      const id = crypto.randomUUID();
      const keywords = extractKeywordsFallback(group);
      const new_narrative: Narrative = {
        id,
        title: `${query[0].toUpperCase()}${query.slice(1)} — discusión en ${source}`,
        summary: `Narrativa sobre ${query} detectada en ${source} con ${group.length} menciones.`,
        status: 'forming', legitimacy: 'UNCERTAIN',
        origin_source: source, origin_quality: 0.5,
        first_seen: Math.min(...group.map(m => m.fetched_at)),
        last_seen: Math.max(...group.map(m => m.fetched_at)),
        mention_count: group.length,
        author_count: new Set(group.map(m => m.author.handle).filter(Boolean)).size,
        source_count: 1, sources: [source], keywords,
        velocity_1h: 0, velocity_6h: 0, velocity_24h: 0,
        acceleration: 0, entropy: 0, trash_penalty: 1.0,
        velocity_score: 0, maturity_score: 0, current_score: 0, decay_factor: 1.0,
        burst_onset: null, predicted_peak: null, phase_confidence: 0.5,
        history: [0], sample_mentions: group.slice(0, 10),
        last_delta_pct: 0, loop_iterations: 1,
        briefing: '', legitimacy_explanation: '', briefing_pending: true,
      };
      updated.set(id, new_narrative);
      new_count++;
    }
  }

  await store.logActivity({
    id: crypto.randomUUID(),
    agent: 'cluster',
    status: 'success',
    started_at: start,
    finished_at: Date.now(),
    duration_ms: Date.now() - start,
    input_summary: `${mentions.length} menciones, ${existing_narratives.length} narrativas existentes`,
    output_summary: `${new_count} nuevas, ${updated_count} actualizadas ${resp.data ? '' : '(fallback)'}`,
    explanation: (resp.data?.reasoning ?? 'Fallback: agrupación por fuente').slice(0, 250),
    loop_id, iteration,
    metrics: { new: new_count, updated: updated_count, fallback: resp.data ? 0 : 1 },
  });

  return {
    agent: 'cluster',
    status: 'success',
    output: {
      narratives: Array.from(updated.values()),
      reasoning: resp.data?.reasoning ?? 'Fallback aplicado',
      new_count, updated_count,
    },
    summary: `Cluster: ${new_count} nuevas + ${updated_count} actualizadas ${resp.data ? '' : '(fallback)'}`,
    metrics: { new: new_count, updated: updated_count, fallback: resp.data ? 0 : 1 },
    duration_ms: Date.now() - start,
    request_reloop: false,
  };
}

function extractKeywordsFallback(mentions: NormalizedMention[]): string[] {
  const freq = new Map<string, number>();
  for (const m of mentions) {
    const text = `${m.title ?? ''} ${m.body}`;
    const tokens = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
}
