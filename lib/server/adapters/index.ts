/**
 * Adapter factory — instantiates the 7 source adapters with their per-source
 * resilience primitives (TokenBucket + CircuitBreaker) wired from SOURCE_CONFIGS.
 *
 * Usage:
 *   const adapters = getAdapters()
 *   for (const key of ALL_SOURCES) {
 *     const result = await adapters[key].fetch()
 *     // result.mentions → downstream pipeline
 *   }
 *
 * Re-exports the xxhash64 helper for downstream callers (contentHash on
 * dedup, simhash seeding, etc.).
 */
import type { SourceKey } from '@/lib/types'
import { ALL_SOURCES } from '@/lib/types'
import { SOURCE_CONFIGS } from '@/lib/server/config/sources'
import { CircuitBreaker, TokenBucket } from '@/lib/server/config/resilience'

import type { Adapter, AdapterLogger } from '@/lib/server/adapters/base'
import { consoleLogger } from '@/lib/server/adapters/base'
import { RedditAdapter } from '@/lib/server/adapters/reddit'
import { BlueskyAdapter } from '@/lib/server/adapters/bluesky'
import { HnAdapter } from '@/lib/server/adapters/hn'
import { RssAdapter } from '@/lib/server/adapters/rss'
import { GdeltAdapter } from '@/lib/server/adapters/gdelt'
import { GithubAdapter } from '@/lib/server/adapters/github'
import { XAdapter } from '@/lib/server/adapters/x'

export { xxhash64 } from '@/lib/server/adapters/hash'
export { normalizeText } from '@/lib/server/adapters/normalize'
export type {
  Adapter,
  AdapterFetchResult,
  AdapterLogger,
} from '@/lib/server/adapters/base'

export interface GetAdaptersOptions {
  /** Override the default console logger (e.g. with the centralized ingest sink). */
  logger?: AdapterLogger
  /** Per-source overrides (useful for tests). */
  buckets?: Partial<Record<SourceKey, TokenBucket>>
  breakers?: Partial<Record<SourceKey, CircuitBreaker>>
}

/**
 * Build a Record<SourceKey, Adapter> with all 7 adapters wired up.
 *
 * Each adapter gets:
 *   - Its SourceConfig from SOURCE_CONFIGS.
 *   - A dedicated TokenBucket (capacity = config.burst, refill = ratePerMinute/60 per second).
 *   - A dedicated CircuitBreaker (config = config.circuit).
 *   - The provided logger (defaults to console).
 *
 * Bucket/breaker instances are scoped to this call — invoking getAdapters()
 * twice returns two independent sets. If you want shared state across
 * invocations (e.g. for hot-reload stability), pass pre-built instances via
 * the `buckets` / `breakers` options.
 */
export function getAdapters(options: GetAdaptersOptions = {}): Record<SourceKey, Adapter> {
  const logger: AdapterLogger = options.logger ?? consoleLogger

  const out = {} as Record<SourceKey, Adapter>

  for (const source of ALL_SOURCES) {
    const config = SOURCE_CONFIGS[source]
    const bucket: TokenBucket =
      options.buckets?.[source] ??
      new TokenBucket(config.burst, config.ratePerMinute / 60)
    const breaker: CircuitBreaker =
      options.breakers?.[source] ?? new CircuitBreaker(config.circuit)

    out[source] = buildAdapter(source, config, bucket, breaker, logger)
  }

  return out
}

function buildAdapter(
  source: SourceKey,
  config: typeof SOURCE_CONFIGS[SourceKey],
  bucket: TokenBucket,
  breaker: CircuitBreaker,
  logger: AdapterLogger,
): Adapter {
  switch (source) {
    case 'reddit':
      return new RedditAdapter(config, bucket, breaker, logger)
    case 'bluesky':
      return new BlueskyAdapter(config, bucket, breaker, logger)
    case 'hn':
      return new HnAdapter(config, bucket, breaker, logger)
    case 'rss':
      return new RssAdapter(config, bucket, breaker, logger)
    case 'gdelt':
      return new GdeltAdapter(config, bucket, breaker, logger)
    case 'github':
      return new GithubAdapter(config, bucket, breaker, logger)
    case 'x':
      return new XAdapter(config, bucket, breaker, logger)
    default: {
      const exhaustive: never = source
      throw new Error(`Unknown source: ${String(exhaustive)}`)
    }
  }
}
