'use client';

import { useState } from 'react';
import type { Narrative } from '@/lib/types';
import { PHASE_CONFIG } from '@/lib/types';
import { PhaseBadge, LegitimacyBadge } from './Badges';
import { Sparkline } from './Sparkline';

interface DetailPanelProps {
  narrative: Narrative | null;
}

export function DetailPanel({ narrative }: DetailPanelProps) {
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);
  const currentNarrativeId = narrative?.id;
  const effectiveIdx = currentNarrativeId !== selectedMentionIdx && selectedMentionIdx >= (narrative?.sample_mentions.length ?? 0) ? 0 : selectedMentionIdx;

  if (!narrative) {
    return (
      <div className="h-full flex items-center justify-center font-sans" style={{ color: '#484F58', fontSize: 13 }}>
        <div className="text-center">
          <div className="font-mono" style={{ fontSize: 32, marginBottom: 12, color: '#2DD4BF' }}>◇</div>
          <div style={{ marginBottom: 6 }}>Seleccioná una narrativa del panel izquierdo</div>
          <div className="font-mono" style={{ fontSize: 10, color: '#30363D' }}>j/k navegar · enter abrir · / buscar</div>
        </div>
      </div>
    );
  }

  const cfg = PHASE_CONFIG[narrative.status];
  const sampleMention = narrative.sample_mentions[effectiveIdx];
  const ageHours = ((Date.now() - narrative.first_seen) / 3600_000).toFixed(1);

  return (
    <div className="h-full flex flex-col overflow-auto custom-scroll">
      {/* Header */}
      <div className="px-5 py-4 border-b" style={{ borderColor: '#21262D', background: cfg.glow }}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono" style={{ color: cfg.color, fontSize: 18 }}>{cfg.icon}</span>
              <h2 className="font-sans font-bold" style={{ color: '#E6EDF3', fontSize: 19, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                {narrative.title}
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <PhaseBadge phase={narrative.status} confidence={narrative.phase_confidence} />
              <LegitimacyBadge legitimacy={narrative.legitimacy} size="md" />
              <span className="font-mono" style={{ color: '#7D8590', fontSize: 10 }}>
                hace {ageHours}h · {narrative.mention_count} menciones · {narrative.source_count} fuentes
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* BRIEFING — the most important section */}
      <div className="px-5 py-4 border-b" style={{ borderColor: '#21262D', background: '#0D1117' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono" style={{ color: '#5EEAD4', fontSize: 11, fontWeight: 600, letterSpacing: '1.5px' }}>
            ▮ BRIEFING
          </span>
          {narrative.briefing_pending && (
            <span className="font-mono" style={{ color: '#FBBF24', fontSize: 9 }}>
              <span style={{ display: 'inline-block', width: 5, height: 5, background: '#FBBF24', borderRadius: '50%', marginRight: 4, animation: 'pulse-dot 1s ease-in-out infinite' }} />
              generando...
            </span>
          )}
        </div>
        {narrative.briefing ? (
          <p className="font-sans" style={{ color: '#E6EDF3', fontSize: 13, lineHeight: 1.55 }}>
            {narrative.briefing}
          </p>
        ) : (
          <p className="font-sans" style={{ color: '#484F58', fontSize: 12, fontStyle: 'italic' }}>
            El briefing se está generando con el LLM...
          </p>
        )}
      </div>

      {/* Legitimacy explanation */}
      {narrative.legitimacy_explanation && (
        <div className="px-5 py-3 border-b" style={{ borderColor: '#21262D' }}>
          <div className="font-mono mb-1.5" style={{ color: '#7D8590', fontSize: 10, letterSpacing: '1.5px' }}>
            ¿POR QUÉ ESTA LEGITIMIDAD?
          </div>
          <p className="font-sans" style={{ color: '#94A3B8', fontSize: 12, lineHeight: 1.5 }}>
            {narrative.legitimacy_explanation}
          </p>
        </div>
      )}

      {/* Stats row — labels en español */}
      <div className="grid grid-cols-5 border-b" style={{ borderColor: '#21262D' }}>
        {[
          { label: 'SCORE', value: narrative.current_score.toFixed(0), sub: '/100', color: '#2DD4BF' },
          { label: 'VELOCIDAD', value: (narrative.velocity_score * 100).toFixed(0), sub: '%', color: '#E6EDF3' },
          { label: 'MADUREZ', value: (narrative.maturity_score * 100).toFixed(0), sub: '%', color: '#E6EDF3' },
          { label: 'CALIDAD', value: (narrative.trash_penalty * 100).toFixed(0), sub: '%', color: '#E6EDF3' },
          { label: 'ITER', value: String(narrative.loop_iterations), sub: '', color: '#5EEAD4' },
        ].map(s => (
          <div key={s.label} className="px-3 py-3 border-r last:border-r-0" style={{ borderColor: '#21262D' }}>
            <div className="font-mono font-bold tabular-nums" style={{ color: s.color, fontSize: 18, lineHeight: 1 }}>
              {s.value}<span style={{ fontSize: 10, opacity: 0.6 }}>{s.sub}</span>
            </div>
            <div className="font-mono mt-1" style={{ color: '#7D8590', fontSize: 8, letterSpacing: '1px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="px-5 py-3 border-b" style={{ borderColor: '#21262D' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono" style={{ color: '#7D8590', fontSize: 10, letterSpacing: '1.5px' }}>VELOCIDAD HISTÓRICA</span>
          <span className="font-mono" style={{ color: '#94A3B8', fontSize: 10 }}>
            {narrative.burst_onset
              ? `▣ burst detectado ${new Date(narrative.burst_onset).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
              : '○ sin burst'}
          </span>
        </div>
        <Sparkline
          points={narrative.history.length > 1 ? narrative.history : [0, narrative.velocity_score * 100]}
          color={cfg.color}
          width={560}
          height={44}
        />
      </div>

      {/* Sources */}
      <div className="px-5 py-3 border-b" style={{ borderColor: '#21262D' }}>
        <div className="font-mono mb-2" style={{ color: '#7D8590', fontSize: 10, letterSpacing: '1.5px' }}>FUENTES QUE CONFIRMARON</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['twitter', 'gdelt', 'reddit', 'hackernews', 'googletrends'] as const).map(src => {
            const active = narrative.sources.includes(src);
            const labels: Record<string, string> = {
              twitter: 'Twitter/X',
              gdelt: 'GDELT',
              reddit: 'Reddit',
              hackernews: 'Hacker News',
              googletrends: 'Google Trends',
            };
            return (
              <span
                key={src}
                className="font-sans"
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  background: active ? '#2DD4BF20' : 'transparent',
                  color: active ? '#2DD4BF' : '#484F58',
                  border: `1px solid ${active ? '#2DD4BF50' : '#21262D'}`,
                  borderRadius: 3,
                  fontWeight: active ? 500 : 400,
                }}
              >
                {active ? '✓' : '○'} {labels[src]}
              </span>
            );
          })}
        </div>
      </div>

      {/* Keywords */}
      {narrative.keywords.length > 0 && (
        <div className="px-5 py-3 border-b" style={{ borderColor: '#21262D' }}>
          <div className="font-mono mb-2" style={{ color: '#7D8590', fontSize: 10, letterSpacing: '1.5px' }}>KEYWORDS</div>
          <div className="flex flex-wrap gap-1.5">
            {narrative.keywords.slice(0, 12).map(kw => (
              <span
                key={kw}
                className="font-mono"
                style={{
                  fontSize: 10,
                  padding: '2px 7px',
                  background: '#161B22',
                  color: '#94A3B8',
                  borderRadius: 2,
                  border: '1px solid #21262D',
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sample mentions */}
      {narrative.sample_mentions.length > 0 && (
        <div className="px-5 py-3">
          <div className="font-mono mb-2" style={{ color: '#7D8590', fontSize: 10, letterSpacing: '1.5px' }}>
            MENCIONES ({effectiveIdx + 1} / {narrative.sample_mentions.length})
          </div>
          {sampleMention && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono" style={{
                  fontSize: 9, padding: '2px 6px', background: '#2DD4BF20', color: '#2DD4BF',
                  borderRadius: 2, letterSpacing: '0.5px', fontWeight: 600,
                }}>
                  {sampleMention.source.toUpperCase()}
                </span>
                <span className="font-mono" style={{ color: '#E6EDF3', fontSize: 11 }}>
                  {sampleMention.author.handle ?? sampleMention.author.name ?? 'unknown'}
                </span>
                {sampleMention.author.followers && (
                  <span className="font-mono" style={{ color: '#7D8590', fontSize: 10 }}>
                    {sampleMention.author.followers.toLocaleString()} seguidores
                  </span>
                )}
                <span className="font-mono ml-auto" style={{ color: '#7D8590', fontSize: 10 }}>
                  {sampleMention.published_at
                    ? new Date(sampleMention.published_at).toLocaleString('es', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
                    : '—'}
                </span>
              </div>
              {sampleMention.title && (
                <div className="font-sans mb-2" style={{ color: '#E6EDF3', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                  {sampleMention.title}
                </div>
              )}
              <div className="font-sans" style={{ color: '#E6EDF3', fontSize: 12, lineHeight: 1.55 }}>
                {sampleMention.body}
              </div>
              {sampleMention.engagement && (sampleMention.engagement.likes || sampleMention.engagement.score) && (
                <div className="flex items-center gap-4 mt-3 font-mono" style={{ color: '#7D8590', fontSize: 10 }}>
                  {sampleMention.engagement.likes != null && <span>♥ {sampleMention.engagement.likes.toLocaleString()}</span>}
                  {sampleMention.engagement.retweets != null && <span>↻ {sampleMention.engagement.retweets.toLocaleString()}</span>}
                  {sampleMention.engagement.replies != null && <span>💬 {sampleMention.engagement.replies.toLocaleString()}</span>}
                  {sampleMention.engagement.score != null && <span>↑ {sampleMention.engagement.score.toLocaleString()}</span>}
                  {sampleMention.engagement.comments != null && <span>💬 {sampleMention.engagement.comments.toLocaleString()}</span>}
                </div>
              )}
              <a
                href={sampleMention.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 font-mono hover:underline"
                style={{ color: '#58A6FF', fontSize: 10, letterSpacing: '0.5px' }}
              >
                ↗ abrir original
              </a>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        .custom-scroll::-webkit-scrollbar { width: 8px; }
        .custom-scroll::-webkit-scrollbar-track { background: #0D1117; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #21262D; border-radius: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #30363D; }
      `}</style>
    </div>
  );
}
