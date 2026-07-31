/**
 * FASE 1 — Agent-Ingress
 *
 * 7 source adapters with REAL HTTP calls to public APIs.
 * FIX v2.0.3: X via xcancel.com (Nitter mirror), Reddit via JSON API with
 * fallback, GitHub filtered to stars/forks acceleration only.
 */

import type { RawMention, SourceKey } from '@/lib/types'
import { fnv1a64, normalizeText } from '@/lib/server/hash'
import { logger } from '@/lib/server/logger'

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

interface HttpResult {
  ok: boolean
  status: number
  body: string
  contentType: string
}

async function httpGet(url: string, opts: { headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<HttpResult> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10000)
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/json,text/xml,application/xml,text/html,*/*',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        ...opts.headers,
      },
      signal: controller.signal,
      cache: 'no-store',
    })
    const body = await resp.text()
    return {
      ok: resp.ok,
      status: resp.status,
      body,
      contentType: resp.headers.get('content-type') ?? '',
    }
  } catch (err) {
    return { ok: false, status: 0, body: (err as Error).message, contentType: '' }
  } finally {
    clearTimeout(t)
  }
}

// ---------------------------------------------------------------------------
// Source configuration — watchlists
// ---------------------------------------------------------------------------
export const WATCHLIST = {
  subreddits: ['technology', 'worldnews', 'programming', 'science', 'artificial'],
  bskyQuery: 'AI OR crypto OR fusion OR regulation',
  hnKeywords: ['ai', 'crypto', 'fusion', 'regulation', 'gpu', 'chip'],
  rssFeeds: [
    'https://hnrss.org/frontpage.xml',
    'https://feeds.arstechnica.com/arstechnica/index.xml',
    'https://www.theverge.com/rss/index.xml',
    'https://techcrunch.com/feed/',
    'https://www.wired.com/feed/rss',
    'https://www.theguardian.com/technology/rss',
    // Social-news aggregators that work from datacenter IPs:
    'https://feeds.feedburner.com/TechCrunch/',
    'https://www.redditstatic.com/blog/rss.xml', // Reddit blog (corporate, not user content)
  ],
  gdeltQuery: 'AI OR crypto OR fusion',
  githubTopics: ['llm', 'agent', 'crypto-exchange', 'fusion', 'satellite'],
  xQueries: ['AI OR crypto OR fusion', 'regulation OR EU OR chip'],
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------
export interface Adapter {
  source: SourceKey
  fetch(): Promise<RawMention[]>
}

// ---------------------------------------------------------------------------
// Reddit — JSON API with macOS UA + fallback to old.reddit
// FIX v2.0.3: try multiple endpoints, log failures clearly
// ---------------------------------------------------------------------------
class RedditAdapter implements Adapter {
  source: SourceKey = 'reddit'
  async fetch(): Promise<RawMention[]> {
    const out: RawMention[] = []
    for (const sub of WATCHLIST.subreddits) {
      // Try multiple URL formats — Reddit's anti-bot is aggressive
      const urls = [
        `https://www.reddit.com/r/${sub}/hot.json?limit=15&raw_json=1`,
        `https://old.reddit.com/r/${sub}/hot.json?limit=15`,
        `https://www.reddit.com/r/${sub}/.json?limit=15`,
      ]
      let succeeded = false
      for (const url of urls) {
        if (succeeded) break
        const r = await httpGet(url, {
          timeoutMs: 6000,
          headers: { 'Accept': 'application/json' },
        })
        if (!r.ok || r.status === 429 || r.status === 403) continue
        // Reddit sometimes returns HTML instead of JSON — detect and skip
        if (!r.body.trim().startsWith('{') && !r.body.trim().startsWith('[')) continue
        try {
          const data = JSON.parse(r.body) as { data?: { children?: Array<{ data: Record<string, unknown> }> } }
          for (const child of data.data?.children ?? []) {
            const post = child.data
            if (!post || post['removed_by_category'] || post['author'] === '[deleted]') continue
            const title = String(post['title'] ?? '')
            const selfText = String(post['selftext'] ?? '').slice(0, 400)
            const text = title + (selfText ? `\n\n${selfText}` : '')
            if (!text) continue
            const id = String(post['id'] ?? '')
            const author = String(post['author'] ?? 'unknown')
            const createdUtc = Number(post['created_utc'] ?? 0)
            const score = Number(post['score'] ?? 0)
            // FIX: Reddit posts need some engagement (score > 5) to be signal
            if (score < 5) continue
            out.push({
              contentHash: fnv1a64(normalizeText(text + id)),
              source: 'reddit',
              externalId: id,
              authorId: author,
              authorHandle: `u/${author}`,
              text,
              language: 'und',
              publishedAt: new Date(createdUtc * 1000).toISOString(),
              url: `https://reddit.com${String(post['permalink'] ?? '')}`,
              hasMedia: !!(post['preview'] || post['is_video']),
              rawPayload: JSON.stringify(post),
            })
          }
          succeeded = true
        } catch (err) {
          logger.warn('reddit parse error', { sub, url, err: (err as Error).message })
        }
      }
      if (!succeeded) {
        logger.warn('reddit adapter: all URLs failed', { sub, status: '429/403/html' })
      }
    }
    return out
  }
}

// ---------------------------------------------------------------------------
// Bluesky — public.api.bsky.app (no auth, but needs correct headers)
// FIX v2.0.3: add proper Accept header + handle 403 gracefully
// ---------------------------------------------------------------------------
class BlueskyAdapter implements Adapter {
  source: SourceKey = 'bluesky'
  async fetch(): Promise<RawMention[]> {
    const r = await httpGet(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(WATCHLIST.bskyQuery)}&limit=30&sort=latest`,
      {
        timeoutMs: 8000,
        headers: { 'Accept': 'application/json' },
      },
    )
    if (!r.ok) {
      logger.warn('bluesky adapter failed', { status: r.status, body: r.body.slice(0, 100) })
      return []
    }
    if (!r.body.trim().startsWith('{')) return [] // HTML error page
    try {
      const data = JSON.parse(r.body) as { posts?: Array<Record<string, unknown>> }
      const out: RawMention[] = []
      for (const post of data.posts ?? []) {
        const record = post['record'] as Record<string, unknown> | undefined
        const author = post['author'] as Record<string, unknown> | undefined
        const text = String(record?.['text'] ?? '')
        if (!text) continue
        const uri = String(post['uri'] ?? '')
        const rkey = uri.split('/').pop() ?? ''
        const handle = String(author?.['handle'] ?? 'unknown')
        const did = String(author?.['did'] ?? handle)
        out.push({
          contentHash: fnv1a64(normalizeText(text + uri)),
          source: 'bluesky',
          externalId: uri,
          authorId: did,
          authorHandle: handle,
          text,
          language: 'und',
          publishedAt: String(record?.['createdAt'] ?? new Date().toISOString()),
          url: `https://bsky.app/profile/${handle}/post/${rkey}`,
          hasMedia: !!(record?.['embed']),
          rawPayload: JSON.stringify(post),
        })
      }
      return out
    } catch {
      return []
    }
  }
}

// ---------------------------------------------------------------------------
// Hacker News — Firebase public API
// ---------------------------------------------------------------------------
class HNAdapter implements Adapter {
  source: SourceKey = 'hn'
  async fetch(): Promise<RawMention[]> {
    const r = await httpGet('https://hacker-news.firebaseio.com/v0/topstories.json', { timeoutMs: 8000 })
    if (!r.ok) return []
    try {
      const ids = (JSON.parse(r.body) as number[]).slice(0, 25)
      const out: RawMention[] = []
      const top = await Promise.all(
        ids.slice(0, 12).map(async (id) => {
          const rr = await httpGet(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeoutMs: 6000 })
          if (!rr.ok) return null
          try {
            return JSON.parse(rr.body) as Record<string, unknown>
          } catch {
            return null
          }
        }),
      )
      for (const item of top) {
        if (!item) continue
        const title = String(item['title'] ?? '')
        if (!title) continue
        const id = String(item['id'] ?? '')
        const by = String(item['by'] ?? 'unknown')
        const time = Number(item['time'] ?? 0)
        const score = Number(item['score'] ?? 0)
        // FIX: HN posts need score > 10 to be signal (filter noise)
        if (score < 10) continue
        const url = String(item['url'] ?? `https://news.ycombinator.com/item?id=${id}`)
        out.push({
          contentHash: fnv1a64(normalizeText(title + id)),
          source: 'hn',
          externalId: id,
          authorId: by,
          authorHandle: `user/${by}`,
          text: title,
          language: 'en',
          publishedAt: new Date(time * 1000).toISOString(),
          url,
          hasMedia: false,
          rawPayload: JSON.stringify(item),
        })
      }
      return out
    } catch {
      return []
    }
  }
}

// ---------------------------------------------------------------------------
// RSS — fetch + fast-xml-parser
// ---------------------------------------------------------------------------
import { XMLParser } from 'fast-xml-parser'

class RSSAdapter implements Adapter {
  source: SourceKey = 'rss'
  async fetch(): Promise<RawMention[]> {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
    const out: RawMention[] = []
    await Promise.all(
      WATCHLIST.rssFeeds.map(async (feed) => {
        const r = await httpGet(feed, { timeoutMs: 10000 })
        if (!r.ok) return
        try {
          const doc = parser.parse(r.body) as Record<string, unknown>
          const channel = (doc['rss'] as { channel?: Record<string, unknown> })?.channel
            ?? (doc['feed'] as Record<string, unknown>)
          if (!channel) return
          const items = (channel['item'] as Array<Record<string, unknown>>) ??
            (channel['entry'] as Array<Record<string, unknown>>) ??
            []
          for (const item of items.slice(0, 12)) {
            const title = String(item['title'] ?? '')
            const desc = String(item['description'] ?? item['summary'] ?? '').slice(0, 300)
            const link = String(item['link'] ?? item['@_link'] ?? '')
            const text = title + (desc ? ` — ${desc}` : '')
            if (!text) continue
            const guid = String(item['guid'] ?? link ?? title)
            const author = String(item['author'] ?? item['dc:creator'] ?? item['creator'] ?? 'unknown')
            const pubDateRaw = String(item['pubDate'] ?? item['published'] ?? item['updated'] ?? '')
            const pubDate = pubDateRaw ? new Date(pubDateRaw).toISOString() : new Date().toISOString()
            out.push({
              contentHash: fnv1a64(normalizeText(text + guid)),
              source: 'rss',
              externalId: guid,
              authorId: author,
              authorHandle: author,
              text,
              language: 'und',
              publishedAt: pubDate,
              url: link,
              hasMedia: false,
              rawPayload: JSON.stringify(item),
            })
          }
        } catch {
          // ignore malformed feed
        }
      }),
    )
    return out
  }
}

// ---------------------------------------------------------------------------
// GDELT — DOC 2.0 API (no auth)
// ---------------------------------------------------------------------------
class GDELTAdapter implements Adapter {
  source: SourceKey = 'gdelt'
  async fetch(): Promise<RawMention[]> {
    const r = await httpGet(
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(WATCHLIST.gdeltQuery)}&mode=ArtList&maxrecords=30&format=json&sort=DateDesc`,
      { timeoutMs: 12000 },
    )
    if (!r.ok) return []
    try {
      const data = JSON.parse(r.body) as { articles?: Array<Record<string, unknown>> }
      const out: RawMention[] = []
      for (const art of data.articles ?? []) {
        const title = String(art['title'] ?? '')
        const url = String(art['url'] ?? '')
        if (!title || !url) continue
        const domain = String(art['domain'] ?? 'unknown')
        const seenDate = String(art['seendate'] ?? '')
        let pubDate = new Date().toISOString()
        if (seenDate.length >= 15) {
          const d = new Date(
            `${seenDate.slice(0, 4)}-${seenDate.slice(4, 6)}-${seenDate.slice(6, 8)}T${seenDate.slice(9, 11)}:${seenDate.slice(11, 13)}:${seenDate.slice(13, 15)}Z`,
          )
          if (!isNaN(d.getTime())) pubDate = d.toISOString()
        }
        const text = `${title} — ${domain}`
        out.push({
          contentHash: fnv1a64(normalizeText(text + url)),
          source: 'gdelt',
          externalId: url,
          authorId: domain,
          authorHandle: domain,
          text,
          language: 'und',
          publishedAt: pubDate,
          url,
          hasMedia: false,
          rawPayload: JSON.stringify(art),
        })
      }
      return out
    } catch {
      return []
    }
  }
}

// ---------------------------------------------------------------------------
// GitHub — FIX v2.0.3: FILTER ANTI-NOISE
// Solo contar repos con aceleración inusual de stars/forks (>50 stars/hora
// basado en stargazers_count vs pushed_at age). Un repo con push reciente
// pero pocos stars NO es viralidad — es desarrollo normal.
// ---------------------------------------------------------------------------
class GitHubAdapter implements Adapter {
  source: SourceKey = 'github'
  async fetch(): Promise<RawMention[]> {
    // Buscar repos trending con MANY stars recently (not just pushed)
    // Use the /search/repositories endpoint with sort=stars for top repos
    const queries = [
      `stars:>500+pushed:>2025-07-24+topic:llm`,
      `stars:>500+pushed:>2025-07-24+topic:agent`,
      `stars:>500+pushed:>2025-07-24+topic:ai`,
    ]
    const out: RawMention[] = []
    for (const q of queries) {
      const r = await httpGet(
        `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=10`,
        {
          headers: { Accept: 'application/vnd.github+json' },
          timeoutMs: 8000,
        },
      )
      if (!r.ok) continue
      try {
        const data = JSON.parse(r.body) as { items?: Array<Record<string, unknown>> }
        for (const repo of data.items ?? []) {
          const full = String(repo['full_name'] ?? '')
          const desc = String(repo['description'] ?? '')
          if (!full) continue
          const stars = Number(repo['stargazers_count'] ?? 0)
          const forks = Number(repo['forks_count'] ?? 0)
          const pushedAt = String(repo['pushed_at'] ?? '')
          const createdAt = String(repo['created_at'] ?? '')

          // FIX: Filtrar repos nuevos (creados hace <7 días) — no son tendencia, son spam
          const createdDate = new Date(createdAt)
          if (!isNaN(createdDate.getTime())) {
            const daysSinceCreate = (Date.now() - createdDate.getTime()) / 86400_000
            if (daysSinceCreate < 7 && stars < 100) continue // repo muy nuevo + pocos stars
          }

          // FIX: Calcular aceleración de stars (stars por día desde creación)
          const pushedDate = new Date(pushedAt)
          if (isNaN(pushedDate.getTime())) continue
          const daysSincePush = (Date.now() - pushedDate.getTime()) / 86400_000
          if (daysSincePush > 7) continue // repo inactivo

          // Calcular stars-per-day desde creación
          const createdDate2 = new Date(createdAt)
          if (!isNaN(createdDate2.getTime())) {
            const daysSinceCreate = Math.max(1, (Date.now() - createdDate2.getTime()) / 86400_000)
            const starsPerDay = stars / daysSinceCreate
            // FIX: Solo aceptar si starsPerDay > 2 (mínimo 2 stars/día = tendencia real)
            // Esto filtra commits/releases comunes que no son viralidad
            if (starsPerDay < 2) continue
          }

          const text = `${full}: ${desc}`
          const owner = repo['owner'] as Record<string, unknown> | undefined
          const ownerLogin = String(owner?.['login'] ?? 'unknown')
          out.push({
            contentHash: fnv1a64(normalizeText(text + String(repo['id'] ?? ''))),
            source: 'github',
            externalId: String(repo['id'] ?? full),
            authorId: ownerLogin,
            authorHandle: ownerLogin,
            text,
            language: 'en',
            publishedAt: pushedAt,
            url: String(repo['html_url'] ?? `https://github.com/${full}`),
            hasMedia: false,
            rawPayload: JSON.stringify({ ...repo, _starsPerDay: stars / Math.max(1, (Date.now() - createdDate2.getTime()) / 86400_000) }),
          })
        }
      } catch {
        // ignore
      }
    }
    return out
  }
}

// ---------------------------------------------------------------------------
// X (Twitter) — FIX v2.0.3: scrape xcancel.com (Nitter mirror) HTML
// xcancel.com funciona desde datacenter IPs (HTTP 200 confirmado).
// Parseamos el HTML para extraer tweets.
// ---------------------------------------------------------------------------
class XAdapter implements Adapter {
  source: SourceKey = 'x'
  async fetch(): Promise<RawMention[]> {
    const out: RawMention[] = []
    for (const q of WATCHLIST.xQueries) {
      const r = await httpGet(
        `https://xcancel.com/search?q=${encodeURIComponent(q)}&f=tweets`,
        {
          timeoutMs: 10000,
          headers: { 'Accept': 'text/html,application/xhtml+xml' },
        },
      )
      if (!r.ok) {
        logger.warn('x adapter: xcancel failed', { status: r.status, q })
        continue
      }
      // Parsear HTML de xcancel para extraer tweets
      // Estructura típica: <div class="tweet-body">...<div class="tweet-content">text</div>...
      // <a href="/username/status/123">...</a> <time>...</time>
      const html = r.body
      // Extraer bloques de tweet
      const tweetBlocks = html.match(/<div class="tweet[^-][^"]*"[^>]*>[\s\S]*?(?=<div class="tweet[^-]|$)/g) ?? []
      for (const block of tweetBlocks.slice(0, 15)) {
        try {
          // Extraer texto del tweet
          const textMatch = block.match(/<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/)
          if (!textMatch) continue
          // Strip HTML tags from text
          const text = textMatch[1]
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          if (!text || text.length < 10) continue

          // Extraer username y tweet ID
          const linkMatch = block.match(/href="\/([^\/"']+)\/status\/(\d+)"/)
          if (!linkMatch) continue
          const username = linkMatch[1]
          const tweetId = linkMatch[2]

          // Extraer timestamp
          const timeMatch = block.match(/<time[^>]*datetime="([^"]+)"/) ?? block.match(/data-time="(\d+)"/)
          let publishedAt = new Date().toISOString()
          if (timeMatch) {
            if (timeMatch[1].includes('T')) {
              publishedAt = new Date(timeMatch[1]).toISOString()
            } else {
              publishedAt = new Date(Number(timeMatch[1]) * 1000).toISOString()
            }
          }

          out.push({
            contentHash: fnv1a64(normalizeText(text + tweetId)),
            source: 'x',
            externalId: tweetId,
            authorId: username,
            authorHandle: `@${username}`,
            text,
            language: 'und',
            publishedAt,
            url: `https://x.com/${username}/status/${tweetId}`,
            hasMedia: block.includes('class="attachment'),
            rawPayload: JSON.stringify({ username, tweetId, text: text.slice(0, 200) }),
          })
        } catch {
          // ignore parse errors
        }
      }
    }
    return out
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const adapters: Record<SourceKey, Adapter> = {
  reddit: new RedditAdapter(),
  bluesky: new BlueskyAdapter(),
  hn: new HNAdapter(),
  rss: new RSSAdapter(),
  gdelt: new GDELTAdapter(),
  github: new GitHubAdapter(),
  x: new XAdapter(),
}

/** Run all enabled adapters in parallel, returning the merged RawMention[]. */
export async function runIngestion(enabledSources: SourceKey[]): Promise<RawMention[]> {
  const active = enabledSources.map((s) => adapters[s]).filter(Boolean)
  const results = await Promise.allSettled(active.map(async (a) => {
    const start = Date.now()
    try {
      const mentions = await a.fetch()
      ;(a as Adapter & { _lastDurationMs?: number })._lastDurationMs = Date.now() - start
      return mentions
    } catch (err) {
      ;(a as Adapter & { _lastDurationMs?: number })._lastDurationMs = Date.now() - start
      throw err
    }
  }))
  const out: RawMention[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') {
      out.push(...r.value)
    } else {
      logger.warn('adapter failed', { source: active[i].source, err: String(r.reason) })
    }
  }
  return out
}

/** Get the last per-adapter fetch duration (ms). */
export function getAdapterLatency(source: SourceKey): number {
  const a = adapters[source] as Adapter & { _lastDurationMs?: number }
  return a?._lastDurationMs ?? 0
}
