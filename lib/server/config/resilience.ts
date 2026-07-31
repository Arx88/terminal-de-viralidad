/**
 * Resilience layer:
 *   - TokenBucket rate limiter (per source)
 *   - CircuitBreaker (per source)
 *   - retryWithBackoff (per source config)
 *
 * All three are pure TypeScript, no external deps.
 * They are designed to drop into a Redis-backed implementation unchanged
 * (token bucket → Upstash sliding window; circuit → Redis hash; retry → no change).
 */
import type { SourceConfig } from '@/lib/server/config/sources'

// ---------------------------------------------------------------------------
// Token bucket
// ---------------------------------------------------------------------------
interface Bucket {
  tokens: number
  lastRefill: number
}

export class TokenBucket {
  private buckets = new Map<string, Bucket>()

  constructor(
    private capacity: number,
    private refillPerSecond: number,
  ) {}

  /** Returns true if a token was consumed; false if rate limited. */
  tryConsume(key: string, cost = 1): boolean {
    const now = Date.now()
    const b = this.buckets.get(key) ?? { tokens: this.capacity, lastRefill: now }
    const elapsedSec = (now - b.lastRefill) / 1000
    b.tokens = Math.min(this.capacity, b.tokens + elapsedSec * this.refillPerSecond)
    b.lastRefill = now
    if (b.tokens < cost) {
      this.buckets.set(key, b)
      return false
    }
    b.tokens -= cost
    this.buckets.set(key, b)
    return true
  }

  /** Milliseconds to wait until next token is available. */
  msUntilAvailable(key: string, cost = 1): number {
    const now = Date.now()
    const b = this.buckets.get(key)
    if (!b) return 0
    const elapsedSec = (now - b.lastRefill) / 1000
    const current = Math.min(this.capacity, b.tokens + elapsedSec * this.refillPerSecond)
    if (current >= cost) return 0
    const need = cost - current
    return Math.ceil((need / this.refillPerSecond) * 1000)
  }
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------
export type CircuitStatus = 'closed' | 'open' | 'half_open'

interface BreakerState {
  status: CircuitStatus
  failureCount: number
  successCount: number
  openedAt: number
  halfOpenProbesInflight: number
}

export class CircuitBreaker {
  private states = new Map<string, BreakerState>()

  constructor(private config: SourceConfig['circuit']) {}

  /** Throws if circuit is open. */
  allow(key: string): boolean {
    const s = this.states.get(key) ?? {
      status: 'closed' as CircuitStatus,
      failureCount: 0,
      successCount: 0,
      openedAt: 0,
      halfOpenProbesInflight: 0,
    }
    const now = Date.now()

    if (s.status === 'open') {
      if (now - s.openedAt >= this.config.cooldownMs) {
        s.status = 'half_open'
        s.halfOpenProbesInflight = 0
      } else {
        this.states.set(key, s)
        return false
      }
    }

    if (s.status === 'half_open') {
      if (s.halfOpenProbesInflight >= this.config.halfOpenProbes) {
        this.states.set(key, s)
        return false
      }
      s.halfOpenProbesInflight++
    }

    this.states.set(key, s)
    return true
  }

  recordSuccess(key: string) {
    const s = this.states.get(key)
    if (!s) return
    if (s.status === 'half_open') {
      s.successCount++
      s.halfOpenProbesInflight = Math.max(0, s.halfOpenProbesInflight - 1)
      if (s.successCount >= this.config.successThreshold) {
        s.status = 'closed'
        s.failureCount = 0
        s.successCount = 0
      }
    } else if (s.status === 'closed') {
      s.failureCount = Math.max(0, s.failureCount - 1)
    }
    this.states.set(key, s)
  }

  recordFailure(key: string) {
    const s = this.states.get(key) ?? {
      status: 'closed' as CircuitStatus,
      failureCount: 0,
      successCount: 0,
      openedAt: 0,
      halfOpenProbesInflight: 0,
    }
    if (s.status === 'half_open') {
      s.halfOpenProbesInflight = Math.max(0, s.halfOpenProbesInflight - 1)
      s.status = 'open'
      s.openedAt = Date.now()
      s.failureCount = this.config.failureThreshold
    } else {
      s.failureCount++
      if (s.failureCount >= this.config.failureThreshold) {
        s.status = 'open'
        s.openedAt = Date.now()
      }
    }
    this.states.set(key, s)
  }

  status(key: string): CircuitStatus {
    return this.states.get(key)?.status ?? 'closed'
  }
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff + jitter
// ---------------------------------------------------------------------------
export class RetryExhaustedError extends Error {
  constructor(
    message: string,
    readonly lastStatus: number | undefined,
    readonly attempts: number,
  ) {
    super(message)
    this.name = 'RetryExhaustedError'
  }
}

export async function retryWithBackoff<T>(
  fn: () => Promise<{ ok: true; value: T } | { ok: false; status: number; body: string }>,
  config: SourceConfig['retry'],
  onAttempt?: (attempt: number, status?: number) => void,
): Promise<T> {
  let lastStatus: number | undefined
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    onAttempt?.(attempt, lastStatus)
    const result = await fn()
    if (result.ok) return result.value
    lastStatus = result.status
    if (!config.retryableStatuses.includes(result.status)) {
      throw new RetryExhaustedError(
        `Non-retryable status ${result.status}: ${result.body.slice(0, 200)}`,
        result.status,
        attempt,
      )
    }
    if (attempt === config.maxAttempts) break
    const base = config.baseDelayMs * Math.pow(2, attempt - 1)
    const jitter = base * config.jitterPct * (Math.random() * 2 - 1)
    const delay = Math.max(0, base + jitter)
    await new Promise((r) => setTimeout(r, delay))
  }
  throw new RetryExhaustedError(`Exhausted ${config.maxAttempts} attempts`, lastStatus, config.maxAttempts)
}
