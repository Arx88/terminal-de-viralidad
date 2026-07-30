// ─────────────────────────────────────────────────────────────────────────
// LLM integration — uses z-ai-web-dev-sdk to generate human-readable content
//
// All functions are async and have graceful fallbacks (rule-based text)
// in case the LLM is unavailable or slow.
// ─────────────────────────────────────────────────────────────────────────

import ZAI from 'z-ai-web-dev-sdk';
import type { Narrative, AgentActivity, Legitimacy, Phase } from './types';

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZai() {
  if (!zaiInstance) {
    try {
      zaiInstance = await ZAI.create();
    } catch (err) {
      console.error('[LLM] failed to initialize ZAI:', err);
      return null;
    }
  }
  return zaiInstance;
}

async function complete(systemPrompt: string, userMessage: string, maxRetries = 2): Promise<string | null> {
  const zai = await getZai();
  if (!zai) return null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        thinking: { type: 'disabled' },
      });
      const content = completion.choices[0]?.message?.content;
      if (content && content.trim().length > 0) return content.trim();
    } catch (err: any) {
      console.error(`[LLM] attempt ${attempt} failed:`, err.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 800 * attempt));
      }
    }
  }
  return null;
}

// ─── Narrative briefing ──────────────────────────────────────────────────
// Generates a 2-3 sentence readable summary of what the narrative is about.

export async function generateNarrativeBriefing(n: Narrative): Promise<string> {
  const mentionSamples = n.sample_mentions.slice(0, 5).map((m, i) =>
    `[${i + 1}] (${m.source}) ${m.author.handle ?? 'unknown'}: ${m.title ?? m.body}`
  ).join('\n');

  const systemPrompt = `Sos un analista de inteligencia que escribe briefings concisos en español rioplatense.
Tu trabajo: en 2-3 oraciones, explicar QUÉ está pasando en esta narrativa, QUIÉNES están hablando de eso, y POR QUÉ podría importar.
No uses markdown. No uses emojis. Estilo directo, informativo, como un cable de agencia de noticias.`;

  const userMessage = `Narrativa: "${n.title}"
Fase: ${n.status}
Legitimidad: ${n.legitimacy}
Fuentes que la confirmaron: ${n.sources.join(', ')}
Menciones: ${n.mention_count}
Velocidad actual: ${n.velocity_1h.toFixed(1)} menciones/hora
Score: ${n.current_score.toFixed(0)}/100
Keywords: ${n.keywords.slice(0, 6).join(', ')}

Muestras de menciones:
${mentionSamples}

Escribí el briefing:`;

  const result = await complete(systemPrompt, userMessage);
  if (result) return result;

  // Fallback rule-based
  return fallbackBriefing(n);
}

function fallbackBriefing(n: Narrative): string {
  const sourceList = n.sources.join(', ');
  const phaseDesc: Record<Phase, string> = {
    forming: 'está empezando a aparecer',
    rising: 'está ganando tracción rápidamente',
    formed: 'ya está consolidada',
    decaying: 'está perdiendo fuerza',
  };
  const legitDesc: Record<Legitimacy, string> = {
    LEGIT: 'confirmada por múltiples fuentes confiables',
    BOT_CAMPAIGN: 'posible campaña de bots coordinada',
    TWITTER_NATIVE: 'nativa de Twitter, sin confirmación externa aún',
    PRE_BURST: 'detectada en medios externos antes de explotar en Twitter',
    NOISE: 'ruido sin relevancia significativa',
    UNCERTAIN: 'aún en evaluación',
  };
  return `Esta narrativa sobre "${n.title}" ${phaseDesc[n.status]} con ${n.mention_count} menciones detectadas en ${sourceList}. La legitimidad es ${legitDesc[n.legitimacy]}. Velocidad actual: ${n.velocity_1h.toFixed(1)} menciones por hora.`;
}

// ─── System briefing ─────────────────────────────────────────────────────
// Generates a 1-2 sentence overview of what the system is currently tracking.

export async function generateSystemBriefing(narratives: Narrative[]): Promise<string> {
  if (narratives.length === 0) {
    return 'Sistema en espera. No hay narrativas activas para monitorear.';
  }

  const top = narratives.slice(0, 5);
  const summary = top.map(n =>
    `- "${n.title}" [${n.status}, ${n.legitimacy}, score ${n.current_score.toFixed(0)}]`
  ).join('\n');

  const phaseCounts = {
    forming: narratives.filter(n => n.status === 'forming').length,
    rising: narratives.filter(n => n.status === 'rising').length,
    formed: narratives.filter(n => n.status === 'formed').length,
    decaying: narratives.filter(n => n.status === 'decaying').length,
  };

  const systemPrompt = `Sos un sistema de inteligencia que monitorea tendencias emergentes en redes sociales y medios.
Escribí en español rioplatense, en 1-2 oraciones máximo, un resumen ejecutivo de lo que el sistema está detectando ahora.
Estilo: directo, informativo, sin markdown, sin emojis. Como un header de dashboard de un analista.`;

  const userMessage = `Total de narrativas activas: ${narratives.length}
Distribución por fase: ${phaseCounts.forming} formándose, ${phaseCounts.rising} creciendo, ${phaseCounts.formed} formadas, ${phaseCounts.decaying} decayendo.

Top 5 narrativas:
${summary}

Escribí el resumen ejecutivo:`;

  const result = await complete(systemPrompt, userMessage);
  if (result) return result;

  // Fallback
  return `Monitoreando ${narratives.length} narrativas: ${phaseCounts.rising} creciendo, ${phaseCounts.forming} formándose, ${phaseCounts.formed} consolidadas, ${phaseCounts.decaying} decayendo.`;
}

// ─── Agent explanation ───────────────────────────────────────────────────
// Generates a 1-sentence plain-Spanish explanation of what an agent did.

const AGENT_NAMES_ES: Record<string, string> = {
  scout: 'Scout (recolector)',
  cluster: 'Cluster (agrupador)',
  score: 'Score (puntuador)',
  phase: 'Phase (clasificador de fase)',
  validator: 'Validator (validador)',
  orchestrator: 'Orchestrator (orquestador)',
};

export async function generateAgentExplanation(activity: AgentActivity): Promise<string> {
  // Only generate for meaningful events to save LLM calls
  if (activity.status === 'success' && !activity.output_summary.includes('Error')) {
    const systemPrompt = `Sos un asistente que explica en español rioplatense, en 1 oración corta (máx 20 palabras), qué hizo un agente de un sistema de monitoreo de tendencias.
Sin markdown, sin emojis, lenguaje natural y claro.`;

    const userMessage = `Agente: ${AGENT_NAMES_ES[activity.agent] ?? activity.agent}
Estado: ${activity.status}
Resumen técnico: ${activity.output_summary}
Métricas: ${JSON.stringify(activity.metrics ?? {})}

Explicá en una oración qué hizo:`;

    const result = await complete(systemPrompt, userMessage);
    if (result) return result;
  }

  // Fallback rule-based
  return fallbackAgentExplanation(activity);
}

function fallbackAgentExplanation(activity: AgentActivity): string {
  const agent = AGENT_NAMES_ES[activity.agent] ?? activity.agent;
  switch (activity.agent) {
    case 'scout':
      return `${agent} recolectó menciones de las fuentes configuradas.`;
    case 'cluster':
      return `${agent} agrupó las menciones en narrativas por similitud semántica.`;
    case 'score':
      return `${agent} calculó el score de viralidad (velocidad × madurez × penalty × decay).`;
    case 'phase':
      return `${agent} clasificó cada narrativa en una de las 4 fases (forming/rising/formed/decaying).`;
    case 'validator':
      return activity.status === 'waiting'
        ? `${agent} decidió que faltan más fuentes para confirmar la narrativa. Va a re-loopear.`
        : `${agent} validó la narrativa y le asignó legitimidad.`;
    case 'orchestrator':
      return `${agent} coordinó el loop completo de los 5 agentes.`;
    default:
      return `${agent} ejecutó su tarea.`;
  }
}

// ─── Legitimacy explanation ──────────────────────────────────────────────
// Generates a 1-sentence explanation of WHY a narrative got its legitimacy.

export async function generateLegitimacyExplanation(n: Narrative): Promise<string> {
  const systemPrompt = `Sos un analista de inteligencia. En español rioplatense, 1 oración, explicá POR QUÉ una narrativa recibió su clasificación de legitimidad. Sin markdown.`;

  const userMessage = `Narrativa: "${n.title}"
Legitimidad asignada: ${n.legitimacy}
Fuentes: ${n.sources.join(', ')} (${n.source_count} fuentes)
Penalty de trash: ${(n.trash_penalty * 100).toFixed(0)}% (más alto = más limpia)
Menciones duplicadas estimadas: ${((1 - n.trash_penalty) * 100).toFixed(0)}%

Por qué recibió "${n.legitimacy}":`;

  const result = await complete(systemPrompt, userMessage);
  if (result) return result;

  // Fallback
  const explanations: Record<Legitimacy, string> = {
    LEGIT: `Confirmada por ${n.source_count} fuentes distintas con baja señal de manipulación (${(n.trash_penalty * 100).toFixed(0)}% clean).`,
    BOT_CAMPAIGN: `Solo detectada en Twitter con alta señal de bots (${(n.trash_penalty * 100).toFixed(0)}% clean). Probable campaña coordinada.`,
    TWITTER_NATIVE: `Solo en Twitter pero sin señales claras de manipulación. Rumor o meme nativo de la plataforma.`,
    PRE_BURST: `Detectada en fuentes externas (GDELT/Reddit) pero aún sin pickup en Twitter. Potencial early signal.`,
    NOISE: `Pocas menciones o sin fuentes confiables. Ruido sin relevancia.`,
    UNCERTAIN: `Aún no hay suficiente información para clasificar la legitimidad.`,
  };
  return explanations[n.legitimacy];
}
