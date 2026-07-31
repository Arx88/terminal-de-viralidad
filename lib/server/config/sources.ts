/**
 * Per-source configuration: endpoints, rate limits, auth.
 * Every value here is documented in doc_backend_extracted.md.
 */
import type { SourceKey } from '@/lib/types'

export interface SourceConfig {
  source: SourceKey
  name: string
  /** Base URL for the public API. */
  baseUrl: string
  /** Requests per minute allowed (token bucket capacity). */
  ratePerMinute: number
  /** Burst capacity (token bucket). */
  burst: number
  /** Circuit breaker config. */
  circuit: {
    failureThreshold: number
    cooldownMs: number
    halfOpenProbes: number
    successThreshold: number
  }
  /** Retry config. */
  retry: {
    maxAttempts: number
    baseDelayMs: number
    jitterPct: number // 0..1
    retryableStatuses: number[]
  }
  /** Request timeout ms. */
  timeoutMs: number
  /** Whether this source requires an API key (and env var name). */
  requiresApiKey?: {
    envVar: string
    headerName: string
    headerPrefix?: string
  }
  /** Default poll cadence ms (when no realtime push available). */
  pollMs: number
  /** Verbs the UI shows while this engine is scanning. */
  verbs: string[]
}

export const SOURCE_CONFIGS: Record<SourceKey, SourceConfig> = {
  reddit: {
    source: 'reddit',
    name: 'Reddit',
    baseUrl: 'https://www.reddit.com',
    ratePerMinute: 60,
    burst: 10,
    circuit: { failureThreshold: 5, cooldownMs: 30000, halfOpenProbes: 2, successThreshold: 3 },
    retry: { maxAttempts: 3, baseDelayMs: 800, jitterPct: 0.25, retryableStatuses: [429, 500, 502, 503, 504] },
    timeoutMs: 10000,
    pollMs: 60000,
    verbs: ['Extrayendo…', 'Rastreando…', 'Leyendo hilos…'],
  },
  bluesky: {
    source: 'bluesky',
    name: 'Bluesky',
    baseUrl: 'https://public.api.bsky.app',
    ratePerMinute: 120,
    burst: 15,
    circuit: { failureThreshold: 5, cooldownMs: 30000, halfOpenProbes: 2, successThreshold: 3 },
    retry: { maxAttempts: 3, baseDelayMs: 600, jitterPct: 0.25, retryableStatuses: [429, 500, 502, 503, 504] },
    timeoutMs: 10000,
    pollMs: 45000,
    verbs: ['Analizando…', 'Escuchando…', 'Midiendo señal…'],
  },
  hn: {
    source: 'hn',
    name: 'Hacker News',
    baseUrl: 'https://hacker-news.firebaseio.com/v0',
    ratePerMinute: 120,
    burst: 20,
    circuit: { failureThreshold: 5, cooldownMs: 30000, halfOpenProbes: 2, successThreshold: 3 },
    retry: { maxAttempts: 3, baseDelayMs: 400, jitterPct: 0.25, retryableStatuses: [429, 500, 502, 503, 504] },
    timeoutMs: 8000,
    pollMs: 60000,
    verbs: ['Clasificando…', 'Puntuando…', 'Ordenando…'],
  },
  rss: {
    source: 'rss',
    name: 'RSS Feeds',
    baseUrl: '', // per-feed URL
    ratePerMinute: 90,
    burst: 15,
    circuit: { failureThreshold: 4, cooldownMs: 60000, halfOpenProbes: 2, successThreshold: 3 },
    retry: { maxAttempts: 2, baseDelayMs: 1000, jitterPct: 0.25, retryableStatuses: [429, 500, 502, 503, 504] },
    timeoutMs: 12000,
    pollMs: 120000,
    verbs: ['Indexando…', 'Sincronizando…', 'Deduplicando…'],
  },
  gdelt: {
    source: 'gdelt',
    name: 'GDELT',
    baseUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
    ratePerMinute: 30,
    burst: 5,
    circuit: { failureThreshold: 4, cooldownMs: 60000, halfOpenProbes: 2, successThreshold: 3 },
    retry: { maxAttempts: 2, baseDelayMs: 1500, jitterPct: 0.25, retryableStatuses: [429, 500, 502, 503, 504] },
    timeoutMs: 15000,
    pollMs: 90000,
    verbs: ['Procesando…', 'Traduciendo…', 'Geolocalizando…'],
  },
  github: {
    source: 'github',
    name: 'GitHub',
    baseUrl: 'https://api.github.com',
    ratePerMinute: 30,
    burst: 5,
    circuit: { failureThreshold: 4, cooldownMs: 60000, halfOpenProbes: 2, successThreshold: 3 },
    retry: { maxAttempts: 3, baseDelayMs: 800, jitterPct: 0.25, retryableStatuses: [429, 500, 502, 503, 504] },
    timeoutMs: 10000,
    pollMs: 90000,
    requiresApiKey: { envVar: 'GITHUB_TOKEN', headerName: 'Authorization', headerPrefix: 'Bearer ' },
    verbs: ['Verificando…', 'Comparando…', 'Vigilando repos…'],
  },
  x: {
    source: 'x',
    name: 'X (Twitter)',
    baseUrl: 'https://api.twitter.com/2',
    ratePerMinute: 30,
    burst: 5,
    circuit: { failureThreshold: 3, cooldownMs: 120000, halfOpenProbes: 1, successThreshold: 3 },
    retry: { maxAttempts: 2, baseDelayMs: 1200, jitterPct: 0.25, retryableStatuses: [429, 500, 502, 503, 504] },
    timeoutMs: 10000,
    pollMs: 60000,
    requiresApiKey: { envVar: 'X_BEARER_TOKEN', headerName: 'Authorization', headerPrefix: 'Bearer ' },
    verbs: ['Escaneando…', 'Monitoreando…', 'Detectando…'],
  },
}

/** Default keyword/subreddit watchlist (used by adapters to seed polling). */
export const WATCHLIST = {
  subreddits: ['technology', 'worldnews', 'programming', 'science', 'artificial', 'cryptocurrency'],
  bskyAuthors: ['bsky.app', 'fediverse.report', 'andrew.conrad.io'],
  hnKeywords: ['ai', 'crypto', 'fusion', 'regulation', 'gpu', 'chip', 'satellite'],
  rssFeeds: [
    'https://hnrss.org/frontpage.xml',
    'https://feeds.arstechnica.com/arstechnica/index.xml',
    'https://www.theverge.com/rss/index.xml',
    'https://techcrunch.com/feed/',
    'https://www.wired.com/feed/rss',
  ],
  gdeltThemes: ['ENV_MINE', 'TECH_AI', 'ECON_BANKRUPT', 'HEALTH_DISEASE', 'MILITARY'],
  githubTopics: ['llm', 'agent', 'crypto-exchange', 'fusion', 'satellite'],
  xUsernames: [], // requires API access
}
