/**
 * Hacker News adapter (Firebase REST).
 *
 * Strategy: pull the top-30 story ids from /v0/topstories.json, then fetch
 * each item individually. Firebase has no documented rate limit; we self-limit
 * via the per-source TokenBucket (1 token consumed per fetch() batch, not per
 * item — see design notes in adapters/base.ts).
 *
 * Endpoints:
 *   GET https://hacker-news.firebaseio.com/v0/topstories.json       -> number[]
 *   GET https://hacker-news.firebaseio.com/v0/item/{id}.json        -> HnItem
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
// HN item shape (subset of the documented Firebase schema)
// ---------------------------------------------------------------------------
interface HnItem {
  id: number
  type?: string
  by?: string
  time?: number
  title?: string
  url?: string
  text?: string // HTML, present on Ask HN self-posts
  score?: number
  descendants?: number
  kids?: number[]
}

const TOP_N = 30

export class HnAdapter implements Adapter {
  readonly source = 'hn' as const
  private firstFetch = true

  constructor(
    private readonly config: SourceConfig,
    private readonly bucket: TokenBucket,
    private readonly breaker: CircuitBreaker,
    private readonly logger: AdapterLogger = consoleLogger,
  ) {}

  async fetch(): Promise<AdapterFetchResult> {
    if (this.firstFetch) {
      this.logger.info('HN adapter first fetch', { topN: TOP_N })
      this.firstFetch = false
    }

    if (!this.bucket.tryConsume(this.source)) {
      this.logger.warn('HN rate-limited by token bucket', {
        msUntilAvailable: this.bucket.msUntilAvailable(this.source),
      })
      return { mentions: [], meta: { rateLimited: true } }
    }
    if (!this.breaker.allow(this.source)) {
      this.logger.warn('HN circuit open', { state: this.breaker.status(this.source) })
      return { mentions: [], meta: { circuitOpen: true } }
    }

    const topUrl: string = `${this.config.baseUrl}/topstories.json`
    let ids: number[]
    try {
      ids = await retryWithBackoff(
        () => httpFetch<number[]>(this.config, topUrl),
        this.config.retry,
        (attempt, status) => {
          if (attempt > 1) this.logger.warn('HN topstories retry', { attempt, status })
        },
      )
    } catch (err) {
      this.breaker.recordFailure(this.source)
      throw err
    }

    if (!Array.isArray(ids)) {
      this.breaker.recordFailure(this.source)
      throw new RetryExhaustedError(
        'HN topstories returned non-array payload',
        undefined,
        1,
      )
    }

    const top: number[] = ids.slice(0, TOP_N)
    const mentions: RawMention[] = []
    let itemFailures = 0
    let lastRetryError: RetryExhaustedError | null = null

    for (const id of top) {
      const itemUrl: string = `${this.config.baseUrl}/item/${id}.json`
      try {
        const item: HnItem = await retryWithBackoff(
          () => httpFetch<HnItem>(this.config, itemUrl),
          this.config.retry,
          (attempt, status) => {
            if (attempt > 1) this.logger.warn('HN item retry', { id, attempt, status })
          },
        )
        // Deleted / removed items come back as `null` from Firebase.
        if (!item || !item.id || !item.title) continue
        mentions.push(mapItem(item))
      } catch (err: unknown) {
        itemFailures++
        if (err instanceof RetryExhaustedError) lastRetryError = err
        const msg: string = err instanceof Error ? err.message : String(err)
        this.logger.warn('HN item fetch failed', { id, error: msg })
      }
    }

    if (mentions.length === 0) {
      this.breaker.recordFailure(this.source)
      if (lastRetryError) throw lastRetryError
      return { mentions: [], meta: { allItemsFailed: true, itemFailures, topN: top.length } }
    }

    this.breaker.recordSuccess(this.source)
    return {
      mentions,
      meta: {
        topN: top.length,
        fetched: mentions.length,
        itemFailures,
      },
    }
  }
}

function mapItem(item: HnItem): RawMention {
  const title: string = item.title ?? ''
  const urlSuffix: string = item.url ? ` — ${item.url}` : ''
  const text: string = item.text ? `${title}\n\n${stripHtml(item.text)}${urlSuffix}` : `${title}${urlSuffix}`
  const normalized: string = normalizeText(text)
  const idStr: string = String(item.id)
  const by: string = item.by ?? 'unknown'
  const url: string = item.url ?? `https://news.ycombinator.com/item?id=${idStr}`
  return {
    contentHash: xxhash64(`${idStr}|${normalized}`),
    source: 'hn',
    externalId: idStr,
    authorId: by,
    authorHandle: `user/${by}`,
    text,
    publishedAt: new Date((item.time ?? 0) * 1000).toISOString(),
    url,
    rawPayload: JSON.stringify(item),
  }
}

/** Strip HTML tags from HN self-post text (which arrives as raw HTML). */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
