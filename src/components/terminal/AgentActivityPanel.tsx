'use client';

import type { AgentActivity } from '@/lib/types';

interface AgentActivityPanelProps {
  activities: AgentActivity[];
  loops: Map<string, { iteration: number; agent: string; status: string }>;
}

const AGENT_COLORS: Record<string, string> = {
  scout: '#FBBF24',
  cluster: '#5EEAD4',
  score: '#2DD4BF',
  phase: '#A78BFA',
  validator: '#F87171',
  evaluator: '#00FF9F',
  orchestrator: '#94A3B8',
};

const AGENT_ICONS: Record<string, string> = {
  scout: '◇',
  cluster: '⬡',
  score: 'Σ',
  phase: '⟲',
  validator: '✓',
  evaluator: '⚖',
  orchestrator: '◉',
};

const AGENT_NAMES_ES: Record<string, string> = {
  scout: 'Scout — Recolector',
  cluster: 'Cluster — Agrupador',
  score: 'Score — Puntuador',
  phase: 'Phase — Clasificador',
  validator: 'Validator — Validador',
  evaluator: 'Evaluator — Crítico',
  orchestrator: 'Orchestrator',
};

export function AgentActivityPanel({ activities, loops }: AgentActivityPanelProps) {
  const activeLoops = Array.from(loops.entries()).slice(-6);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: '#21262D' }}>
        <span className="font-mono" style={{ color: '#94A3B8', fontSize: 10, letterSpacing: '1.5px' }}>
          AGENT LOOP · LIVE
        </span>
        <span className="font-mono" style={{ color: '#7D8590', fontSize: 9 }}>
          {activities.length} events
        </span>
      </div>

      {/* Active loops indicator */}
      {activeLoops.length > 0 && (
        <div className="px-3 py-2 border-b" style={{ borderColor: '#21262D' }}>
          <div className="font-mono mb-1.5" style={{ color: '#7D8590', fontSize: 8, letterSpacing: '1.5px' }}>ACTIVE</div>
          <div className="flex flex-wrap gap-1">
            {activeLoops.map(([key, loop]) => {
              const color = AGENT_COLORS[loop.agent] ?? '#7D8590';
              const icon = AGENT_ICONS[loop.agent] ?? '·';
              return (
                <span
                  key={key}
                  className="font-mono inline-flex items-center gap-1"
                  style={{
                    fontSize: 9,
                    padding: '2px 5px',
                    background: color + '15',
                    color,
                    border: `1px solid ${color}40`,
                    borderRadius: 2,
                    letterSpacing: '0.5px',
                  }}
                >
                  <span>{icon}</span>
                  <span>{loop.agent.slice(0, 4).toUpperCase()}</span>
                  <span style={{ opacity: 0.6 }}>·i{loop.iteration}</span>
                  {loop.status === 'running' && (
                    <span style={{ display: 'inline-block', width: 4, height: 4, background: color, borderRadius: '50%', animation: 'pulse-dot 1s ease-in-out infinite' }} />
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity feed */}
      <div className="flex-1 overflow-auto custom-scroll">
        {activities.length === 0 ? (
          <div className="px-3 py-4 font-mono text-center" style={{ color: '#484F58', fontSize: 11 }}>
            waiting for agent activity...
          </div>
        ) : (
          activities.map(act => {
            const color = AGENT_COLORS[act.agent] ?? '#7D8590';
            const icon = AGENT_ICONS[act.agent] ?? '·';
            const name_es = AGENT_NAMES_ES[act.agent] ?? act.agent;
            return (
              <div
                key={act.id}
                className="px-3 py-2.5 border-b hover:bg-[#161B22] transition-colors"
                style={{ borderColor: '#161B22' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono" style={{ color, fontSize: 12 }}>{icon}</span>
                  <span className="font-sans" style={{ color, fontSize: 11, fontWeight: 600 }}>
                    {name_es}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 8,
                      padding: '1px 5px',
                      borderRadius: 2,
                      background: act.status === 'success' ? '#2DD4BF20' : act.status === 'failed' ? '#F8717120' : act.status === 'waiting' ? '#FBBF2420' : '#7D859020',
                      color: act.status === 'success' ? '#2DD4BF' : act.status === 'failed' ? '#F87171' : act.status === 'waiting' ? '#FBBF24' : '#7D8590',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {act.status === 'success' ? 'OK' : act.status === 'failed' ? 'FAIL' : act.status === 'waiting' ? 'WAIT' : act.status.toUpperCase()}
                  </span>
                  <span className="font-mono ml-auto" style={{ color: '#7D8590', fontSize: 9 }}>
                    iter {act.iteration} · {act.duration_ms ?? 0}ms
                  </span>
                </div>
                {/* Explicación en español del LLM */}
                {act.explanation && (
                  <div className="font-sans mb-1.5" style={{ color: '#E6EDF3', fontSize: 11, lineHeight: 1.4 }}>
                    {act.explanation}
                  </div>
                )}
                {/* Output técnico compacto */}
                <div className="font-mono" style={{ color: '#7D8590', fontSize: 9, lineHeight: 1.3 }}>
                  {act.output_summary}
                </div>
                {act.metrics && Object.keys(act.metrics).length > 0 && (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 font-mono" style={{ fontSize: 9 }}>
                    {Object.entries(act.metrics).slice(0, 5).map(([k, v]) => (
                      <span key={k} style={{ color: '#7D8590' }}>
                        <span style={{ opacity: 0.6 }}>{k}:</span>{' '}
                        <span style={{ color: '#94A3B8' }}>{String(v)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: #0D1117; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #21262D; border-radius: 3px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #30363D; }
      `}</style>
    </div>
  );
}
