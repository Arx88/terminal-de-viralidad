/**
 * Reddit adapter.
 *
 * Strategy: poll the public JSON endpoint for each watchlist subreddit.
 * No OAuth (the doc declares OAuth2 client_credentials but Reddit's .json
 * endpoint serves anonymous reads just fine with a descriptive UA — that's
 * what we use here; OAuth can be layered in later without changing the
 * adapter shape).
 *
 * Endpoint per subreddit: GET https://www.reddit.com/r/{sub}/hot.json?limit=25
 * Reddit returns 429 if the User-Agent is missing or default — http.ts
 * already sets `virahub/1.0 (+https://terminal-de-viralidad.vercel.app)`.
 */
import type { RawMention } from '@/lib/types'
import type { SourceConfig } from '@/lib/server/config/sources'
import { WATCHLIST } from '@/lib/server/config/sources'
import {
  CircuitBreaker,
  RetryExhaustedError,
  TokenBucket,
  retryWithBackoff,
} from '@/lib/server/config/resilience'
import { httpFetch } from '@/lib/server/adapters/http'
import { xxhash64 } from '@/lib/server/adapters/hash'
import { normalizeText } from '@/lib/server/adapters/normalize'
import type { Adapter, AdapterFetchResult, AdapterLogger } from '@/lib/server/adapters/base'
import { consoleLogger } from '@/lib/server/adapters/base'

// ---------------------------------------------------------------------------
// Reddit JSON shape (only fields we touch)
// ---------------------------------------------------------------------------
interface RedditPost {
  id: string
  author: string | null
  title: string
  selftext?: string
  created_utc: number
  url: string
  preview?: unknown
  is_video?: boolean
  removed_by_category?: string | null
  banned_at_utc?: number | null
  permalink?: string
}

interface RedditListing {
  data: {
    children: Array<{ data: RedditPost }>
    after: string | null
  }
}

const SUBREDDITS: readonly string[] = WATCHLIST.subreddits

export class RedditAdapter implements Adapter {
  readonly source = 'reddit' as const
  private firstFetch = true

  constructor(
    private readonly config: SourceConfig,
    private readonly bucket: TokenBucket,
    private readonly breaker: CircuitBreaker,
    private readonly logger: AdapterLogger = consoleLogger,
  ) {}

  async fetch(): Promise<AdapterFetchResult> {
    if (this.firstFetch) {
      this.logger.info('Reddit adapter first fetch', { subreddits: SUBREDDITS })
      this.firstFetch = false
    }

    if (!this.bucket.tryConsume(this.source)) {
      this.logger.warn('Reddit rate-limited by token bucket', {
        msUntilAvailable: this.bucket.msUntilAvailable(this.source),
      })
      return { mentions: [], meta: { rateLimited: true } }
    }
    if (!this.breaker.allow(this.source)) {
      this.logger.warn('Reddit circuit open', { state: this.breaker.status(this.source) })
      return { mentions: [], meta: { circuitOpen: true } }
    }

    const mentions: RawMention[] = []
    let fetched = 0
    let skipped = 0
    let subFailures = 0
    let lastRetryError: RetryExhaustedError | null = null
    const lastAfterBySub: Record<string, string | null> = {}

    for (const sub of SUBREDDITS) {
      const url: string = `${this.config.baseUrl}/r/${sub}/hot.json?limit=25`
      try {
        const listing: RedditListing = await retryWithBackoff(
          () => httpFetch<RedditListing>(this.config, url),
          this.config.retry,
          (attempt, status) => {
            if (attempt > 1) this.logger.warn('Reddit retry', { sub, attempt, status })
          },
        )
        lastAfterBySub[sub] = listing.data.after
        for (const child of listing.data.children) {
          const post: RedditPost = child.data
          if (isRemovedOrDeleted(post)) {
            skipped++
            continue
          }
          mentions.push(mapPost(post))
          fetched++
        }
      } catch (err: unknown) {
        subFailures++
        if (err instanceof RetryExhaustedError) {
          lastRetryError = err
        }
        const msg: string = err instanceof Error ? err.message : String(err)
        this.logger.warn('Reddit sub fetch failed', { sub, error: msg })
      }
    }

    // No data collected — decide between throwing (retry-exhausted) vs
    // returning empty (all subs 4xx'd cleanly, e.g. all 404).
    if (fetched === 0) {
      this.breaker.recordFailure(this.source)
      if (lastRetryError) throw lastRetryError
      return {
        mentions: [],
        meta: { allSubsFailed: true, subFailures, skipped },
      }
    }

    this.breaker.recordSuccess(this.source)
    return {
      mentions,
      meta: {
        subreddits: SUBREDDITS.length,
        fetched,
        skipped,
        subFailures,
        lastAfterBySub,
      },
    }
  }
}

function isRemovedOrDeleted(post: RedditPost): boolean {
  if (!post.author || post.author === '[deleted]' || post.author === '[removed]') return true
  if (post.removed_by_category) return true
  if (post.banned_at_utc && post.banned_at_utc > 0) return true
  return false
}

function mapPost(post: RedditPost): RawMention {
  const title: string = post.title ?? ''
  const selftext: string = post.selftext ?? ''
  const text: string = selftext ? `${title}\n\n${selftext}` : title
  const normalized: string = normalizeText(text)
  const contentHash: string = xxhash64(`${post.id}|${normalized}`)
  const url: string = post.permalink
    ? `https://www.reddit.com${post.permalink}`
    : post.url
  return {
    contentHash,
    source: 'reddit',
    externalId: post.id,
    authorId: post.author ?? 'unknown',
    authorHandle: post.author ? `u/${post.author}` : undefined,
    text,
    publishedAt: new Date(post.created_utc * 1000).toISOString(),
    url,
    hasMedia: !!(post.preview || post.is_video),
    rawPayload: JSON.stringify(post),
  }
}
