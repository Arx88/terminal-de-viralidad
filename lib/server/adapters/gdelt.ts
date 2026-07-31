/**
 * GDELT DOC 2.0 adapter.
 *
 * Strategy: poll the ArtList endpoint with a multi-keyword OR query, sorted by
 * date descending. GDELT returns articles aggregated from ~50k news sources
 * worldwide — every article carries the upstream URL + domain + seendate.
 *
 * Endpoint: GET https://api.gdeltproject.org/api/v2/doc/doc
 *            ?query=AI+OR+crypto+OR+fusion&mode=ArtList&maxrecords=50&format=json&sort=DateDesc
 *
 * GDELT quirks:
 *   - The Content-Type header is frequently text/plain even when the body is
 *     valid JSON. http.ts auto-detects JSON by body shape, so this works.
 *   - On rate-limit / overload, GDELT returns HTML ("rate limit" page) or an
 *     empty body. We treat unparseable bodies as an empty result set, not an
 *     error — this matches the spec "handle that gracefully".
 *   - seendate format is "YYYYMMDDTHHMMSSZ" (always UTC, always 15 chars).
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
// GDELT response shape
// ---------------------------------------------------------------------------
interface GdeltArticle {
  url?: string
  title?: string
  seendate?: string
  domain?: string
  language?: string
  sourcecountry?: string
  socialimage?: string
}

interface GdeltResponse {
  articles?: GdeltArticle[]
}

const QUERY = 'AI OR crypto OR fusion'
const MAX_RECORDS = 50

export class GdeltAdapter implements Adapter {
  readonly source = 'gdelt' as const
  private firstFetch = true

  constructor(
    private readonly config: SourceConfig,
    private readonly bucket: TokenBucket,
    private readonly breaker: CircuitBreaker,
    private readonly logger: AdapterLogger = consoleLogger,
  ) {}

  async fetch(): Promise<AdapterFetchResult> {
    if (this.firstFetch) {
      this.logger.info('GDELT adapter first fetch', { query: QUERY, maxRecords: MAX_RECORDS })
      this.firstFetch = false
    }

    if (!this.bucket.tryConsume(this.source)) {
      this.logger.warn('GDELT rate-limited by token bucket', {
        msUntilAvailable: this.bucket.msUntilAvailable(this.source),
      })
      return { mentions: [], meta: { rateLimited: true } }
    }
    if (!this.breaker.allow(this.source)) {
      this.logger.warn('GDELT circuit open', { state: this.breaker.status(this.source) })
      return { mentions: [], meta: { circuitOpen: true } }
    }

    const url: string =
      `${this.config.baseUrl}` +
      `?query=${encodeURIComponent(QUERY)}` +
      `&mode=ArtList&maxrecords=${MAX_RECORDS}` +
      `&format=json&sort=DateDesc`

    // GDELT frequently returns text/plain Content-Type with a JSON body, and
    // sometimes returns HTML/empty on overload. We let http.ts auto-detect and
    // accept either GdeltResponse (parsed) or string (raw fallback).
    let raw: GdeltResponse | string
    try {
      raw = await retryWithBackoff(
        () => httpFetch<GdeltResponse | string>(this.config, url),
        this.config.retry,
        (attempt, status) => {
          if (attempt > 1) this.logger.warn('GDELT retry', { attempt, status })
        },
      )
    } catch (err) {
      this.breaker.recordFailure(this.source)
      throw err
    }

    this.breaker.recordSuccess(this.source)

    // Graceful: non-JSON / HTML error page / empty body → empty result.
    const articles: GdeltArticle[] = extractArticles(raw)
    const mentions: RawMention[] = []
    for (const article of articles) {
      if (!article.url || !article.title) continue
      mentions.push(mapArticle(article))
    }

    return {
      mentions,
      meta: {
        total: articles.length,
        rawType: typeof raw === 'string' ? 'text' : 'json',
      },
    }
  }
}

/** Coerce the raw response (parsed JSON, string fallback, or empty) into articles[]. */
function extractArticles(raw: GdeltResponse | string): GdeltArticle[] {
  if (typeof raw === 'string') {
    // http.ts returned raw text — try to parse it as JSON; if that fails, return empty.
    const trimmed: string = raw.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed)
        if (parsed && typeof parsed === 'object') {
          const articles: unknown = (parsed as GdeltResponse).articles
          if (Array.isArray(articles)) return articles
        }
      } catch {
        // HTML error page or similar — return empty.
        return []
      }
    }
    return []
  }
  if (raw && typeof raw === 'object' && Array.isArray(raw.articles)) {
    return raw.articles
  }
  return []
}

function mapArticle(article: GdeltArticle): RawMention {
  const title: string = article.title ?? ''
  const seenDate: string = article.seendate ?? ''
  const text: string = seenDate ? `${title} — ${seenDate}` : title
  const normalized: string = normalizeText(text)
  const domain: string = article.domain ?? 'unknown'
  const externalId: string = article.url ?? title
  return {
    contentHash: xxhash64(`${externalId}|${normalized}`),
    source: 'gdelt',
    externalId,
    authorId: domain,
    authorHandle: domain,
    text,
    language: article.language,
    publishedAt: parseGdeltDate(seenDate),
    url: article.url,
    rawPayload: JSON.stringify(article),
  }
}

/**
 * Parse GDELT's seendate format "YYYYMMDDTHHMMSSZ" (always UTC) into ISO-8601.
 * Returns epoch-0 ISO on malformed input (rather than throwing) so we never
 * drop an article due to a date bug.
 */
function parseGdeltDate(s: string): string {
  if (!s) return new Date(0).toISOString()
  const m: RegExpMatchArray | null = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/)
  if (!m) {
    // Try Date.parse as a fallback for any non-standard seendate.
    const t: number = Date.parse(s)
    return Number.isNaN(t) ? new Date(0).toISOString() : new Date(t).toISOString()
  }
  const [, y, mo, d, h, mi, se] = m
  const dt: Date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se))
  return dt.toISOString()
}
