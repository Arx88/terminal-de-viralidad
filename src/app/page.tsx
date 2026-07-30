'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTerminalStream } from '@/hooks/useTerminalStream';
import { Ticker } from '@/components/terminal/Ticker';
import { NarrativeRow } from '@/components/terminal/NarrativeRow';
import { DetailPanel } from '@/components/terminal/DetailPanel';
import { MentionStream } from '@/components/terminal/MentionStream';
import { AgentActivityPanel } from '@/components/terminal/AgentActivityPanel';
import { PHASE_CONFIG } from '@/lib/types';
import type { Phase } from '@/lib/types';

type SortKey = 'score' | 'velocity' | 'recent';

export default function Home() {
  const { narratives, activities, mentions, loops, status } = useTerminalStream();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [filterPhase, setFilterPhase] = useState<Phase | 'all'>('all');

  const narrativeList = useMemo(() => {
    let list = Array.from(narratives.values());
    if (filterPhase !== 'all') list = list.filter(n => n.status === filterPhase);
    switch (sortKey) {
      case 'score': list.sort((a, b) => b.current_score - a.current_score); break;
      case 'velocity': list.sort((a, b) => b.velocity_1h - a.velocity_1h); break;
      case 'recent': list.sort((a, b) => b.last_seen - a.last_seen); break;
    }
    return list;
  }, [narratives, sortKey, filterPhase]);

  const selected = selectedId ? narratives.get(selectedId) ?? null : narrativeList[0] ?? null;

  const handleTrigger = useCallback(async () => {
    const queries = ['AI agents', 'crypto regulation', 'climate summit', 'tech layoffs', 'election polls'];
    const q = queries[Math.floor(Math.random() * queries.length)];
    await fetch('/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, max_iterations: 4 }),
    });
  }, []);

  const statusConfig = {
    live: { color: '#00FF9F', label: 'LIVE' },
    syncing: { color: '#FBBF24', label: 'SYNC' },
    reconnecting: { color: '#F59E0B', label: 'RCNT' },
    offline: { color: '#EF4444', label: 'OFFLINE' },
  } as const;
  const sCfg = statusConfig[status];

  return (
    <div
      className="flex flex-col"
      style={{
        minHeight: '100vh',
        background: '#0A0E14',
        color: '#E6EDF3',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      {/* Ticker top bar */}
      <Ticker narratives={Array.from(narratives.values())} />

      {/* Main 3-pane layout */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 'calc(100vh - 32px - 24px - 80px)' }}>

        {/* Left panel — narrative list */}
        <aside
          className="flex flex-col shrink-0"
          style={{
            width: 320,
            background: '#0D1117',
            borderRight: '1px solid #21262D',
          }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: '#21262D' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono" style={{ color: '#E6EDF3', fontSize: 11, fontWeight: 600, letterSpacing: '1.5px' }}>
                NARRATIVES
              </span>
              <span className="font-mono" style={{ color: '#7D8590', fontSize: 9 }}>
                {narrativeList.length} shown
              </span>
            </div>
            {/* Sort selector */}
            <div className="flex items-center gap-1">
              <span className="font-mono" style={{ color: '#7D8590', fontSize: 9 }}>sort:</span>
              {(['score', 'velocity', 'recent'] as const).map(k => (
                <button
                  key={k}
                  onClick={() => setSortKey(k)}
                  className="font-mono"
                  style={{
                    fontSize: 9,
                    padding: '1px 5px',
                    background: sortKey === k ? '#2DD4BF20' : 'transparent',
                    color: sortKey === k ? '#2DD4BF' : '#7D8590',
                    border: `1px solid ${sortKey === k ? '#2DD4BF50' : '#21262D'}`,
                    borderRadius: 2,
                    cursor: 'pointer',
                    letterSpacing: '0.5px',
                  }}
                >
                  {k.slice(0, 4)}
                </button>
              ))}
            </div>
            {/* Phase filter */}
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              <span className="font-mono" style={{ color: '#7D8590', fontSize: 9 }}>phase:</span>
              <button
                onClick={() => setFilterPhase('all')}
                className="font-mono"
                style={{
                  fontSize: 9,
                  padding: '1px 5px',
                  background: filterPhase === 'all' ? '#94A3B820' : 'transparent',
                  color: filterPhase === 'all' ? '#94A3B8' : '#7D8590',
                  border: `1px solid ${filterPhase === 'all' ? '#94A3B850' : '#21262D'}`,
                  borderRadius: 2,
                  cursor: 'pointer',
                }}
              >
                ALL
              </button>
              {(['forming', 'rising', 'formed', 'decaying'] as Phase[]).map(p => {
                const cfg = PHASE_CONFIG[p];
                const active = filterPhase === p;
                return (
                  <button
                    key={p}
                    onClick={() => setFilterPhase(p)}
                    className="font-mono"
                    style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      background: active ? cfg.color + '20' : 'transparent',
                      color: active ? cfg.color : '#7D8590',
                      border: `1px solid ${active ? cfg.color + '50' : '#21262D'}`,
                      borderRadius: 2,
                      cursor: 'pointer',
                    }}
                  >
                    {cfg.icon} {cfg.label.slice(0, 4)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-1 overflow-auto custom-scroll">
            {narrativeList.length === 0 ? (
              <div className="px-3 py-4 font-mono text-center" style={{ color: '#484F58', fontSize: 11 }}>
                <div style={{ marginBottom: 4 }}>◇</div>
                <div>no narratives yet</div>
                <div style={{ fontSize: 9, marginTop: 4, color: '#30363D' }}>trigger a loop below</div>
              </div>
            ) : (
              narrativeList.map(n => (
                <NarrativeRow
                  key={n.id}
                  narrative={n}
                  selected={selected?.id === n.id}
                  onSelect={setSelectedId}
                />
              ))
            )}
          </div>
          <button
            onClick={handleTrigger}
            className="px-3 py-2 border-t font-mono hover:bg-[#161B22] transition-colors"
            style={{
              borderColor: '#21262D',
              background: '#070A0F',
              color: '#2DD4BF',
              fontSize: 11,
              letterSpacing: '0.5px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            ▮ Iniciar nuevo loop de agentes →
          </button>
        </aside>

        {/* Center panel — detail */}
        <main className="flex-1 flex flex-col overflow-hidden" style={{ background: '#0A0E14' }}>
          <DetailPanel narrative={selected ?? null} />
        </main>

        {/* Right panel — agent activity + mention stream */}
        <aside
          className="flex flex-col shrink-0"
          style={{
            width: 340,
            background: '#0D1117',
            borderLeft: '1px solid #21262D',
          }}
        >
          <div style={{ height: '45%', borderBottom: '1px solid #21262D' }}>
            <AgentActivityPanel activities={activities} loops={loops} />
          </div>
          <div style={{ height: '55%' }}>
            <MentionStream items={mentions} />
          </div>
        </aside>
      </div>

      {/* Bottom accel strip + hints */}
      <footer style={{ background: '#070A0F', borderTop: '1px solid #21262D' }}>
        <div className="px-3 py-1.5 flex items-center gap-3 overflow-hidden" style={{ height: 28 }}>
          <span className="font-mono shrink-0" style={{ color: '#7D8590', fontSize: 9, letterSpacing: '1.5px' }}>ACCEL</span>
          {Array.from(narratives.values()).sort((a, b) => b.velocity_1h - a.velocity_1h).slice(0, 8).map(n => {
            const cfg = PHASE_CONFIG[n.status];
            const points = n.history.length > 1 ? n.history : [0, n.velocity_1h];
            const max = Math.max(...points, 1);
            const w = 60;
            const h = 16;
            const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * w / (points.length - 1)).toFixed(1)} ${(h - (p / max) * h).toFixed(1)}`).join(' ');
            return (
              <div key={n.id} className="flex items-center gap-1 shrink-0">
                <svg width={w} height={h} aria-hidden>
                  <path d={path} fill="none" stroke={cfg.color} strokeWidth={1} strokeLinecap="round" />
                </svg>
                <span className="font-mono" style={{ color: '#7D8590', fontSize: 8 }}>{n.title.slice(0, 8)}</span>
              </div>
            );
          })}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <span className="font-mono" style={{ color: '#7D8590', fontSize: 9 }}>
              agents: scout → cluster → score → phase → validator → loop
            </span>
          </div>
        </div>
        <div className="px-3 py-1 flex items-center justify-between" style={{ height: 24, borderTop: '1px solid #161B22' }}>
          <div className="flex items-center gap-3 font-mono" style={{ color: '#7D8590', fontSize: 9, letterSpacing: '0.5px' }}>
            <span>flujo: scout → cluster → score → phase → validator → <span style={{ color: '#00FF9F' }}>evaluator</span> → loop</span>
          </div>
          <div className="flex items-center gap-2 font-mono" style={{ fontSize: 9 }}>
            <span style={{ color: sCfg.color }}>● {sCfg.label}</span>
            <span style={{ color: '#7D8590' }}>·</span>
            <span style={{ color: '#7D8590' }}>{narratives.size} narrativas</span>
            <span style={{ color: '#7D8590' }}>·</span>
            <span style={{ color: '#7D8590' }}>{activities.length} eventos</span>
            <span style={{ color: '#7D8590' }}>·</span>
            <span style={{ color: '#5EEAD4' }}>LLM: NVIDIA Nemotron-3-Ultra-550B</span>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        .custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: #0D1117; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #21262D; border-radius: 3px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #30363D; }
      `}</style>
    </div>
  );
}
