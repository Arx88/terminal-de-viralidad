'use client';

import type { Narrative } from '@/lib/types';
import { PHASE_CONFIG } from '@/lib/types';

interface TickerProps {
  narratives: Narrative[];
}

export function Ticker({ narratives }: TickerProps) {
  const sorted = [...narratives].sort((a, b) => b.current_score - a.current_score).slice(0, 12);

  return (
    <div
      className="flex items-center gap-4 px-3 overflow-hidden"
      style={{
        height: 32,
        background: '#070A0F',
        borderBottom: '1px solid #21262D',
      }}
    >
      <span className="font-mono shrink-0 flex items-center gap-1.5" style={{ color: '#00FF9F', fontSize: 10, letterSpacing: '1.5px' }}>
        <span style={{
          display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
          background: '#00FF9F', boxShadow: '0 0 8px #00FF9F', animation: 'pulse-live 1.5s ease-in-out infinite',
        }} />
        LIVE
      </span>
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-4 ticker-scroll">
          {sorted.length === 0 ? (
            <span className="font-mono" style={{ color: '#484F58', fontSize: 10 }}>
              ▮ awaiting narratives...
            </span>
          ) : (
            sorted.map(n => {
              const cfg = PHASE_CONFIG[n.status];
              const delta = n.last_delta_pct;
              return (
                <span key={n.id} className="font-mono shrink-0 flex items-center gap-1.5" style={{ fontSize: 10 }}>
                  <span aria-hidden style={{ color: cfg.color }}>{cfg.icon}</span>
                  <span style={{ color: '#E6EDF3', fontWeight: 500 }}>{n.title}</span>
                  <span className="tabular-nums" style={{ color: '#94A3B8' }}>
                    {n.current_score.toFixed(0)}
                  </span>
                  <span className="tabular-nums" style={{ color: delta >= 0 ? '#2DD4BF' : '#F87171' }}>
                    {delta >= 0 ? '▲' : '▽'}{Math.abs(delta).toFixed(1)}%
                  </span>
                  <span style={{ color: '#21262D' }}>·</span>
                </span>
              );
            })
          )}
        </div>
      </div>
      <style>{`
        @keyframes pulse-live {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-scroll {
          animation: ticker-scroll 40s linear infinite;
          white-space: nowrap;
        }
        .ticker-scroll:hover { animation-play-state: paused; }
      `}</style>
    </div>
  );
}
