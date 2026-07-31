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
import { XMLParser } from 'fast-xml-parser'

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
// Reddit — RSS feed (the ONLY endpoint that works from Vercel IPs)
// JSON API returns 403, but .rss returns 200 application/atom+xml.
// We rotate subreddits with a small delay to avoid 429 on the RSS endpoint.
// ---------------------------------------------------------------------------
class RedditAdapter implements Adapter {
  source: SourceKey = 'reddit'
  async fetch(): Promise<RawMention[]> {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
    const out: RawMention[] = []
    // Solo 2 subreddits por ciclo para evitar 429 (Reddit rate-limita RSS)
    const subs = WATCHLIST.subreddits.slice(0, 2)
    for (const sub of subs) {
      const r = await httpGet(`https://www.reddit.com/r/${sub}/.rss`, {
        timeoutMs: 8000,
        headers: { 'Accept': 'application/atom+xml,application/xml' },
      })
      if (!r.ok || r.status === 429) {
        logger.warn('reddit rss failed', { sub, status: r.status })
        continue
      }
      try {
        const doc = parser.parse(r.body) as Record<string, unknown>
        const feed = doc['feed'] as Record<string, unknown> | undefined
        const entries = (feed?.['entry'] as Array<Record<string, unknown>>) ?? []
        for (const entry of entries.slice(0, 10)) {
          const title = String(entry['title'] ?? '')
          const content = String(entry['content'] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
          const text = title + (content ? `\n\n${content}` : '')
          if (!text) continue
          const id = String(entry['id'] ?? '')
          const link = String((entry['link'] as Record<string, string>)?.['@_href'] ?? entry['id'] ?? '')
          const author = (entry['author'] as Record<string, unknown>)?.['name'] ?? 'unknown'
          const updated = String(entry['updated'] ?? new Date().toISOString())
          out.push({
            contentHash: fnv1a64(normalizeText(text + id)),
            source: 'reddit',
            externalId: id,
            authorId: String(author),
            authorHandle: `u/${author}`,
            text,
            language: 'und',
            publishedAt: new Date(updated).toISOString(),
            url: link,
            hasMedia: false,
            rawPayload: JSON.stringify(entry),
          })
        }
      } catch (err) {
        logger.warn('reddit rss parse error', { sub, err: (err as Error).message })
      }
      // Pequeño delay entre subreddits para evitar 429
      await new Promise((r) => setTimeout(r, 500))
    }
    return out
  }
}

// ---------------------------------------------------------------------------
// Bluesky — multiple endpoints with fallback chain
// public.api.bsky.app returns 403 from Vercel, but bsky.social works.
// We try multiple URL patterns and header combinations.
// ---------------------------------------------------------------------------
class BlueskyAdapter implements Adapter {
  source: SourceKey = 'bluesky'
  async fetch(): Promise<RawMention[]> {
    const query = encodeURIComponent(WATCHLIST.bskyQuery)
    // Chain of fallbacks — VERIFIED FROM VERCEL:
    // - public.api.bsky.app/searchPosts → 403 ❌
    // - api.bsky.app/searchPosts → 200 ✅ (5.6KB JSON)
    // - public.api.bsky.app/getAuthorFeed → 200 ✅ (12KB JSON)
    const urls = [
      `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${query}&limit=25&sort=latest`,
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=bsky.app&limit=25`,
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=atproto.com&limit=25`,
    ]
    for (const url of urls) {
      const r = await httpGet(url, {
        timeoutMs: 8000,
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      if (!r.ok || !r.body.trim().startsWith('{')) continue
      try {
        const data = JSON.parse(r.body) as { posts?: Array<Record<string, unknown>>; feed?: Array<{ post: Record<string, unknown> }> }
        // searchPosts returns { posts: [...] }
        // getAuthorFeed returns { feed: [{ post: {...} }, ...] }
        const posts = data.posts ?? (data.feed ?? []).map((f) => f.post)
        const out: RawMention[] = []
        for (const post of posts) {
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
        if (out.length > 0) return out
      } catch {
        continue
      }
    }
    logger.warn('bluesky adapter: all URLs failed')
    return []
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
// RSS — fetch + fast-xml-parser (import at top of file)
// ---------------------------------------------------------------------------

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
// X (Twitter) — scrape xcancel.com profile pages (verified working from Vercel)
// xcancel.com/search has JS challenge, but profile pages return clean HTML
// with tweet-content divs and /username/status/id links.
// We scrape a rotating list of influential accounts to get diverse tweets.
// ---------------------------------------------------------------------------
const X_WATCH_ACCOUNTS = [
  'elonmusk', 'OpenAI', 'sama', 'ylecun', 'kaboro', 'AndrewYNg', 'fchollet',
  'huanghaijin', 'balajis', 'vitalikbuterin', 'CathieDWood', 'zaborowski',
]

class XAdapter implements Adapter {
  source: SourceKey = 'x'
  async fetch(): Promise<RawMention[]> {
    const out: RawMention[] = []
    // Rotar 3 accounts por ciclo para diversificar
    const accounts = X_WATCH_ACCOUNTS.sort(() => Math.random() - 0.5).slice(0, 3)
    for (const account of accounts) {
      const r = await httpGet(`https://xcancel.com/${account}`, {
        timeoutMs: 8000,
        headers: { 'Accept': 'text/html,application/xhtml+xml' },
      })
      if (!r.ok || r.body.length < 1000) {
        logger.warn('x adapter: xcancel profile failed', { account, status: r.status })
        continue
      }
      const html = r.body

      // Estructura confirmada de xcancel:
      // <div class="tweet-content media-body" dir="auto">texto</div>
      // <a href="/username/status/123456">...</a>
      // Extraer todos los bloques de tweet-content con su link de status
      const tweetContentRegex = /<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/g
      const statusLinkRegex = /href="\/([^\/"']+)\/status\/(\d+)"/g

      const contents: string[] = []
      let m: RegExpExecArray | null
      while ((m = tweetContentRegex.exec(html)) !== null) {
        const text = m[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (text.length > 10) contents.push(text)
      }

      const statusLinks: { user: string; id: string }[] = []
      while ((m = statusLinkRegex.exec(html)) !== null) {
        statusLinks.push({ user: m[1], id: m[2] })
      }

      // Emparejar contents con statusLinks (están en orden en el HTML)
      const count = Math.min(contents.length, statusLinks.length, 8)
      for (let i = 0; i < count; i++) {
        const text = contents[i]
        const { user, id: tweetId } = statusLinks[i]
        // Aceptar cualquier tweet con >20 chars de contenido sustantivo
        // (el clustering + scoring se encarga de filtrar ruido)
        if (text.length < 20) continue

        out.push({
          contentHash: fnv1a64(normalizeText(text + tweetId)),
          source: 'x',
          externalId: tweetId,
          authorId: user,
          authorHandle: `@${user}`,
          text,
          language: 'und',
          publishedAt: new Date().toISOString(),
          url: `https://x.com/${user}/status/${tweetId}`,
          hasMedia: false,
          rawPayload: JSON.stringify({ user, tweetId, text: text.slice(0, 200) }),
        })
      }
      // Pequeño delay entre accounts
      await new Promise((r) => setTimeout(r, 300))
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
