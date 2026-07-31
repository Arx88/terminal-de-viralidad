/**
 * Adapter base contract — implemented by all 7 source adapters.
 *
 * An Adapter is a stateful, single-shot-per-call fetcher: invoke `fetch()`
 * to retrieve one batch of recent mentions from the upstream source. The
 * adapter is responsible for:
 *   - rate limiting (TokenBucket)
 *   - circuit breaking (CircuitBreaker)
 *   - retrying (retryWithBackoff over the shared http helper)
 *   - normalizing the upstream payload into RawMention[]
 *   - returning native API metadata (rate limit remaining, cursors, etc.)
 *
 * Resilience semantics (enforced by every concrete adapter):
 *   - bucket rejection  → return { mentions: [], meta: { rateLimited: true } }
 *   - breaker rejection → return { mentions: [], meta: { circuitOpen: true } }
 *   - retry exhaustion  → throw RetryExhaustedError (caller handles)
 *   - success           → record breaker success, return mentions
 */
import type { RawMention, SourceKey } from '@/lib/types'

export interface AdapterFetchResult {
  mentions: RawMention[]
  /** Native API response metadata (rate limit remaining, cursor, etc). */
  meta: Record<string, unknown>
}

export interface Adapter {
  source: SourceKey
  /** Fetch one batch of mentions. Throws on unrecoverable error. */
  fetch(): Promise<AdapterFetchResult>
}

/**
 * Logger interface accepted by every adapter. Defaults to `console` so the
 * adapters can be invoked in isolation (e.g. from a CLI test harness) without
 * a full ingest pipeline wired up. In production the caller passes the
 * centralized `lib/server/ingest/log.ts` sink.
 */
export interface AdapterLogger {
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
}

/** Default logger — just delegates to console. */
export const consoleLogger: AdapterLogger = {
  info: (msg, meta) => console.info(`[adapter] ${msg}`, meta ?? {}),
  warn: (msg, meta) => console.warn(`[adapter] ${msg}`, meta ?? {}),
  error: (msg, meta) => console.error(`[adapter] ${msg}`, meta ?? {}),
}
