'use client';

import { useState, useMemo } from 'react';
import type { NormalizedMention, SourceType } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────
// MentionDetail — "Mención Detallada" panel card (Agente #2 · Product Design)
//
// Renders a single normalized mention with full interaction breakdown,
// exact publication date, source badge, and quote/reply context.
// Dark theme tokens mirror src/app/globals.css (.dark) and the inline-style
// idiom used across src/components/terminal/*.
// ─────────────────────────────────────────────────────────────────────────

/** Visual + metadata enrichment that the base NormalizedMention doesn't carry. */
export interface MentionEnrichment {
  /** Author display name override (falls back to handle). */
  displayName?: string;
  /** Avatar image URL. If absent, initials are rendered. */
  avatarUrl?: string;
  /** Verified account flag (shows the teal check). */
  verified?: boolean;
  /** Follower / karma count shown next to the handle. */
  audience?: number;
  audienceLabel?: string; // "seguidores" | "karma"
  /** Subreddit / community (Reddit) or section label. */
  community?: string;
  /** Post type label, e.g. "story · front page", "post · discusión". */
  typeLabel?: string;
  /** Quote / reply context block (quotes & replies). */
  quote?: {
    kind: 'quote' | 'reply';
    authorHandle: string;
    authorName?: string;
    dateLabel?: string;
    text: string;
  };
  /** Extra engagement fields per source. */
  views?: number;            // bluesky / twitter
  reposts?: number;          // bluesky / twitter (alias of engagement.retweets)
  upvoteRatio?: number;      // reddit 0..1
  crossposts?: number;       // reddit
  rank?: number;             // hackernews
  timeOnFront?: string;      // hackernews, e.g. "8h"
}

export interface MentionDetailProps {
  mention: NormalizedMention;
  enrichment?: MentionEnrichment;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onMetricClick?: (metric: string, value: number) => void;
}

// ─── Source visual config ────────────────────────────────────────────────
const SOURCE_CFG: Record<string, { color: string; label: string }> = {
  twitter:     { color: '#2DD4BF', label: 'Twitter/X' },
  bluesky:     { color: '#38BDF8', label: 'Bluesky' },
  reddit:      { color: '#FB923C', label: 'Reddit' },
  hackernews:  { color: '#F87171', label: 'Hacker News' },
  gdelt:       { color: '#58A6FF', label: 'GDELT' },
  googletrends:{ color: '#A78BFA', label: 'Google Trends' },
  mock:        { color: '#7D8590', label: 'Mock' },
};

// ─── Inline SVG icons (Lucide-style, 1.6 stroke, currentColor) ───────────
type IconProps = { size?: number; className?: string };
const svg = (size = 14) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

const HeartIcon = ({ size }: IconProps) => (<svg {...svg(size)}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>);
const RepostIcon = ({ size }: IconProps) => (<svg {...svg(size)}><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>);
const ReplyIcon = ({ size }: IconProps) => (<svg {...svg(size)}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>);
const ViewsIcon = ({ size }: IconProps) => (<svg {...svg(size)}><path d="M3 3v18h18"/><path d="M7 16l4-5 3 3 5-7"/></svg>);
const UpvoteIcon = ({ size }: IconProps) => (<svg {...svg(size)} strokeWidth={1.7}><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>);
const CommentsIcon = ({ size }: IconProps) => (<svg {...svg(size)}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>);
const CrosspostIcon = ({ size }: IconProps) => (<svg {...svg(size)}><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>);
const RatioIcon = ({ size }: IconProps) => (<svg {...svg(size)}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>);
const RankIcon = ({ size }: IconProps) => (<svg {...svg(size)}><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>);
const ClockIcon = ({ size }: IconProps) => (<svg {...svg(size)}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>);
const CalendarIcon = ({ size }: IconProps) => (<svg {...svg(size)}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>);
const QuoteIcon = ({ size }: IconProps) => (<svg {...svg(size)}><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2H4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .01-1 1.03z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2h-4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .01-1 1.03z"/></svg>);
const ExternalIcon = ({ size }: IconProps) => (<svg {...svg(size)} strokeWidth={1.7}><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>);
const CopyIcon = ({ size }: IconProps) => (<svg {...svg(size)}><rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>);
const ShareIcon = ({ size }: IconProps) => (<svg {...svg(size)}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/></svg>);
const BookmarkIcon = ({ size }: IconProps) => (<svg {...svg(size)}><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>);
const CheckIcon = ({ size }: IconProps) => (<svg {...svg(size)} strokeWidth={2.2}><path d="M20 6 9 17l-5-5"/></svg>);
const ChevronIcon = ({ size }: IconProps) => (<svg {...svg(size)} strokeWidth={1.7}><path d="m6 9 6 6 6-6"/></svg>);
const GlobeIcon = ({ size }: IconProps) => (<svg {...svg(size)}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>);
const VerifiedIcon = ({ size }: IconProps) => (
  <svg width={size ?? 14} height={size ?? 14} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l2.4 1.8 3 .2.9 2.8 2.3 2-1 2.8 1 2.8-2.3 2-.9 2.8-3 .2L12 22l-2.4-1.8-3-.2-.9-2.8-2.3-2 1-2.8-1-2.8 2.3-2 .9-2.8 3-.2z" opacity=".22"/>
    <path d="M8.5 12.5l2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─── Source brand glyph ──────────────────────────────────────────────────
function SourceGlyph({ source, size = 13 }: { source: string; size?: number }) {
  switch (source) {
    case 'bluesky':
    case 'twitter':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 10.4c-1.4-2.1-3-3.4-4.8-3.4-2.1 0-3.4 1.5-3.4 3.2 0 2.4 1.9 4.5 3.7 5.5 1.6.9 3.1.8 4.5-1.1 1.4 1.9 2.9 2 4.5 1.1 1.8-1 3.7-3.1 3.7-5.5 0-1.7-1.3-3.2-3.4-3.2-1.8 0-3.4 1.3-4.8 3.4z"/>
        </svg>
      );
    case 'reddit':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="16" cy="5" r="1.6"/>
          <path d="M15.2 6.2 13.4 9.3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          <ellipse cx="12" cy="13" rx="7" ry="5.6"/>
          <circle cx="9.4" cy="12.6" r="1.5" fill="#0D1117"/>
          <circle cx="14.6" cy="12.6" r="1.5" fill="#0D1117"/>
          <path d="M9.4 14.8c.9 1 4.3 1 5.2 0" stroke="#0D1117" strokeWidth="1.1" fill="none" strokeLinecap="round"/>
        </svg>
      );
    case 'hackernews':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <rect width="24" height="24" rx="5" fill="#FF6600"/>
          <path d="M5 6.5 12 13.5 19 6.5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="12" y1="13.5" x2="12" y2="18.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      );
    default:
      return <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

function formatExact(ts: number): string {
  return new Date(ts).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`;
  return `hace ${Math.floor(diff / 86_400_000)}d`;
}

function initialsOf(name: string | null): string {
  if (!name) return '?';
  const parts = name.replace(/^u\//, '').replace(/^@/, '').split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return name.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// deterministic gradient for initials fallback
function gradientFor(seed: string, base: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 55%), ${base})`;
}

// ─── Metric definition ───────────────────────────────────────────────────
interface Metric {
  key: string;
  icon: React.ReactNode;
  value: string;
  label: string;
  tip: string;
  primary?: boolean;
  extra?: React.ReactNode; // e.g. ratio bar
}

// ═════════════════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════════════════
export function MentionDetail({ mention, enrichment, selected, onSelect, onMetricClick }: MentionDetailProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pulsedKey, setPulsedKey] = useState<string | null>(null);

  const src = SOURCE_CFG[mention.source] ?? SOURCE_CFG.mock;
  const e = enrichment ?? {};
  const eng = mention.engagement;
  const ts = mention.published_at ?? mention.fetched_at;

  const authorName = e.displayName ?? mention.author.name ?? mention.author.handle ?? 'unknown';
  const handle = mention.author.handle ?? mention.author.name ?? 'unknown';
  const avatarUrl = e.avatarUrl;

  // Build the metric set per source
  const metrics = useMemo<Metric[]>(() => {
    const list: Metric[] = [];
    if (mention.source === 'reddit') {
      if (eng.score != null) {
        list.push({
          key: 'score', icon: <UpvoteIcon size={14} />, value: formatCompact(eng.score), label: 'score',
          tip: `${eng.score.toLocaleString('es')} upvotes`, primary: true,
          extra: e.upvoteRatio != null ? (
            <div className="ratio-bar" title={`Upvote ratio ${(e.upvoteRatio * 100).toFixed(0)}%`}>
              <i style={{ width: `${e.upvoteRatio * 100}%`, background: src.color }} />
            </div>
          ) : undefined,
        });
      }
      if (eng.comments != null) list.push({ key: 'comments', icon: <CommentsIcon size={14} />, value: formatCompact(eng.comments), label: 'comentarios', tip: `${eng.comments.toLocaleString('es')} comentarios` });
      if (e.crossposts != null) list.push({ key: 'crossposts', icon: <CrosspostIcon size={14} />, value: String(e.crossposts), label: 'crossposts', tip: `${e.crossposts} crossposts` });
      if (e.upvoteRatio != null) list.push({ key: 'ratio', icon: <RatioIcon size={14} />, value: `${(e.upvoteRatio * 100).toFixed(0)}%`, label: 'upvote ratio', tip: `${(e.upvoteRatio * 100).toFixed(0)}% positivo` });
    } else if (mention.source === 'hackernews') {
      if (eng.score != null) list.push({ key: 'points', icon: <UpvoteIcon size={14} />, value: formatCompact(eng.score), label: 'points', tip: `${eng.score.toLocaleString('es')} points`, primary: true });
      if (eng.comments != null) list.push({ key: 'comments', icon: <CommentsIcon size={14} />, value: formatCompact(eng.comments), label: 'comments', tip: `${eng.comments.toLocaleString('es')} comentarios` });
      if (e.rank != null) list.push({ key: 'rank', icon: <RankIcon size={14} />, value: `#${e.rank}`, label: 'rank', tip: `Rank #${e.rank} en front page` });
      if (e.timeOnFront) list.push({ key: 'front', icon: <ClockIcon size={14} />, value: e.timeOnFront, label: 'on front', tip: `${e.timeOnFront} en front page` });
    } else {
      // twitter / bluesky / generic
      if (eng.likes != null) list.push({ key: 'likes', icon: <HeartIcon size={14} />, value: formatCompact(eng.likes), label: 'likes', tip: `${eng.likes.toLocaleString('es')} me gusta`, primary: true });
      const reposts = e.reposts ?? eng.retweets;
      if (reposts != null) list.push({ key: 'reposts', icon: <RepostIcon size={14} />, value: formatCompact(reposts), label: 'reposts', tip: `${reposts.toLocaleString('es')} reposts` });
      if (eng.replies != null) list.push({ key: 'replies', icon: <ReplyIcon size={14} />, value: formatCompact(eng.replies), label: 'replies', tip: `${eng.replies.toLocaleString('es')} respuestas` });
      if (e.views != null) list.push({ key: 'views', icon: <ViewsIcon size={14} />, value: formatCompact(e.views), label: 'views', tip: `${e.views.toLocaleString('es')} impresiones` });
    }
    return list;
  }, [mention.source, eng, e, src.color]);

  const handleCardClick = (ev: React.MouseEvent) => {
    if ((ev.target as HTMLElement).closest('a,button,.stat')) return;
    onSelect?.(mention.id);
  };

  const handleCopy = async () => {
    try { await navigator.clipboard?.writeText(mention.url); } catch { /* noop */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const pulse = (key: string, value: number) => {
    setPulsedKey(key);
    setTimeout(() => setPulsedKey(null), 360);
    onMetricClick?.(key, value);
  };

  const contentText = mention.body;
  const showClamp = contentText.length > 240;

  return (
    <article
      className="mention group relative"
      data-selected={selected || undefined}
      onClick={handleCardClick}
      style={{
        position: 'relative',
        padding: 20,
        borderBottom: '1px solid #21262D',
        background: selected ? '#0F141B' : 'transparent',
        boxShadow: selected ? `inset 2px 0 0 ${src.color}` : 'none',
        transition: 'background .18s ease, box-shadow .18s ease',
        cursor: onSelect ? 'pointer' : 'default',
      }}
    >
      <style>{`
        .mention:hover { background: #0F141B !important; }
        .mention:hover .md-accent-bar { background: ${src.color}; opacity: .9; }
        .mention:hover .md-open { color: ${'#2DD4BF'} !important; }
        .mention:hover .md-open svg { transform: translate(1px,-1px); }
        .md-accent-bar { position:absolute; left:0; top:10px; bottom:10px; width:2px; border-radius:0 2px 2px 0; background:transparent; transition: background .18s ease; }
        .stat[data-tip]:hover::after {
          content: attr(data-tip); position:absolute; bottom: calc(100% + 8px); left:0;
          font-family: var(--font-geist-mono, monospace); font-size:10px; white-space:nowrap;
          background:#1C2128; color:#E6EDF3; border:1px solid #30363D; border-radius:5px;
          padding:4px 8px; pointer-events:none; z-index:20; box-shadow:0 6px 20px -6px rgba(0,0,0,.7);
        }
        .stat[data-tip]:hover::before {
          content:""; position:absolute; bottom: calc(100% + 3px); left:14px;
          border:5px solid transparent; border-top-color:#30363D; z-index:20;
        }
        @keyframes md-pulse { 0%{transform:scale(1)} 40%{transform:scale(1.14)} 100%{transform:scale(1)} }
        .stat.pulsed .val { animation: md-pulse .34s ease; }
        .ratio-bar { margin-top:2px; height:3px; width:100%; max-width:52px; background:#21262D; border-radius:2px; overflow:hidden; }
        .ratio-bar > i { display:block; height:100%; }
        .clamped { display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
      `}</style>
      <span className="md-accent-bar" aria-hidden />

      {/* Header: source badge + date */}
      <div className="flex items-start justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 font-mono"
          style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
            padding: '3px 8px 3px 6px', borderRadius: 5,
            border: `1px solid ${src.color}60`, background: `${src.color}1f`, color: src.color,
          }}
        >
          <SourceGlyph source={mention.source} size={13} />
          {src.label}
        </span>

        <time
          className="inline-flex items-center gap-1.5 font-mono"
          style={{ fontSize: 11, color: '#7D8590' }}
          title={new Date(ts).toISOString()}
        >
          <CalendarIcon size={12} />
          <span>{formatRelative(ts)}</span>
          <span style={{ opacity: .4 }}>·</span>
          <span style={{ color: '#94A3B8' }}>{formatExact(ts)}</span>
        </time>
      </div>

      {/* Author */}
      <div className="flex items-center gap-3 mt-3">
        {avatarUrl ? (
          <div style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', border: '1px solid #30363D', flex: 'none' }}>
            <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <div
            className="font-mono"
            style={{
              width: 42, height: 42, borderRadius: '50%', flex: 'none',
              display: 'grid', placeItems: 'center',
              background: gradientFor(handle, src.color),
              color: '#0D1117', fontWeight: 700, fontSize: 15,
              border: '1px solid #30363D',
            }}
          >
            {initialsOf(authorName)}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 600, color: '#E6EDF3', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            <span className="truncate">{authorName}</span>
            {e.verified && <span style={{ color: '#2DD4BF', display: 'inline-flex' }} title="Cuenta verificada"><VerifiedIcon size={14} /></span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 font-mono" style={{ fontSize: 11.5, color: '#7D8590' }}>
            <span className="truncate">{handle}</span>
            {e.community && <>
              <span style={{ width: 2, height: 2, borderRadius: '50%', background: '#484F58' }} />
              <span style={{ color: src.color }}>{e.community}</span>
            </>}
            {e.audience != null && <>
              <span style={{ width: 2, height: 2, borderRadius: '50%', background: '#484F58' }} />
              <span>{formatCompact(e.audience)} {e.audienceLabel ?? 'seguidores'}</span>
            </>}
            {e.typeLabel && <>
              <span style={{ width: 2, height: 2, borderRadius: '50%', background: '#484F58' }} />
              <span style={{ color: '#94A3B8' }}>{e.typeLabel}</span>
            </>}
          </div>
        </div>
      </div>

      {/* Quote / reply context */}
      {e.quote && (
        <div className="mt-3.5" style={{ padding: '10px 12px 11px', borderLeft: `2px solid #30363D`, background: '#0B1016', borderRadius: '0 6px 6px 0' }}>
          <div className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.04em', color: '#94A3B8', marginBottom: 4 }}>
            <QuoteIcon size={11} />
            {e.quote.kind === 'reply' ? `EN RESPUESTA A ${e.quote.authorHandle}` : `CITANDO A ${e.quote.authorHandle}`}
          </div>
          <div className="font-mono" style={{ fontSize: 11, color: '#58A6FF', marginBottom: 2 }}>
            {e.quote.authorName ?? e.quote.authorHandle}{e.quote.dateLabel ? ` · ${e.quote.dateLabel}` : ''}
          </div>
          <div style={{ fontSize: 12.5, color: '#94A3B8', lineHeight: 1.5 }}>{e.quote.text}</div>
        </div>
      )}

      {/* Content */}
      <div className="mt-3.5" style={{ fontSize: 14, lineHeight: 1.6, color: '#C9D1D9' }}>
        {mention.title && (
          <div style={{ fontSize: 15, fontWeight: 600, color: '#E6EDF3', lineHeight: 1.4, marginBottom: 6, letterSpacing: '-0.01em' }}>{mention.title}</div>
        )}
        <div className={showClamp && !expanded ? 'clamped' : undefined}>{contentText}</div>
        {mention.entities.domains[0] && (
          <div className="inline-flex items-center gap-1 font-mono" style={{ fontSize: 11, color: '#7D8590', marginTop: 4 }}>
            <GlobeIcon size={11} />{mention.entities.domains[0]}
          </div>
        )}
      </div>

      {showClamp && (
        <button
          onClick={(ev) => { ev.stopPropagation(); setExpanded(v => !v); }}
          className="inline-flex items-center gap-1 font-mono"
          style={{ marginTop: 8, fontSize: 11, color: '#58A6FF', background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer' }}
        >
          {expanded ? 'Contraer' : 'Ver todo'}
          <span style={{ display: 'inline-flex', transition: 'transform .2s ease', transform: expanded ? 'rotate(180deg)' : 'none' }}><ChevronIcon size={12} /></span>
        </button>
      )}

      {/* Tags / entities */}
      {(mention.entities.hashtags.length > 0 || mention.entities.urls.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {mention.entities.hashtags.slice(0, 6).map(t => (
            <span key={t} className="font-mono" style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 3, background: '#11161D', color: '#58A6FF', border: '1px solid #182030' }}>#{t}</span>
          ))}
          {mention.entities.urls.slice(0, 2).map(u => (
            <span key={u} className="font-mono" style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 3, background: '#11161D', color: '#94A3B8', border: '1px solid #21262D' }}>{u.replace(/^https?:\/\//, '').slice(0, 28)}</span>
          ))}
        </div>
      )}

      {/* Interactions */}
      {metrics.length > 0 && (
        <div className="flex items-stretch mt-4" style={{ borderTop: '1px solid #21262D', paddingTop: 14 }}>
          {metrics.map((m, i) => (
            <div
              key={m.key}
              data-tip={m.tip}
              className={`stat ${pulsedKey === m.key ? 'pulsed' : ''}`}
              onClick={(ev) => { ev.stopPropagation(); pulse(m.key, Number(m.value.replace(/[#%]/g, '')) || 0); }}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', gap: 3, padding: `2px ${i === 0 ? 12 : 12}px`, position: 'relative', cursor: 'default',
                borderRight: i < metrics.length - 1 ? '1px solid #21262D' : 'none',
                paddingLeft: i === 0 ? 0 : undefined,
                paddingRight: i === metrics.length - 1 ? 0 : undefined,
              }}
            >
              <div className="flex items-center gap-1.5">
                <span style={{ color: m.primary ? src.color : '#7D8590', display: 'inline-flex', transition: 'color .15s ease' }}>{m.icon}</span>
                <span className="val font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#E6EDF3', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{m.value}</span>
              </div>
              <span className="font-mono" style={{ fontSize: 9, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: '#484F58' }}>{m.label}</span>
              {m.extra}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3.5">
        <a
          className="md-open inline-flex items-center gap-1.5 font-mono"
          href={mention.url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: '#58A6FF', textDecoration: 'none', letterSpacing: '.02em', transition: 'color .15s ease' }}
        >
          Abrir original
          <span style={{ display: 'inline-flex', transition: 'transform .15s ease' }}><ExternalIcon size={12} /></span>
        </a>
        <div className="flex gap-1">
          <button onClick={(ev) => { ev.stopPropagation(); handleCopy(); }} title="Copiar enlace"
            className="inline-grid place-items-center"
            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${copied ? '#2DD4BF66' : 'transparent'}`, background: copied ? '#2DD4BF14' : 'transparent', color: copied ? '#2DD4BF' : '#7D8590', cursor: 'pointer', transition: 'all .15s ease' }}>
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </button>
          <button onClick={(ev) => ev.stopPropagation()} title="Compartir"
            className="inline-grid place-items-center hover:enabled:bg-[#161B22]"
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: '#7D8590', cursor: 'pointer', transition: 'all .15s ease' }}>
            <ShareIcon size={14} />
          </button>
          <button onClick={(ev) => ev.stopPropagation()} title="Marcar para seguimiento"
            className="inline-grid place-items-center"
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: '#7D8590', cursor: 'pointer', transition: 'all .15s ease' }}>
            <BookmarkIcon size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default MentionDetail;
