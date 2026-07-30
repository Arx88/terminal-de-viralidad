'use client';

import { useState } from 'react';
import type { Narrative } from '@/lib/types';
import { PHASE_CONFIG, LEGITIMACY_CONFIG } from '@/lib/types';
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
      <div className="h-full flex items-center justify-center font-mono" style={{ color: '#484F58', fontSize: 12 }}>
        <div className="text-center">
          <div style={{ fontSize: 28, marginBottom: 8 }}>◇</div>
          <div>select a narrative from the left panel</div>
          <div style={{ marginTop: 4, fontSize: 10 }}>j/k navigate · enter open</div>
        </div>
      </div>
    );
  }

  const cfg = PHASE_CONFIG[narrative.status];
  const sampleMention = narrative.sample_mentions[effectiveIdx];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b" style={{ borderColor: '#21262D' }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="font-mono" style={{ color: cfg.color, fontSize: 14 }}>{cfg.icon}</span>
            <h2 className="font-mono font-bold truncate" style={{ color: '#E6EDF3', fontSize: 16, letterSpacing: '-0.01em' }}>
              {narrative.title}
            </h2>
          </div>
          <PhaseBadge phase={narrative.status} confidence={narrative.phase_confidence} />
        </div>
        <p className="font-sans" style={{ color: '#94A3B8', fontSize: 11, lineHeight: 1.4 }}>
          {narrative.summary}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-6 border-b" style={{ borderColor: '#21262D' }}>
        {[
          { label: 'SCORE', value: narrative.current_score.toFixed(0), color: '#2DD4BF' },
          { label: 'VEL', value: narrative.velocity_1h.toFixed(1) + '/h', color: '#E6EDF3' },
          { label: 'MAT', value: (narrative.maturity_score * 100).toFixed(0) + '%', color: '#E6EDF3' },
          { label: 'PEN', value: (narrative.trash_penalty * 100).toFixed(0) + '%', color: '#E6EDF3' },
          { label: 'SRCS', value: String(narrative.source_count), color: '#E6EDF3' },
          { label: 'ITER', value: String(narrative.loop_iterations), color: '#5EEAD4' },
        ].map(s => (
          <div key={s.label} className="px-3 py-2 border-r last:border-r-0" style={{ borderColor: '#21262D' }}>
            <div className="font-mono font-bold tabular-nums" style={{ color: s.color, fontSize: 14 }}>{s.value}</div>
            <div className="font-mono" style={{ color: '#7D8590', fontSize: 8, letterSpacing: '1px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="px-4 py-3 border-b" style={{ borderColor: '#21262D' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono" style={{ color: '#7D8590', fontSize: 10, letterSpacing: '1px' }}>VELOCITY · 24H</span>
          <span className="font-mono" style={{ color: '#94A3B8', fontSize: 10 }}>
            burst: {narrative.burst_onset ? new Date(narrative.burst_onset).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '—'}
          </span>
        </div>
        <Sparkline
          points={narrative.history.length > 1 ? narrative.history : [0, narrative.velocity_1h]}
          color={cfg.color}
          width={520}
          height={48}
        />
      </div>

      {/* Legitimacy + sources */}
      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: '#21262D' }}>
        <span className="font-mono" style={{ color: '#7D8590', fontSize: 10, letterSpacing: '1px' }}>LEGITIMACY</span>
        <LegitimacyBadge legitimacy={narrative.legitimacy} size="md" />
        <div className="flex items-center gap-1.5 ml-2">
          {(['twitter', 'gdelt', 'reddit', 'hackernews', 'googletrends'] as const).map(src => {
            const active = narrative.sources.includes(src);
            return (
              <span
                key={src}
                className="font-mono"
                style={{
                  fontSize: 9,
                  padding: '2px 5px',
                  borderRadius: 2,
                  background: active ? '#2DD4BF20' : 'transparent',
                  color: active ? '#2DD4BF' : '#484F58',
                  border: `1px solid ${active ? '#2DD4BF50' : '#21262D'}`,
                  letterSpacing: '0.5px',
                }}
              >
                {src.slice(0, 4).toUpperCase()}
              </span>
            );
          })}
        </div>
      </div>

      {/* Keywords */}
      <div className="px-4 py-2 border-b" style={{ borderColor: '#21262D' }}>
        <div className="font-mono mb-1.5" style={{ color: '#7D8590', fontSize: 10, letterSpacing: '1px' }}>KEYWORDS</div>
        <div className="flex flex-wrap gap-1.5">
          {narrative.keywords.slice(0, 10).map(kw => (
            <span
              key={kw}
              className="font-mono"
              style={{
                fontSize: 10,
                padding: '2px 6px',
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

      {/* Sample mentions */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b flex items-center justify-between" style={{ borderColor: '#21262D' }}>
          <span className="font-mono" style={{ color: '#7D8590', fontSize: 10, letterSpacing: '1px' }}>SAMPLE MENTIONS</span>
          <span className="font-mono" style={{ color: '#7D8590', fontSize: 10 }}>
            {effectiveIdx + 1} / {narrative.sample_mentions.length}
          </span>
        </div>
        {sampleMention && (
          <div className="flex-1 px-4 py-3 overflow-auto">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono" style={{
                fontSize: 9, padding: '2px 5px', background: '#2DD4BF20', color: '#2DD4BF',
                borderRadius: 2, letterSpacing: '0.5px',
              }}>
                {sampleMention.source.toUpperCase()}
              </span>
              <span className="font-mono" style={{ color: '#E6EDF3', fontSize: 11 }}>
                {sampleMention.author.handle ?? sampleMention.author.name ?? 'unknown'}
              </span>
              {sampleMention.author.followers && (
                <span className="font-mono" style={{ color: '#7D8590', fontSize: 10 }}>
                  {sampleMention.author.followers.toLocaleString()} followers
                </span>
              )}
              <span className="font-mono ml-auto" style={{ color: '#7D8590', fontSize: 10 }}>
                {new Date(sampleMention.published_at ?? sampleMention.fetched_at).toLocaleString('es', {
                  hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
                })}
              </span>
            </div>
            {sampleMention.title && (
              <div className="font-sans mb-2" style={{ color: '#E6EDF3', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                {sampleMention.title}
              </div>
            )}
            <div className="font-sans" style={{ color: '#E6EDF3', fontSize: 12, lineHeight: 1.5 }}>
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
              ↗ open original
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
