/**
 * RSS adapter.
 *
 * Strategy: poll a fixed watchlist of RSS 2.0 feeds. For each feed, fetch the
 * XML, parse with fast-xml-parser (attributes preserved under `@_` prefix),
 * normalize items into RawMention.
 *
 * Per the design contract:
 *   - bucket + breaker + retry wrap each feed's HTTP call.
 *   - A feed that 304s or 4xxs is skipped, not fatal.
 *   - If every feed fails AND at least one was retry-exhausted, throw.
 */
import { XMLParser } from 'fast-xml-parser'
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

const FEEDS: readonly string[] = WATCHLIST.rssFeeds

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Strip CDATA sections into plain text.
  cdataPropName: '__cdata',
  // Don't trim values — we'll do that ourselves.
  trimValues: false,
  // Allow numeric values to remain strings (we don't need parsing).
  parseTagValue: false,
  // Don't parse attribute values into numbers/booleans.
  parseAttributeValue: false,
  // Stop recursion at a reasonable depth.
  isArray: () => false,
})

// ---------------------------------------------------------------------------
// Item shape (permissive — RSS 2.0 + Atom, fields may be string or {#text})
// ---------------------------------------------------------------------------
type XmlValue = string | number | boolean | Record<string, unknown>
interface FeedItem {
  guid?: XmlValue
  link?: XmlValue
  author?: XmlValue
  'dc:creator'?: XmlValue
  title?: XmlValue
  description?: XmlValue
  'content:encoded'?: XmlValue
  contentSnippet?: XmlValue
  pubDate?: XmlValue
  published?: XmlValue
  updated?: XmlValue
  // Atom form: <link href="..."/> (no text)
  '@_href'?: XmlValue
}

export class RssAdapter implements Adapter {
  readonly source = 'rss' as const
  private firstFetch = true

  constructor(
    private readonly config: SourceConfig,
    private readonly bucket: TokenBucket,
    private readonly breaker: CircuitBreaker,
    private readonly logger: AdapterLogger = consoleLogger,
  ) {}

  async fetch(): Promise<AdapterFetchResult> {
    if (this.firstFetch) {
      this.logger.info('RSS adapter first fetch', { feeds: FEEDS.length })
      this.firstFetch = false
    }

    if (!this.bucket.tryConsume(this.source)) {
      this.logger.warn('RSS rate-limited by token bucket', {
        msUntilAvailable: this.bucket.msUntilAvailable(this.source),
      })
      return { mentions: [], meta: { rateLimited: true } }
    }
    if (!this.breaker.allow(this.source)) {
      this.logger.warn('RSS circuit open', { state: this.breaker.status(this.source) })
      return { mentions: [], meta: { circuitOpen: true } }
    }

    const mentions: RawMention[] = []
    let feedFailures = 0
    let lastRetryError: RetryExhaustedError | null = null
    const perFeed: Record<string, { items: number; ok: boolean }> = {}

    for (const feedUrl of FEEDS) {
      try {
        const xml: string = await retryWithBackoff(
          () => httpFetch<string>(this.config, feedUrl, { json: false }),
          this.config.retry,
          (attempt, status) => {
            if (attempt > 1) this.logger.warn('RSS retry', { feed: feedUrl, attempt, status })
          },
        )
        const items: FeedItem[] = extractItems(xml, feedUrl)
        for (const item of items) {
          const mapped = mapItem(item, feedUrl)
          if (mapped) mentions.push(mapped)
        }
        perFeed[feedUrl] = { items: items.length, ok: true }
      } catch (err: unknown) {
        feedFailures++
        if (err instanceof RetryExhaustedError) lastRetryError = err
        perFeed[feedUrl] = { items: 0, ok: false }
        const msg: string = err instanceof Error ? err.message : String(err)
        this.logger.warn('RSS feed fetch failed', { feed: feedUrl, error: msg })
      }
    }

    if (mentions.length === 0) {
      this.breaker.recordFailure(this.source)
      if (lastRetryError) throw lastRetryError
      return {
        mentions: [],
        meta: { allFeedsFailed: true, feedFailures, feedsTotal: FEEDS.length },
      }
    }

    this.breaker.recordSuccess(this.source)
    return {
      mentions,
      meta: {
        feedsTotal: FEEDS.length,
        feedFailures,
        itemsTotal: mentions.length,
        perFeed,
      },
    }
  }
}

/**
 * Parse the feed XML and return a flat array of item/entry objects.
 * Handles RSS 2.0 (rss.channel.item) and Atom (feed.entry).
 */
function extractItems(xml: string, feedUrl: string): FeedItem[] {
  let parsed: unknown
  try {
    parsed = xmlParser.parse(xml)
  } catch (err: unknown) {
    const msg: string = err instanceof Error ? err.message : String(err)
    throw new RetryExhaustedError(`RSS parse error for ${feedUrl}: ${msg}`, undefined, 1)
  }
  if (!parsed || typeof parsed !== 'object') return []

  const root: Record<string, unknown> = parsed as Record<string, unknown>

  // RSS 2.0: rss.channel.item[]
  const rss: unknown = root.rss
  if (rss && typeof rss === 'object') {
    const channel: unknown = (rss as Record<string, unknown>).channel
    if (channel && typeof channel === 'object') {
      const itemsRaw: unknown = (channel as Record<string, unknown>).item
      return normalizeItemArray(itemsRaw)
    }
  }

  // Atom: feed.entry[]
  if (root.feed && typeof root.feed === 'object') {
    const entries: unknown = (root.feed as Record<string, unknown>).entry
    return normalizeItemArray(entries)
  }

  // RDF (RSS 1.0): rdf:RDF.item[]
  if (root['rdf:RDF'] && typeof root['rdf:RDF'] === 'object') {
    const itemsRaw: unknown = (root['rdf:RDF'] as Record<string, unknown>).item
    return normalizeItemArray(itemsRaw)
  }

  return []
}

/** Ensure the parsed items value is always an array (XMLParser returns single object if 1 item). */
function normalizeItemArray(itemsRaw: unknown): FeedItem[] {
  if (!itemsRaw) return []
  if (Array.isArray(itemsRaw)) return itemsRaw as FeedItem[]
  if (typeof itemsRaw === 'object') return [itemsRaw as FeedItem]
  return []
}

/** Extract a string from an RSS value (string OR { '#text': ... } OR { '__cdata': ... }). */
function asString(v: XmlValue | undefined): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  // Object form: look for #text, __cdata, or @_href
  const obj: Record<string, unknown> = v as Record<string, unknown>
  if (typeof obj['__cdata'] === 'string') return obj['__cdata']
  if (typeof obj['#text'] === 'string') return obj['#text']
  if (typeof obj['@_href'] === 'string') return obj['@_href']
  return ''
}

function mapItem(item: FeedItem, feedUrl: string): RawMention | null {
  const title: string = asString(item.title)
  const description: string =
    asString(item.description) ||
    asString(item['content:encoded']) ||
    asString(item.contentSnippet)
  const link: string = asString(item.link) || asString(item['@_href'])
  const guid: string = asString(item.guid) || link
  if (!guid && !title) return null

  const text: string = description ? `${title} — ${stripHtml(description)}` : title
  const publishedRaw: string = asString(item.pubDate) || asString(item.published) || asString(item.updated)
  const publishedAt: string = parseRfc822(publishedRaw)

  const author: string = asString(item.author) || asString(item['dc:creator']) || 'unknown'
  const normalized: string = normalizeText(text)
  const externalId: string = guid || link || `${feedUrl}|${title}`

  return {
    contentHash: xxhash64(`${externalId}|${normalized}`),
    source: 'rss',
    externalId,
    authorId: author,
    authorHandle: author !== 'unknown' ? author : undefined,
    text,
    publishedAt,
    url: link || undefined,
    rawPayload: JSON.stringify(item),
  }
}

/** Parse RFC-822 pubDate (e.g. "Wed, 02 Oct 2024 13:14:15 GMT") with graceful fallback. */
function parseRfc822(raw: string): string {
  if (!raw) return new Date(0).toISOString()
  const t: number = Date.parse(raw)
  if (Number.isNaN(t)) return new Date(0).toISOString()
  return new Date(t).toISOString()
}

/** Strip HTML tags + decode common entities from RSS description fields. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
