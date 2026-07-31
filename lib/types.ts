/**
 * Shared domain types — the single source of truth consumed by
 * backend services, API routes, and frontend hooks.
 *
 * End-to-end typing: DB (Prisma) → Service → API → SSE → Frontend hook → Component.
 */

// ---------------------------------------------------------------------------
// Sources & engines
// ---------------------------------------------------------------------------
export type SourceKey =
  | 'reddit'
  | 'bluesky'
  | 'hn'
  | 'rss'
  | 'gdelt'
  | 'github'
  | 'x'

export const ALL_SOURCES: SourceKey[] = [
  'reddit',
  'bluesky',
  'hn',
  'rss',
  'gdelt',
  'github',
  'x',
]

export type EngineHealth = 'online' | 'degraded' | 'offline'
export type CircuitState = 'closed' | 'open' | 'half_open'

export type Shape = 'accel' | 'rise' | 'flat' | 'decay' | 'wobble'
export type Phase = 'forming' | 'rising' | 'peaked' | 'decaying'
export type TrendTone = 'hot' | 'cool' | 'mint' | 'muted'
export type TrendDir = 'up' | 'down' | 'flat'
export type RangeKey = '1H' | '6H' | '24H' | '7D'

// ---------------------------------------------------------------------------
// Raw mention (post-adapter, pre-dedup)
// ---------------------------------------------------------------------------
export interface RawMention {
  /** Stable content hash (xxhash64 of normalized text). */
  contentHash: string
  source: SourceKey
  externalId: string
  authorId: string
  authorHandle?: string
  text: string
  language?: string
  publishedAt: string // ISO UTC
  url?: string
  hasMedia?: boolean
  mediaUrls?: string[]
  /** Raw payload from upstream, JSON-stringified. */
  rawPayload: string
}

// ---------------------------------------------------------------------------
// Cluster (DB row + derived fields)
// ---------------------------------------------------------------------------
export interface Cluster {
  id: string
  signatureHash: string
  title: string
  summary: string
  primarySource: SourceKey
  sources: SourceKey[]
  languages: string[]
  entities: Entity[]
  firstSeen: string
  lastSeen: string
  mentionsCount: number
  uniqueAuthors: number
  shape: Shape
  phase: Phase
  velocity: number
  score: number
  originator?: {
    source: SourceKey
    author: string
    url?: string
    lagSeconds?: number
  }
  trashPenalty: number
  isTrending: boolean
  /** Per-source mention counts. */
  sourceCounts: Record<SourceKey, number>
  /** Optional history (last N buckets) — only sent when explicitly requested. */
  history?: { ts: string; score: number; mentions: number; velocity: number }[]
}

// ---------------------------------------------------------------------------
// Entity extraction (NER)
// ---------------------------------------------------------------------------
export type EntityType =
  | 'brand'
  | 'product'
  | 'model'
  | 'url'
  | 'cve'
  | 'person'
  | 'org'
  | 'location'
  | 'hashtag'
  | 'cashtag'

export interface Entity {
  type: EntityType
  value: string
}

// ---------------------------------------------------------------------------
// Trend — frontend-facing projection of a Cluster
// (Strictly typed to match lib/virahub-data.ts Trend but with backend fields)
// ---------------------------------------------------------------------------
export interface Trend {
  id: string
  title: string
  source: SourceKey
  color: string
  status: string
  tone: TrendTone
  dir: TrendDir
  time: string
  heat: string
  confidence: number
  mentions: number
  delta: number
  shape: Shape
  why: string
  evidence: { label: string; value: string }[]
  inTimeline?: boolean
  /** Backend-only enriched fields (optional, sent by /trends/:id detail). */
  phase?: Phase
  velocity?: number
  uniqueAuthors?: number
  firstSeen?: string
  lastSeen?: string
  originator?: Cluster['originator']
  sources?: SourceKey[]
  sourceCounts?: Record<SourceKey, number>
  tags?: string[]
  hasMedia?: boolean
  history?: { ts: string; score: number; mentions: number; velocity: number }[]
  trashPenalty?: number
}

// ---------------------------------------------------------------------------
// Briefing — AI-generated analysis of a trend
// ---------------------------------------------------------------------------
export interface AnalysisBriefing {
  clusterId: string
  narrative: string
  keyPoints: string[]
  riskFlags: string[]
  confidence: number
  model: string
  tokensUsed: number
  latencyMs: number
  rangeKey: RangeKey
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Engine status (DB row + derived)
// ---------------------------------------------------------------------------
export interface EngineStatusDTO {
  id: string
  source: SourceKey
  name: string
  enabled: boolean
  health: EngineHealth
  circuitState: CircuitState
  lastRunAt: string | null
  itemsIngested: number
  itemsTotal: number
  errorsLast24h: number
  latencyMs: number
  /** Pending items in queue. */
  pending: number
  /** Recent log entries (max 50). */
  recentLogs: EngineLogDTO[]
}

export interface EngineLogDTO {
  id: string
  source: SourceKey
  level: 'info' | 'warn' | 'error'
  message: string
  meta?: Record<string, unknown>
  ts: string
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
export type AlertCondition =
  | 'score_gt'
  | 'velocity_gt'
  | 'mentions_gt'
  | 'phase_is'
  | 'delta_pct_gt'

export type AlertChannel = 'toast' | 'email' | 'webhook'

export interface AlertRuleDTO {
  id: string
  clusterId: string | null
  label: string
  condition: AlertCondition
  threshold: string
  channel: AlertChannel
  armed: boolean
  lastFiredAt: string | null
  cooldownSec: number
  fireCount: number
  createdAt: string
  updatedAt: string
}

export interface AlertTriggerDTO {
  id: string
  ruleId: string
  value: Record<string, unknown>
  ts: string
}

// ---------------------------------------------------------------------------
// Saved trends
// ---------------------------------------------------------------------------
export interface SavedTrendDTO {
  id: string
  clusterId: string
  cluster: Trend
  folder: string | null
  notes: string | null
  pinned: boolean
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// SSE events — 11 types
// ---------------------------------------------------------------------------
export type SseEventType =
  | 'scan.tick'
  | 'trend.upserted'
  | 'trend.velocity_spike'
  | 'trend.phase_changed'
  | 'engine.status_changed'
  | 'engine.log_appended'
  | 'alert.triggered'
  | 'alert.acknowledged'
  | 'briefing.generated'
  | 'report.updated'
  | 'connection.heartbeat'

export interface SseEvent<T = unknown> {
  id: string // monotonic event id for Last-Event-ID resume
  type: SseEventType
  data: T
  ts: string
}

// ---------------------------------------------------------------------------
// API envelope (RFC 7807-inspired but simpler)
// ---------------------------------------------------------------------------
export interface ApiOk<T> {
  data: T
  meta?: {
    cursor?: string | null
    total?: number
    traceId?: string
  }
}

export interface ApiError {
  error: {
    type: string
    title: string
    status: number
    detail: string
    instance: string
    traceId: string
    issues?: Array<{ path: string; message: string }>
  }
}
