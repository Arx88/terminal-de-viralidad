/**
 * Bluesky adapter.
 *
 * Strategy: poll the public AppView search endpoint. The doc declares a
 * firehose (Jetstream WS) as the primary ingestion path, but for a stateless
 * REST adapter we use searchPosts with a multi-keyword OR query — this gives
 * us a steady stream of recent public posts without needing a long-lived
 * WebSocket connection.
 *
 * Endpoint: GET https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts
 *            ?q=AI+OR+crypto+OR+fusion+OR+regulation&limit=50&sort=latest
 */
import type { RawMention } from '@/lib/types'
import type { SourceConfig } from '@/lib/server/config/sources'
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
// Bluesky searchPosts response shape (subset)
// ---------------------------------------------------------------------------
interface BskyAuthor {
  did: string
  handle: string
  displayName?: string
}

interface BskyPost {
  uri: string // at://did:plc:.../app.bsky.feed.post/{rkey}
  cid: string
  author: BskyAuthor
  record: {
    text: string
    createdAt: string
    langs?: string[]
    replyCount?: number
    repostCount?: number
    likeCount?: number
  }
}

interface BskySearchResponse {
  posts: BskyPost[]
  cursor?: string
}

const QUERY = 'AI OR crypto OR fusion OR regulation'
const LIMIT = 50

export class BlueskyAdapter implements Adapter {
  readonly source = 'bluesky' as const
  private firstFetch = true

  constructor(
    private readonly config: SourceConfig,
    private readonly bucket: TokenBucket,
    private readonly breaker: CircuitBreaker,
    private readonly logger: AdapterLogger = consoleLogger,
  ) {}

  async fetch(): Promise<AdapterFetchResult> {
    if (this.firstFetch) {
      this.logger.info('Bluesky adapter first fetch', { query: QUERY, limit: LIMIT })
      this.firstFetch = false
    }

    if (!this.bucket.tryConsume(this.source)) {
      this.logger.warn('Bluesky rate-limited by token bucket', {
        msUntilAvailable: this.bucket.msUntilAvailable(this.source),
      })
      return { mentions: [], meta: { rateLimited: true } }
    }
    if (!this.breaker.allow(this.source)) {
      this.logger.warn('Bluesky circuit open', { state: this.breaker.status(this.source) })
      return { mentions: [], meta: { circuitOpen: true } }
    }

    const url: string =
      `${this.config.baseUrl}/xrpc/app.bsky.feed.searchPosts` +
      `?q=${encodeURIComponent(QUERY)}&limit=${LIMIT}&sort=latest`

    let response: BskySearchResponse
    try {
      response = await retryWithBackoff(
        () => httpFetch<BskySearchResponse>(this.config, url),
        this.config.retry,
        (attempt, status) => {
          if (attempt > 1) this.logger.warn('Bluesky retry', { attempt, status })
        },
      )
    } catch (err) {
      this.breaker.recordFailure(this.source)
      throw err
    }

    this.breaker.recordSuccess(this.source)

    const posts: BskyPost[] = Array.isArray(response.posts) ? response.posts : []
    const mentions: RawMention[] = []
    for (const post of posts) {
      if (!post.uri || !post.author || !post.record) continue
      mentions.push(mapPost(post))
    }

    return {
      mentions,
      meta: {
        total: posts.length,
        cursor: response.cursor,
      },
    }
  }
}

function mapPost(post: BskyPost): RawMention {
  const text: string = post.record.text ?? ''
  const normalized: string = normalizeText(text)
  const rkey: string = post.uri.split('/').pop() ?? post.uri
  const handle: string = post.author.handle ?? post.author.did
  const url: string = `https://bsky.app/profile/${handle}/post/${rkey}`
  return {
    contentHash: xxhash64(`${post.uri}|${normalized}`),
    source: 'bluesky',
    externalId: post.uri,
    authorId: post.author.did,
    authorHandle: handle,
    text,
    language: post.record.langs?.[0],
    publishedAt: post.record.createdAt,
    url,
    rawPayload: JSON.stringify(post),
  }
}
