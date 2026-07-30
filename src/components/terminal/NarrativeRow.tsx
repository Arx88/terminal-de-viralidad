'use client';

import { memo } from 'react';
import type { Narrative } from '@/lib/types';
import { PHASE_CONFIG } from '@/lib/types';
import { Sparkline } from './Sparkline';
import { LegitimacyBadge } from './Badges';

interface NarrativeRowProps {
  narrative: Narrative;
  selected: boolean;
  onSelect: (id: string) => void;
}

function NarrativeRowImpl({ narrative, selected, onSelect }: NarrativeRowProps) {
  const cfg = PHASE_CONFIG[narrative.status];
  const accent = cfg.color;
  const scoreChanged = Math.abs(narrative.last_delta_pct) > 5;

  return (
    <button
      onClick={() => onSelect(narrative.id)}
      aria-selected={selected}
      role="row"
      className="group relative w-full text-left transition-colors"
      style={{
        background: selected ? '#1C2128' : 'transparent',
        opacity: narrative.status === 'decaying' ? 0.65 : 1,
        borderLeft: `2px solid ${selected ? accent : 'transparent'}`,
        boxShadow: selected && narrative.status === 'rising' ? `inset 3px 0 12px -3px ${accent}50` : 'none',
        padding: '7px 12px',
        cursor: 'pointer',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span aria-hidden className="font-mono shrink-0" style={{ color: accent, fontSize: 12 }}>
            {narrative.status === 'forming' && '◇'}
            {narrative.status === 'rising' && (scoreChanged ? '▲▲' : '▲')}
            {narrative.status === 'formed' && '●'}
            {narrative.status === 'decaying' && '▽'}
          </span>
          <span
            className="font-mono truncate"
            style={{ color: '#E6EDF3', fontSize: 12, letterSpacing: '-0.01em' }}
            title={narrative.title}
          >
            {narrative.title}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Sparkline points={narrative.history} color={accent} width={50} height={14} />
          <span
            className="font-mono tabular-nums"
            style={{ color: '#E6EDF3', fontSize: 12, fontWeight: 600, minWidth: 38, textAlign: 'right' }}
          >
            {narrative.current_score.toFixed(0)}
          </span>
          <span
            className="font-mono tabular-nums"
            style={{
              color: narrative.last_delta_pct >= 0 ? '#2DD4BF' : '#F87171',
              fontSize: 10,
              minWidth: 38,
              textAlign: 'right',
            }}
          >
            {narrative.last_delta_pct >= 0 ? '▲' : '▽'}
            {Math.abs(narrative.last_delta_pct).toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <LegitimacyBadge legitimacy={narrative.legitimacy} size="sm" />
          <span className="font-mono" style={{ color: '#7D8590', fontSize: 9 }}>
            {narrative.source_count}src · {narrative.mention_count}m
          </span>
        </div>
        <span className="font-mono" style={{ color: '#7D8590', fontSize: 9 }}>
          iter {narrative.loop_iterations}
        </span>
      </div>
    </button>
  );
}

export const NarrativeRow = memo(NarrativeRowImpl, (prev, next) =>
  prev.selected === next.selected &&
  prev.narrative.id === next.narrative.id &&
  prev.narrative.current_score === next.narrative.current_score &&
  prev.narrative.status === next.narrative.status &&
  prev.narrative.last_delta_pct === next.narrative.last_delta_pct &&
  prev.narrative.legitimacy === next.narrative.legitimacy &&
  prev.narrative.history === next.narrative.history &&
  prev.narrative.title === next.narrative.title &&
  prev.narrative.source_count === next.narrative.source_count &&
  prev.narrative.mention_count === next.narrative.mention_count &&
  prev.narrative.loop_iterations === next.narrative.loop_iterations
);
