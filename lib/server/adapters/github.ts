/**
 * GitHub adapter.
 *
 * Strategy: poll the search repositories endpoint for recently-pushed repos
 * with >100 stars (a proxy for "trending OSS activity"). The doc declares
 * both REST v3 and GraphQL v4 — we use REST here because it's a single
 * well-known endpoint and requires no query compilation.
 *
 * Endpoint: GET https://api.github.com/search/repositories
 *            ?q=stars:>100+pushed:>2024-01-01&sort=updated&per_page=30
 *
 * Auth:
 *   - If process.env.GITHUB_TOKEN is set, http.ts auto-adds
 *     `Authorization: Bearer ...` → 5000 req/h.
 *   - Without a token, GitHub allows 60 req/h for search; if we hit that,
 *     GitHub returns 403 — we log + return empty (don't throw).
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
// GitHub Search API response shape (subset)
// ---------------------------------------------------------------------------
interface GhOwner {
  login: string
}

interface GhRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  updated_at: string
  stargazers_count?: number
  language?: string | null
  owner: GhOwner
}

interface GhSearchResponse {
  total_count: number
  incomplete_results: boolean
  items: GhRepo[]
}

const SEARCH_QUERY = 'stars:>100 pushed:>2024-01-01'
const PER_PAGE = 30

export class GithubAdapter implements Adapter {
  readonly source = 'github' as const
  private firstFetch = true

  constructor(
    private readonly config: SourceConfig,
    private readonly bucket: TokenBucket,
    private readonly breaker: CircuitBreaker,
    private readonly logger: AdapterLogger = consoleLogger,
  ) {}

  async fetch(): Promise<AdapterFetchResult> {
    if (this.firstFetch) {
      this.logger.info('GitHub adapter first fetch', {
        query: SEARCH_QUERY,
        perPage: PER_PAGE,
        authed: !!process.env.GITHUB_TOKEN,
      })
      this.firstFetch = false
    }

    if (!this.bucket.tryConsume(this.source)) {
      this.logger.warn('GitHub rate-limited by token bucket', {
        msUntilAvailable: this.bucket.msUntilAvailable(this.source),
      })
      return { mentions: [], meta: { rateLimited: true } }
    }
    if (!this.breaker.allow(this.source)) {
      this.logger.warn('GitHub circuit open', { state: this.breaker.status(this.source) })
      return { mentions: [], meta: { circuitOpen: true } }
    }

    const url: string =
      `${this.config.baseUrl}/search/repositories` +
      `?q=${encodeURIComponent(SEARCH_QUERY)}` +
      `&sort=updated&per_page=${PER_PAGE}`

    let response: GhSearchResponse
    try {
      response = await retryWithBackoff(
        () => httpFetch<GhSearchResponse>(this.config, url),
        this.config.retry,
        (attempt, status) => {
          if (attempt > 1) this.logger.warn('GitHub retry', { attempt, status })
        },
      )
    } catch (err: unknown) {
      // GitHub returns 403 when unauthenticated rate limit (60 req/h) is hit.
      // Per spec: log warn + return empty (don't throw).
      if (err instanceof RetryExhaustedError && err.lastStatus === 403) {
        this.breaker.recordFailure(this.source)
        this.logger.warn('GitHub 403 (rate limited without token)', {
          hint: 'Set GITHUB_TOKEN to lift from 60 req/h to 5000 req/h',
        })
        return {
          mentions: [],
          meta: { rateLimited: true, reason: 'github_403_unauthenticated' },
        }
      }
      this.breaker.recordFailure(this.source)
      throw err
    }

    this.breaker.recordSuccess(this.source)

    const items: GhRepo[] = Array.isArray(response.items) ? response.items : []
    const mentions: RawMention[] = []
    for (const repo of items) {
      if (!repo.id || !repo.owner) continue
      mentions.push(mapRepo(repo))
    }

    return {
      mentions,
      meta: {
        totalCount: response.total_count,
        incomplete: !!response.incomplete_results,
        fetched: mentions.length,
        authed: !!process.env.GITHUB_TOKEN,
      },
    }
  }
}

function mapRepo(repo: GhRepo): RawMention {
  const description: string = repo.description ?? ''
  const text: string = `${repo.full_name}: ${description}`
  const normalized: string = normalizeText(text)
  const externalId: string = String(repo.id)
  const ownerLogin: string = repo.owner.login
  return {
    contentHash: xxhash64(`${externalId}|${normalized}`),
    source: 'github',
    externalId,
    authorId: ownerLogin,
    authorHandle: ownerLogin,
    text,
    language: repo.language ?? undefined,
    publishedAt: repo.updated_at,
    url: repo.html_url,
    rawPayload: JSON.stringify(repo),
  }
}
