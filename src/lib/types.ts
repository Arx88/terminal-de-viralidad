// ─────────────────────────────────────────────────────────────────────────
// Shared types — Terminal de Viralidad
// ─────────────────────────────────────────────────────────────────────────

export type SourceType = 'twitter' | 'gdelt' | 'reddit' | 'hackernews' | 'googletrends' | 'mock';
export type MentionType = 'post' | 'article' | 'story' | 'comment' | 'trend_signal';
export type Phase = 'forming' | 'rising' | 'formed' | 'decaying';
export type Legitimacy = 'LEGIT' | 'BOT_CAMPAIGN' | 'TWITTER_NATIVE' | 'PRE_BURST' | 'NOISE' | 'UNCERTAIN';
export type AgentName = 'scout' | 'cluster' | 'score' | 'phase' | 'validator' | 'orchestrator';
export type AgentStatus = 'idle' | 'running' | 'success' | 'failed' | 'waiting';

// ─── Normalized mention ──────────────────────────────────────────────────
export interface NormalizedMention {
  id: string;
  source: SourceType;
  source_id: string;
  url: string;
  fetched_at: number;
  published_at: number | null;
  type: MentionType;
  title: string | null;
  body: string;
  lang: string | null;
  author: {
    handle: string | null;
    name: string | null;
    followers?: number;
  };
  engagement: {
    likes?: number;
    retweets?: number;
    replies?: number;
    score?: number;
    comments?: number;
  };
  entities: {
    hashtags: string[];
    urls: string[];
    domains: string[];
  };
  content_hash?: string;
}

// ─── Narrative (cluster of mentions) ─────────────────────────────────────
export interface Narrative {
  id: string;
  title: string;
  summary: string;
  status: Phase;
  legitimacy: Legitimacy;
  origin_source: SourceType;
  origin_quality: number;
  first_seen: number;
  last_seen: number;
  mention_count: number;
  author_count: number;
  source_count: number;
  sources: SourceType[];
  keywords: string[];
  // Rolling metrics
  velocity_1h: number;
  velocity_6h: number;
  velocity_24h: number;
  acceleration: number;
  entropy: number;
  trash_penalty: number;
  // Score components
  velocity_score: number;
  maturity_score: number;
  current_score: number;
  decay_factor: number;
  burst_onset: number | null;
  predicted_peak: number | null;
  phase_confidence: number;
  // History (sparkline data)
  history: number[];
  // Mentions sample (for UI)
  sample_mentions: NormalizedMention[];
  // Last delta for UI animation
  last_delta_pct: number;
  // Loop iterations this narrative went through
  loop_iterations: number;
}

// ─── Agent activity log (for UI agent panel) ─────────────────────────────
export interface AgentActivity {
  id: string;
  agent: AgentName;
  status: AgentStatus;
  started_at: number;
  finished_at: number | null;
  duration_ms: number | null;
  input_summary: string;
  output_summary: string;
  // Loop context
  loop_id: string;
  iteration: number;
  // Optional payload for debugging
  metrics?: Record<string, number | string>;
  error?: string;
}

// ─── Agent contracts (input/output) ──────────────────────────────────────
export interface AgentContext {
  loop_id: string;
  iteration: number;
  narrative_id?: string;
  // Accumulated state from previous agents in this loop
  mentions?: NormalizedMention[];
  narratives?: Narrative[];
  // Feedback from validator if re-looping
  feedback?: string;
  // Convergence flags
  converged?: boolean;
}

export interface AgentResult<T = unknown> {
  agent: AgentName;
  status: AgentStatus;
  output: T;
  summary: string;
  metrics: Record<string, number | string>;
  duration_ms: number;
  // Should the orchestrator re-loop?
  request_reloop: boolean;
  reloop_reason?: string;
}

// ─── SSE events ──────────────────────────────────────────────────────────
export type SSEEvent =
  | { type: 'hello'; ts: number; loop_id: string }
  | { type: 'ping'; ts: number }
  | { type: 'agent_activity'; activity: AgentActivity }
  | { type: 'narrative_update'; narrative: Narrative }
  | { type: 'mention_new'; mention: NormalizedMention; narrative_id: string }
  | { type: 'loop_iteration'; loop_id: string; iteration: number; agent: AgentName; status: AgentStatus }
  | { type: 'convergence'; loop_id: string; narrative_id: string; iterations: number }
  | { type: 'phase_change'; narrative_id: string; old_phase: Phase; new_phase: Phase; confidence: number };

// ─── Source adapter contract ─────────────────────────────────────────────
export interface SourceAdapter {
  name: SourceType;
  fetch(query: string, opts?: { maxResults?: number }): Promise<NormalizedMention[]>;
}

// ─── Phase configuration (semantic colors) ───────────────────────────────
export const PHASE_CONFIG = {
  forming:  { label: 'FORMING',  icon: '◇', color: '#FBBF24', glow: 'rgba(251,191,36,0.20)' },
  rising:   { label: 'RISING',   icon: '▲', color: '#2DD4BF', glow: 'rgba(46,212,191,0.25)' },
  formed:   { label: 'PEAKED',   icon: '●', color: '#94A3B8', glow: 'rgba(148,163,184,0.15)' },
  decaying: { label: 'DECAYING', icon: '▽', color: '#F87171', glow: 'rgba(248,113,113,0.20)' },
} as const;

export const LEGITIMACY_CONFIG = {
  LEGIT:          { color: '#2DD4BF', label: 'LEGIT' },
  BOT_CAMPAIGN:   { color: '#F87171', label: 'BOT' },
  TWITTER_NATIVE: { color: '#FBBF24', label: 'NATIVE' },
  PRE_BURST:      { color: '#5EEAD4', label: 'PRE-BURST' },
  NOISE:          { color: '#484F58', label: 'NOISE' },
  UNCERTAIN:      { color: '#7D8590', label: 'UNCERTAIN' },
} as const;
