/**
 * Shared HTTP helper for all source adapters.
 *
 * Responsibilities:
 *   - Apply the per-source request timeout via AbortController.
 *   - Set a descriptive User-Agent (Reddit bans default fetch UAs with 429).
 *   - Add auth header from SourceConfig.requiresApiKey when the env var is set.
 *   - Parse JSON responses; fall back to raw text for non-JSON bodies.
 *   - Return a discriminated union compatible with retryWithBackoff:
 *       { ok: true;  value: T }
 *       { ok: false; status: number; body: string }
 *   - Map network/timeout errors to synthetic HTTP statuses that the retry
 *     config treats as retryable (504 for timeout, 503 for network error).
 *
 * This helper does NOT itself do retry, rate limiting, or circuit breaking —
 * those are the caller's responsibility (adapters compose all three).
 */
import type { SourceConfig } from '@/lib/server/config/sources'

/** User-Agent string used for every outbound request. */
export const VIRA_USER_AGENT = 'virahub/1.0 (+https://terminal-de-viralidad.vercel.app)'

export type HttpResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; body: string }

export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: string
  /**
   * If true, response is always parsed as JSON.
   * If false, response is always returned as raw text (cast to T).
   * If undefined, auto-detect via Content-Type + body shape.
   */
  json?: boolean
}

/**
 * Perform a single HTTP request with timeout, UA, and optional auth.
 * Never throws — all failures are encoded in the returned HttpResult.
 */
export async function httpFetch<T>(
  config: SourceConfig,
  url: string,
  options: HttpOptions = {},
): Promise<HttpResult<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)

  const headers: Record<string, string> = {
    'User-Agent': VIRA_USER_AGENT,
    Accept: options.json === false
      ? 'text/plain, application/xml, */*'
      : 'application/json, text/plain, application/xml, */*',
    ...(options.headers ?? {}),
  }

  // Auth header from SourceConfig.requiresApiKey (if env var present).
  // Adapters that need to know whether auth is configured should check the env
  // var themselves — this helper just adds the header silently when available.
  if (config.requiresApiKey) {
    const token = process.env[config.requiresApiKey.envVar]
    if (token) {
      const prefix = config.requiresApiKey.headerPrefix ?? ''
      headers[config.requiresApiKey.headerName] = `${prefix}${token}`
    }
  }

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body,
      signal: controller.signal,
      redirect: 'follow',
    })
    const text: string = await response.text()

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        body: text.slice(0, 2000),
      }
    }

    // Caller explicitly asked for raw text.
    if (options.json === false) {
      return { ok: true, value: text as unknown as T }
    }

    const contentType: string = response.headers.get('content-type') ?? ''

    // JSON by content-type or explicit request.
    if (contentType.includes('application/json') || options.json === true) {
      try {
        const parsed: unknown = JSON.parse(text)
        return { ok: true, value: parsed as T }
      } catch {
        // Server claimed JSON but body is malformed — return raw text.
        return { ok: true, value: text as unknown as T }
      }
    }

    // Auto-detect: starts with '{' or '[' → treat as JSON.
    const trimmed: string = text.trimStart()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(text)
        return { ok: true, value: parsed as T }
      } catch {
        // fall through to raw text
      }
    }

    return { ok: true, value: text as unknown as T }
  } catch (err: unknown) {
    // AbortController fires an AbortError on timeout.
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        status: 504, // synthetic Gateway Timeout — retryable
        body: `timeout after ${config.timeoutMs}ms: ${url}`,
      }
    }
    const msg: string = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      status: 503, // synthetic Service Unavailable — retryable
      body: `network error: ${msg}`,
    }
  } finally {
    clearTimeout(timer)
  }
}
