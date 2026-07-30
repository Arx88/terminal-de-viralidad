'use client';

import type { NormalizedMention } from '@/lib/types';
import { Typewriter } from './Typewriter';

interface MentionStreamItem {
  mention: NormalizedMention;
  narrative_id: string;
  ts: number;
}

interface MentionStreamProps {
  items: MentionStreamItem[];
}

const SOURCE_COLORS: Record<string, string> = {
  twitter: '#2DD4BF',
  gdelt: '#58A6FF',
  reddit: '#FBBF24',
  hackernews: '#F87171',
  googletrends: '#A78BFA',
};

export function MentionStream({ items }: MentionStreamProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: '#21262D' }}>
        <span className="font-mono" style={{ color: '#94A3B8', fontSize: 10, letterSpacing: '1.5px' }}>
          LIVE MENTIONS
        </span>
        <span className="font-mono" style={{ color: '#7D8590', fontSize: 9 }}>
          ▮ stream · {items.length}
        </span>
      </div>
      <div className="flex-1 overflow-auto custom-scroll">
        {items.length === 0 ? (
          <div className="px-3 py-4 font-mono text-center" style={{ color: '#484F58', fontSize: 11 }}>
            <div style={{ marginBottom: 4 }}>▮ typing...</div>
            <div style={{ fontSize: 9, color: '#30363D' }}>waiting for stream</div>
          </div>
        ) : (
          items.map((item, idx) => {
            const m = item.mention;
            const color = SOURCE_COLORS[m.source] ?? '#7D8590';
            const isLatest = idx === 0;
            return (
              <div
                key={m.id}
                className="px-3 py-2 border-b"
                style={{
                  borderColor: '#161B22',
                  background: isLatest ? color + '08' : 'transparent',
                  transition: 'background 0.4s',
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 8,
                      padding: '1px 4px',
                      background: color + '20',
                      color,
                      borderRadius: 2,
                      letterSpacing: '0.5px',
                      fontWeight: 600,
                    }}
                  >
                    {m.source.slice(0, 4).toUpperCase()}
                  </span>
                  <span className="font-mono truncate" style={{ color: '#E6EDF3', fontSize: 10 }}>
                    {m.author.handle ?? m.author.name ?? 'unknown'}
                  </span>
                  <span className="font-mono ml-auto shrink-0" style={{ color: '#7D8590', fontSize: 9 }}>
                    {formatRelative(m.published_at ?? m.fetched_at)}
                  </span>
                </div>
                <div className="font-mono" style={{ color: '#94A3B8', fontSize: 10, lineHeight: 1.4 }}>
                  {isLatest ? (
                    <Typewriter text={m.title ?? m.body} speed={120} />
                  ) : (
                    <span>{(m.title ?? m.body).slice(0, 120)}{(m.title ?? m.body).length > 120 ? '…' : ''}</span>
                  )}
                </div>
                {(m.engagement.likes || m.engagement.score) && (
                  <div className="flex items-center gap-3 mt-1 font-mono" style={{ color: '#7D8590', fontSize: 9 }}>
                    {m.engagement.likes != null && <span>♥ {m.engagement.likes}</span>}
                    {m.engagement.retweets != null && <span>↻ {m.engagement.retweets}</span>}
                    {m.engagement.score != null && <span>↑ {m.engagement.score}</span>}
                    {m.engagement.comments != null && <span>💬 {m.engagement.comments}</span>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: #0D1117; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #21262D; border-radius: 3px; }
      `}</style>
    </div>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
  return `${Math.floor(diff / 86400_000)}d`;
}
