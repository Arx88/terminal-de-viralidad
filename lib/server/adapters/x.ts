/**
 * X (Twitter) adapter — API v2 recent search.
 *
 * Strategy: if `X_BEARER_TOKEN` is set, poll the recent-search endpoint for
 * the multi-keyword OR query. If the env var is missing, the adapter returns
 * an empty array and logs a warn — per the spec, "implement the adapter
 * correctly with real API calls but gracefully return an empty array when
 * the env var is missing".
 *
 * Endpoint: GET https://api.twitter.com/2/tweets/search/recent
 *            ?query=AI+OR+crypto+OR+fusion&max_results=50
 *            &tweet.fields=created_at,author_id,text,entities
 *
 * Auth: Bearer token. Without it the API returns 401 — non-retryable, so we
 * short-circuit before the retry loop to avoid burning the circuit.
 *
 * Note on the Free tier: as of 2024, free-tier X API cannot list recent
 * tweets (only 1 post per month / 1500 posts per month at Basic). The
 * adapter is written against the Basic-tier contract — it will return
 * whatever the API gives us, including a 403 / 401 if the tier doesn't
 * permit search.
 */
import type { RawMention } from '@/lib/types'
import type { SourceConfig } from '@/lib/server/config/sources'
import {
  CircuitBreaker,
  TokenBucket,
  retryWithBackoff,
} from '@/lib/server/config/resilience'
import { httpFetch } from '@/lib/server/adapters/http'
import { xxhash64 } from '@/lib/server/adapters/hash'
import { normalizeText } from '@/lib/server/adapters/normalize'
import type { Adapter, AdapterFetchResult, AdapterLogger } from '@/lib/server/adapters/base'
import { consoleLogger } from '@/lib/server/adapters/base'

// ---------------------------------------------------------------------------
// X API v2 response shape (subset)
// ---------------------------------------------------------------------------
interface XTweet {
  id: string
  author_id?: string
  text: string
  created_at: string
  entities?: Record<string, unknown>
  lang?: string
}

interface XSearchResponse {
  data?: XTweet[]
  meta?: {
    newest_id?: string
    oldest_id?: string
    result_count?: number
    next_token?: string
  }
}

const QUERY = 'AI OR crypto OR fusion'
const MAX_RESULTS = 50
const TWEET_FIELDS = 'created_at,author_id,text,entities'

export class XAdapter implements Adapter {
  readonly source = 'x' as const
  private firstFetch = true
  private warnedMissingToken = false

  constructor(
    private readonly config: SourceConfig,
    private readonly bucket: TokenBucket,
    private readonly breaker: CircuitBreaker,
    private readonly logger: AdapterLogger = consoleLogger,
  ) {}

  async fetch(): Promise<AdapterFetchResult> {
    const token: string | undefined = process.env.X_BEARER_TOKEN

    // Spec: if token is missing, log warn + return empty (don't throw).
    if (!token) {
      if (!this.warnedMissingToken) {
        this.logger.warn(
          'X adapter: X_BEARER_TOKEN not set — returning empty array. ' +
            'Set X_BEARER_TOKEN to enable X (Twitter) recent-search ingestion.',
        )
        this.warnedMissingToken = true
      }
      return {
        mentions: [],
        meta: { disabled: true, reason: 'missing_X_BEARER_TOKEN' },
      }
    }

    if (this.firstFetch) {
      this.logger.info('X adapter first fetch', { query: QUERY, maxResults: MAX_RESULTS })
      this.firstFetch = false
    }

    if (!this.bucket.tryConsume(this.source)) {
      this.logger.warn('X rate-limited by token bucket', {
        msUntilAvailable: this.bucket.msUntilAvailable(this.source),
      })
      return { mentions: [], meta: { rateLimited: true } }
    }
    if (!this.breaker.allow(this.source)) {
      this.logger.warn('X circuit open', { state: this.breaker.status(this.source) })
      return { mentions: [], meta: { circuitOpen: true } }
    }

    const url: string =
      `${this.config.baseUrl}/tweets/search/recent` +
      `?query=${encodeURIComponent(QUERY)}` +
      `&max_results=${MAX_RESULTS}` +
      `&tweet.fields=${encodeURIComponent(TWEET_FIELDS)}`

    let response: XSearchResponse
    try {
      response = await retryWithBackoff(
        () => httpFetch<XSearchResponse>(this.config, url),
        this.config.retry,
        (attempt, status) => {
          if (attempt > 1) this.logger.warn('X retry', { attempt, status })
        },
      )
    } catch (err) {
      this.breaker.recordFailure(this.source)
      throw err
    }

    this.breaker.recordSuccess(this.source)

    const tweets: XTweet[] = Array.isArray(response.data) ? response.data : []
    const mentions: RawMention[] = []
    for (const tweet of tweets) {
      if (!tweet.id || !tweet.text) continue
      mentions.push(mapTweet(tweet))
    }

    return {
      mentions,
      meta: {
        resultCount: response.meta?.result_count ?? tweets.length,
        newestId: response.meta?.newest_id,
        oldestId: response.meta?.oldest_id,
        nextToken: response.meta?.next_token,
      },
    }
  }
}

function mapTweet(tweet: XTweet): RawMention {
  const text: string = tweet.text ?? ''
  const normalized: string = normalizeText(text)
  return {
    contentHash: xxhash64(`${tweet.id}|${normalized}`),
    source: 'x',
    externalId: tweet.id,
    authorId: tweet.author_id ?? 'unknown',
    authorHandle: undefined, // search/recent doesn't return handle without expansions
    text,
    language: tweet.lang,
    publishedAt: tweet.created_at,
    url: `https://x.com/i/web/status/${tweet.id}`,
    rawPayload: JSON.stringify(tweet),
  }
}
